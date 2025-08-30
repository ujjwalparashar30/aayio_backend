// controllers/p2pController.ts
import { Request, Response } from 'express';
import { TokenType, P2POrderType, P2POrderStatus, TransactionType, TransactionSource } from '@prisma/client';
import { prisma } from '../db/prisma'

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
  req: Request<{}, any, Omit<CreateP2POrderRequest, 'userId'>>,
  res: Response
): Promise<void> => {
  try {
    const { questionId, orderType, tokenType, quantity, pricePerToken, expiresAt } = req.body;
    const clerkUserId = req.auth?.userId; // Get from authenticated token

    // Validation
    if (!clerkUserId || !questionId || !orderType || !tokenType || !quantity || !pricePerToken) {
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
      // 1. Map Clerk ID to internal ID
      const user = await tx.user.findUnique({
        where: { clerkUserId: clerkUserId },
        select: { id: true }
      });

      if (!user) {
        throw new Error('User not found');
      }

      const internalUserId = user.id;

      // Get full user data with internal ID
      const fullUser = await tx.user.findUnique({
        where: { id: internalUserId }
      });

      if (!fullUser) {
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
        if (fullUser.balance.toNumber() < totalAmount) {
          throw new Error('Insufficient balance');
        }

        // Lock balance in escrow
        await tx.user.update({
          where: { id: internalUserId }, // Use internal ID
          data: {
            balance: { decrement: totalAmount },
            p2pEscrowBalance: { increment: totalAmount }
          }
        });
      } else {
        // SELL ORDER: User wants to sell their tokens
        let userHolding;
        if (tokenType === TokenType.YES) {
          userHolding = await tx.yesTokenHolding.findUnique({
            where: {
              userId_questionId: {
                userId: internalUserId, // Use internal ID
                questionId
              }
            }
          });
        } else {
          userHolding = await tx.noTokenHolding.findUnique({
            where: {
              userId_questionId: {
                userId: internalUserId, // Use internal ID
                questionId
              }
            }
          });
        }

        if (!userHolding || userHolding.quantity < quantity) {
          throw new Error('Insufficient token holdings');
        }

        const availableTokens = userHolding.quantity - userHolding.lockedInOrders;
        if (availableTokens < quantity) {
          throw new Error('Insufficient available tokens (some may be locked in other orders)');
        }

        // Lock tokens
        if (tokenType === TokenType.YES) {
          await tx.yesTokenHolding.update({
            where: { id: userHolding.id },
            data: { lockedInOrders: { increment: quantity } }
          });
        } else {
          await tx.noTokenHolding.update({
            where: { id: userHolding.id },
            data: { lockedInOrders: { increment: quantity } }
          });
        }
      }

      // Create P2P order with internal ID
      const order = await tx.p2POrder.create({
        data: {
          userId: internalUserId, // Use internal ID
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
  req: Request<{ orderId: string }, any, Omit<MatchOrderRequest, 'buyerUserId'>>,
  res: Response
): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { quantity } = req.body;
    const clerkUserId = req.auth?.userId; // Get buyer from auth token

    // Validation
    if (!clerkUserId || !quantity || quantity <= 0) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields or invalid quantity'
      });
      return;
    }

    // Start database transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Map Clerk ID to internal ID for buyer
      const buyerUser = await tx.user.findUnique({
        where: { clerkUserId: clerkUserId },
        select: { id: true }
      });

      if (!buyerUser) {
        throw new Error('Buyer not found');
      }

      const buyerUserId = buyerUser.id; // Internal ID

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

      // Get buyer with internal ID
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

      // Transfer money from buyer to seller (both using internal IDs)
      await tx.user.update({
        where: { id: buyerUserId },
        data: { balance: { decrement: totalCost } }
      });

      await tx.user.update({
        where: { id: sellOrder.userId }, // sellOrder.userId is already internal ID
        data: { balance: { increment: totalCost } }
      });

      // Transfer tokens logic remains the same (already uses internal IDs)
      if (sellOrder.tokenType === TokenType.YES) {
        // Update seller holdings
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
          await tx.yesTokenHolding.delete({
            where: { id: sellerHolding.id }
          });
        } else {
          await tx.yesTokenHolding.update({
            where: { id: sellerHolding.id },
            data: {
              quantity: { decrement: quantity },
              lockedInOrders: { decrement: quantity }
            }
          });
        }

        // Update or create buyer holdings
        const buyerHolding = await tx.yesTokenHolding.findUnique({
          where: {
            userId_questionId: {
              userId: buyerUserId, // Use internal ID
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
              userId: buyerUserId, // Use internal ID
              questionId: sellOrder.questionId,
              quantity,
              totalInvested: totalCost,
              averageBuyPrice: sellOrder.pricePerToken.toNumber()
            }
          });
        }
      } else {
        // Similar logic for NO tokens (same pattern)
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
              quantity: { decrement: quantity },
              lockedInOrders: { decrement: quantity }
            }
          });
        }

        const buyerHolding = await tx.noTokenHolding.findUnique({
          where: {
            userId_questionId: {
              userId: buyerUserId, // Use internal ID
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
              userId: buyerUserId, // Use internal ID
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

      // Create transaction records (using internal IDs)
      const [sellerTransaction, buyerTransaction] = await Promise.all([
        tx.transaction.create({
          data: {
            userId: sellOrder.userId, // Already internal ID
            questionId: sellOrder.questionId,
            type: TransactionType.SELL,
            source: TransactionSource.P2P_TRADE,
            tokenType: sellOrder.tokenType,
            quantity,
            pricePerToken: sellOrder.pricePerToken,
            totalAmount: totalCost,
            p2pOrderId: orderId,
            counterpartyId: buyerUserId, // Internal ID
            status: 'COMPLETED'
          }
        }),
        tx.transaction.create({
          data: {
            userId: buyerUserId, // Internal ID
            questionId: sellOrder.questionId,
            type: TransactionType.BUY,
            source: TransactionSource.P2P_TRADE,
            tokenType: sellOrder.tokenType,
            quantity,
            pricePerToken: sellOrder.pricePerToken,
            totalAmount: totalCost,
            p2pOrderId: orderId,
            counterpartyId: sellOrder.userId, // Already internal ID
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
    const clerkUserId = req.auth?.userId; // Get from authenticated session

    // Check authentication
    if (!clerkUserId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized - Authentication required'
      });
      return;
    }

    // Map Clerk ID to internal ID
    const user = await prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
      return;
    }

    const internalUserId = user.id;

    // Start database transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get order and verify it exists
      const order = await tx.p2POrder.findUnique({
        where: { id: orderId },
        include: {
          question: {
            select: {
              id: true,
              title: true,
              status: true
            }
          }
        }
      });

      if (!order) {
        throw new Error('Order not found');
      }

      // Verify ownership - user can only cancel their own orders
      if (order.userId !== internalUserId) {
        throw new Error('Access denied: You can only cancel your own orders');
      }

      // Check if order can be cancelled
      if (order.status === P2POrderStatus.FILLED) {
        throw new Error('Cannot cancel a filled order');
      }

      if (order.status === P2POrderStatus.CANCELLED) {
        throw new Error('Order is already cancelled');
      }

      // Only allow cancelling PENDING and PARTIALLY_FILLED orders
      if (order.status !== P2POrderStatus.PENDING && order.status !== P2POrderStatus.PARTIALLY_FILLED) {
        throw new Error('Order cannot be cancelled in its current state');
      }

      if (order.orderType === P2POrderType.BUY) {
        // BUY ORDER CANCELLATION
        // Release escrowed balance back to available balance
        const remainingAmount = order.remainingQuantity * order.pricePerToken.toNumber();

        await tx.user.update({
          where: { id: internalUserId },
          data: {
            balance: {
              increment: remainingAmount
            },
            p2pEscrowBalance: {
              decrement: remainingAmount
            }
          }
        });

        console.log(`💰 Released ₹${remainingAmount} from escrow back to user balance`);

      } else {
        // SELL ORDER CANCELLATION
        // Release locked tokens back to available holdings
        if (order.tokenType === TokenType.YES) {
          const holding = await tx.yesTokenHolding.findUnique({
            where: {
              userId_questionId: {
                userId: internalUserId,
                questionId: order.questionId
              }
            }
          });

          if (!holding) {
            throw new Error('Token holding not found - cannot release locked tokens');
          }

          await tx.yesTokenHolding.update({
            where: { id: holding.id },
            data: {
              lockedInOrders: {
                decrement: order.remainingQuantity
              }
            }
          });

        } else { // NO tokens
          const holding = await tx.noTokenHolding.findUnique({
            where: {
              userId_questionId: {
                userId: internalUserId,
                questionId: order.questionId
              }
            }
          });

          if (!holding) {
            throw new Error('Token holding not found - cannot release locked tokens');
          }

          await tx.noTokenHolding.update({
            where: { id: holding.id },
            data: {
              lockedInOrders: {
                decrement: order.remainingQuantity
              }
            }
          });
        }

        console.log(`🎯 Released ${order.remainingQuantity} ${order.tokenType} tokens from locked status`);
      }

      // Update order status to CANCELLED
      const cancelledOrder = await tx.p2POrder.update({
        where: { id: orderId },
        data: {
          status: P2POrderStatus.CANCELLED,
          updatedAt: new Date()
        },
        include: {
          question: {
            select: {
              id: true,
              title: true
            }
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

      return {
        ...cancelledOrder,
        message: `Order cancelled successfully. ${
          order.orderType === P2POrderType.BUY 
            ? `₹${(order.remainingQuantity * order.pricePerToken.toNumber()).toLocaleString()} released from escrow.`
            : `${order.remainingQuantity} ${order.tokenType} tokens unlocked.`
        }`
      };
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result
    };

    res.json(response);

    console.log(`✅ Order ${orderId} cancelled successfully by user ${clerkUserId}`);

  } catch (error) {
    console.error('❌ Error cancelling order:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel order'
    };
    
    // Return appropriate status codes
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse);
      } else if (error.message.includes('Access denied') || error.message.includes('only cancel')) {
        res.status(403).json(errorResponse);
      } else if (error.message.includes('cannot be cancelled') || error.message.includes('already cancelled')) {
        res.status(400).json(errorResponse);
      } else {
        res.status(500).json(errorResponse);
      }
    } else {
      res.status(500).json(errorResponse);
    }
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
    const { userId: clerkUserId } = req.params;
    const { status, page = '1', limit = '20' } = req.query;

    // 1. Map Clerk ID to internal ID
    const user = await prisma.user.findUnique({
      where: { clerkUserId: clerkUserId },
      select: { id: true }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
      return;
    }

    const internalUserId = user.id;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const whereClause: any = {
      userId: internalUserId // Use internal ID
    };

    if (status) {
      whereClause.status = status;
    }

    // 2. Query using internal ID
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
      userId: clerkUserId, // Return Clerk ID to frontend
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
