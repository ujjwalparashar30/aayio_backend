// controllers/p2pController.ts
import { Request, Response } from 'express';
import { PrismaClient, TokenType, P2POrderType, P2POrderStatus, TransactionType, TransactionSource } from '@prisma/client';

const prisma = new PrismaClient();

// Types and Interfaces
interface CreateP2POrderRequest {
  userId: string;
  questionId: string;
  orderType: P2POrderType;
  tokenType: TokenType;
  quantity: number;
  pricePerToken: number;
  expiresAt?: string;
}

interface MatchOrderRequest {
  buyerUserId: string;
  quantity: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Controllers
export const createP2POrder = async (
  req: Request<{}, any, CreateP2POrderRequest>,
  res: Response
): Promise<void> => {
  try {
    const { userId, questionId, orderType, tokenType, quantity, pricePerToken, expiresAt } = req.body;

    // Validation
    if (!userId || !questionId || !orderType || !tokenType || !quantity || !pricePerToken) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
      return;
    }

    if (quantity <= 0 || pricePerToken <= 0) {
      res.status(400).json({
        success: false,
        error: 'Quantity and price must be positive'
      });
      return;
    }

    // Start database transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get user
      const user = await tx.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Get question
      const question = await tx.question.findUnique({
        where: { id: questionId }
      });

      if (!question || question.status !== 'ACTIVE') {
        throw new Error('Question not found or not active');
      }

      const totalAmount = quantity * pricePerToken;

      if (orderType === P2POrderType.BUY) {
        // BUY ORDER: User wants to buy tokens from other users
        // Check if user has enough balance
        if (user.balance.toNumber() < totalAmount) {
          throw new Error('Insufficient balance');
        }

        // Lock balance in escrow
        await tx.user.update({
          where: { id: userId },
          data: {
            balance: {
              decrement: totalAmount
            },
            p2pEscrowBalance: {
              increment: totalAmount
            }
          }
        });
      } else {
        // SELL ORDER: User wants to sell their tokens to other users
        // Check if user has enough tokens
        let userHolding;
        if (tokenType === TokenType.YES) {
          userHolding = await tx.yesTokenHolding.findUnique({
            where: {
              userId_questionId: {
                userId,
                questionId
              }
            }
          });
        } else {
          userHolding = await tx.noTokenHolding.findUnique({
            where: {
              userId_questionId: {
                userId,
                questionId
              }
            }
          });
        }

        if (!userHolding || userHolding.quantity < quantity) {
          throw new Error('Insufficient token holdings');
        }

        // Check available tokens (not locked in other orders)
        const availableTokens = userHolding.quantity - userHolding.lockedInOrders;
        if (availableTokens < quantity) {
          throw new Error('Insufficient available tokens (some may be locked in other orders)');
        }

        // Lock tokens
        if (tokenType === TokenType.YES) {
          await tx.yesTokenHolding.update({
            where: { id: userHolding.id },
            data: {
              lockedInOrders: {
                increment: quantity
              }
            }
          });
        } else {
          await tx.noTokenHolding.update({
            where: { id: userHolding.id },
            data: {
              lockedInOrders: {
                increment: quantity
              }
            }
          });
        }
      }

      // Create P2P order
      const order = await tx.p2POrder.create({
        data: {
          userId,
          questionId,
          orderType,
          tokenType,
          quantity,
          pricePerToken,
          totalAmount,
          remainingQuantity: quantity,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          status: P2POrderStatus.PENDING
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          question: {
            select: {
              id: true,
              title: true
            }
          }
        }
      });

      return order;
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result
    };

    res.json(response);

  } catch (error) {
    console.error('Error creating P2P order:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create P2P order'
    };
    res.status(500).json(errorResponse);
  }
};

export const matchOrder = async (
  req: Request<{ orderId: string }, any, MatchOrderRequest>,
  res: Response
): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { buyerUserId, quantity } = req.body;

    // Validation
    if (!buyerUserId || !quantity || quantity <= 0) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields or invalid quantity'
      });
      return;
    }

    // Start database transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get the sell order
      const sellOrder = await tx.p2POrder.findUnique({
        where: { id: orderId },
        include: {
          user: true,
          question: true
        }
      });

      if (!sellOrder) {
        throw new Error('Order not found');
      }

      if (sellOrder.status !== P2POrderStatus.PENDING) {
        throw new Error('Order is not available for matching');
      }

      if (sellOrder.orderType !== P2POrderType.SELL) {
        throw new Error('Can only match with sell orders');
      }

      if (sellOrder.userId === buyerUserId) {
        throw new Error('Cannot buy from yourself');
      }

      if (quantity > sellOrder.remainingQuantity) {
        throw new Error('Requested quantity exceeds available quantity');
      }

      // Get buyer
      const buyer = await tx.user.findUnique({
        where: { id: buyerUserId }
      });

      if (!buyer) {
        throw new Error('Buyer not found');
      }

      const totalCost = quantity * sellOrder.pricePerToken.toNumber();

      // Check buyer balance
      if (buyer.balance.toNumber() < totalCost) {
        throw new Error('Buyer has insufficient balance');
      }

      // Transfer money from buyer to seller
      await tx.user.update({
        where: { id: buyerUserId },
        data: {
          balance: {
            decrement: totalCost
          }
        }
      });

      await tx.user.update({
        where: { id: sellOrder.userId },
        data: {
          balance: {
            increment: totalCost
          }
        }
      });

      // Transfer tokens from seller to buyer
      if (sellOrder.tokenType === TokenType.YES) {
        // Update seller holdings (reduce locked and quantity)
        const sellerHolding = await tx.yesTokenHolding.findUnique({
          where: {
            userId_questionId: {
              userId: sellOrder.userId,
              questionId: sellOrder.questionId
            }
          }
        });

        if (!sellerHolding) {
          throw new Error('Seller token holding not found');
        }

        if (sellerHolding.quantity === quantity) {
          // Delete holding if selling all tokens
          await tx.yesTokenHolding.delete({
            where: { id: sellerHolding.id }
          });
        } else {
          await tx.yesTokenHolding.update({
            where: { id: sellerHolding.id },
            data: {
              quantity: {
                decrement: quantity
              },
              lockedInOrders: {
                decrement: quantity
              }
            }
          });
        }

        // Update or create buyer holdings
        const buyerHolding = await tx.yesTokenHolding.findUnique({
          where: {
            userId_questionId: {
              userId: buyerUserId,
              questionId: sellOrder.questionId
            }
          }
        });

        if (buyerHolding) {
          const newTotalInvested = buyerHolding.totalInvested.toNumber() + totalCost;
          const newQuantity = buyerHolding.quantity + quantity;
          const newAveragePrice = newTotalInvested / newQuantity;

          await tx.yesTokenHolding.update({
            where: { id: buyerHolding.id },
            data: {
              quantity: newQuantity,
              totalInvested: newTotalInvested,
              averageBuyPrice: newAveragePrice
            }
          });
        } else {
          await tx.yesTokenHolding.create({
            data: {
              userId: buyerUserId,
              questionId: sellOrder.questionId,
              quantity,
              totalInvested: totalCost,
              averageBuyPrice: sellOrder.pricePerToken.toNumber()
            }
          });
        }
      } else {
        // Similar logic for NO tokens
        const sellerHolding = await tx.noTokenHolding.findUnique({
          where: {
            userId_questionId: {
              userId: sellOrder.userId,
              questionId: sellOrder.questionId
            }
          }
        });

        if (!sellerHolding) {
          throw new Error('Seller token holding not found');
        }

        if (sellerHolding.quantity === quantity) {
          await tx.noTokenHolding.delete({
            where: { id: sellerHolding.id }
          });
        } else {
          await tx.noTokenHolding.update({
            where: { id: sellerHolding.id },
            data: {
              quantity: {
                decrement: quantity
              },
              lockedInOrders: {
                decrement: quantity
              }
            }
          });
        }

        const buyerHolding = await tx.noTokenHolding.findUnique({
          where: {
            userId_questionId: {
              userId: buyerUserId,
              questionId: sellOrder.questionId
            }
          }
        });

        if (buyerHolding) {
          const newTotalInvested = buyerHolding.totalInvested.toNumber() + totalCost;
          const newQuantity = buyerHolding.quantity + quantity;
          const newAveragePrice = newTotalInvested / newQuantity;

          await tx.noTokenHolding.update({
            where: { id: buyerHolding.id },
            data: {
              quantity: newQuantity,
              totalInvested: newTotalInvested,
              averageBuyPrice: newAveragePrice
            }
          });
        } else {
          await tx.noTokenHolding.create({
            data: {
              userId: buyerUserId,
              questionId: sellOrder.questionId,
              quantity,
              totalInvested: totalCost,
              averageBuyPrice: sellOrder.pricePerToken.toNumber()
            }
          });
        }
      }

      // Update order status
      const newRemainingQuantity = sellOrder.remainingQuantity - quantity;
      const newFilledQuantity = sellOrder.filledQuantity + quantity;
      
      // CORRECT ✅
    let newStatus: P2POrderStatus = P2POrderStatus.PARTIALLY_FILLED;

      if (newRemainingQuantity === 0) {
        newStatus = P2POrderStatus.FILLED;
      }

      await tx.p2POrder.update({
        where: { id: orderId },
        data: {
          remainingQuantity: newRemainingQuantity,
          filledQuantity: newFilledQuantity,
          status: newStatus,
          executedAt: newStatus === P2POrderStatus.FILLED ? new Date() : undefined
        }
      });

      // Create transaction records
      const [sellerTransaction, buyerTransaction] = await Promise.all([
        // Seller transaction (SELL)
        tx.transaction.create({
          data: {
            userId: sellOrder.userId,
            questionId: sellOrder.questionId,
            type: TransactionType.SELL,
            source: TransactionSource.P2P_TRADE,
            tokenType: sellOrder.tokenType,
            quantity,
            pricePerToken: sellOrder.pricePerToken,
            totalAmount: totalCost,
            p2pOrderId: orderId,
            counterpartyId: buyerUserId,
            status: 'COMPLETED'
          }
        }),
        // Buyer transaction (BUY)
        tx.transaction.create({
          data: {
            userId: buyerUserId,
            questionId: sellOrder.questionId,
            type: TransactionType.BUY,
            source: TransactionSource.P2P_TRADE,
            tokenType: sellOrder.tokenType,
            quantity,
            pricePerToken: sellOrder.pricePerToken,
            totalAmount: totalCost,
            p2pOrderId: orderId,
            counterpartyId: sellOrder.userId,
            status: 'COMPLETED'
          }
        })
      ]);

      return {
        orderId,
        quantity,
        pricePerToken: sellOrder.pricePerToken.toNumber(),
        totalCost,
        orderStatus: newStatus,
        remainingQuantity: newRemainingQuantity,
        transactions: {
          seller: sellerTransaction,
          buyer: buyerTransaction
        }
      };
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result
    };

    res.json(response);

  } catch (error) {
    console.error('Error matching order:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to match order'
    };
    res.status(500).json(errorResponse);
  }
};

export const cancelOrder = async (
  req: Request<{ orderId: string }>,
  res: Response
): Promise<void> => {
  try {
    const { orderId } = req.params;

    // Start database transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get order
      const order = await tx.p2POrder.findUnique({
        where: { id: orderId }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status === P2POrderStatus.FILLED || order.status === P2POrderStatus.CANCELLED) {
        throw new Error('Order cannot be cancelled');
      }

      if (order.orderType === P2POrderType.BUY) {
        // Release escrowed balance
        const remainingAmount = order.remainingQuantity * order.pricePerToken.toNumber();
        
        await tx.user.update({
          where: { id: order.userId },
          data: {
            balance: {
              increment: remainingAmount
            },
            p2pEscrowBalance: {
              decrement: remainingAmount
            }
          }
        });
      } else {
        // Release locked tokens
        if (order.tokenType === TokenType.YES) {
          await tx.yesTokenHolding.update({
            where: {
              userId_questionId: {
                userId: order.userId,
                questionId: order.questionId
              }
            },
            data: {
              lockedInOrders: {
                decrement: order.remainingQuantity
              }
            }
          });
        } else {
          await tx.noTokenHolding.update({
            where: {
              userId_questionId: {
                userId: order.userId,
                questionId: order.questionId
              }
            },
            data: {
              lockedInOrders: {
                decrement: order.remainingQuantity
              }
            }
          });
        }
      }

      // Update order status
      const cancelledOrder = await tx.p2POrder.update({
        where: { id: orderId },
        data: {
          status: P2POrderStatus.CANCELLED,
          updatedAt: new Date()
        }
      });

      return cancelledOrder;
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result
    };

    res.json(response);

  } catch (error) {
    console.error('Error cancelling order:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel order'
    };
    res.status(500).json(errorResponse);
  }
};

export const getOrderBook = async (
  req: Request<{ questionId: string }>,
  res: Response
): Promise<void> => {
  try {
    const { questionId } = req.params;

    // Get all active orders for this question
    const orders = await prisma.p2POrder.findMany({
      where: {
        questionId,
        status: P2POrderStatus.PENDING,
        remainingQuantity: {
          gt: 0
        }
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        }
      },
      orderBy: [
        { tokenType: 'asc' },
        { pricePerToken: 'desc' }
      ]
    });

    // Separate orders by token type and order type
    const orderBook = {
      yesOrders: {
        buys: orders.filter(o => o.tokenType === TokenType.YES && o.orderType === P2POrderType.BUY),
        sells: orders.filter(o => o.tokenType === TokenType.YES && o.orderType === P2POrderType.SELL)
      },
      noOrders: {
        buys: orders.filter(o => o.tokenType === TokenType.NO && o.orderType === P2POrderType.BUY),
        sells: orders.filter(o => o.tokenType === TokenType.NO && o.orderType === P2POrderType.SELL)
      }
    };

    // Sort orders properly (highest buy prices first, lowest sell prices first)
    orderBook.yesOrders.buys.sort((a, b) => b.pricePerToken.toNumber() - a.pricePerToken.toNumber());
    orderBook.yesOrders.sells.sort((a, b) => a.pricePerToken.toNumber() - b.pricePerToken.toNumber());
    orderBook.noOrders.buys.sort((a, b) => b.pricePerToken.toNumber() - a.pricePerToken.toNumber());
    orderBook.noOrders.sells.sort((a, b) => a.pricePerToken.toNumber() - b.pricePerToken.toNumber());

    const response: ApiResponse<typeof orderBook> = {
      success: true,
      data: orderBook
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting order book:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get order book'
    };
    res.status(500).json(errorResponse);
  }
};

export const getUserOrders = async (
  req: Request<{ userId: string }>,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;
    const { status, page = '1', limit = '20' } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const whereClause: any = {
      userId
    };

    if (status) {
      whereClause.status = status;
    }

    const [orders, totalCount] = await Promise.all([
      prisma.p2POrder.findMany({
        where: whereClause,
        include: {
          question: {
            select: {
              id: true,
              title: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip,
        take
      }),
      prisma.p2POrder.count({
        where: whereClause
      })
    ]);

    const totalPages = Math.ceil(totalCount / take);

    const userOrders = {
      userId,
      orders,
      pagination: {
        page: parseInt(page as string),
        limit: take,
        total: totalCount,
        totalPages,
        hasNext: parseInt(page as string) < totalPages,
        hasPrev: parseInt(page as string) > 1
      }
    };

    const response: ApiResponse<typeof userOrders> = {
      success: true,
      data: userOrders
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting user orders:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get user orders'
    };
    res.status(500).json(errorResponse);
  }
};

export const getOrderDetails = async (
  req: Request<{ orderId: string }>,
  res: Response
): Promise<void> => {
  try {
    const { orderId } = req.params;

    const order = await prisma.p2POrder.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        question: {
          select: {
            id: true,
            title: true,
            status: true
          }
        },
        transactions: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      }
    });

    if (!order) {
      res.status(404).json({
        success: false,
        error: 'Order not found'
      });
      return;
    }

    const response: ApiResponse<typeof order> = {
      success: true,
      data: order
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting order details:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get order details'
    };
    res.status(500).json(errorResponse);
  }
};
