// controllers/tradingController.ts
import { Request, Response } from 'express';
import { TokenType, TransactionType, TransactionSource } from '@prisma/client';
import { prisma } from '../db/prisma'

// Types and Interfaces
interface BuyTokenRequest {
  userId: string;
  questionId: string;
  tokenType: TokenType;
  quantity: number;
}

interface PreviewTradeRequest {
  questionId: string;
  tokenType: TokenType;
  quantity: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Constant Product Pricing Service
class PricingService {
  static calculateBuyPrice(availableSupply: number, quantity: number, constantValue: number): number {
    // x * y = k (constant product formula)
    // newPrice = k / (availableSupply - quantity)
    const newSupply = availableSupply - quantity;
    if (newSupply <= 0) throw new Error('Insufficient token supply');
    
    return Number((constantValue / newSupply).toFixed(8));
  }

  static calculateTotalCost(availableSupply: number, quantity: number, constantValue: number): number {
    // Calculate total cost for buying 'quantity' tokens
    let totalCost = 0;
    let currentSupply = availableSupply;
    
    for (let i = 0; i < quantity; i++) {
      const price = constantValue / currentSupply;
      totalCost += price;
      currentSupply--;
    }
    
    return Number(totalCost.toFixed(8));
  }
}

// Controllers
export const buyTokenFromPlatform = async (
  req: Request<{}, any, Omit<BuyTokenRequest, 'userId'>>,
  res: Response
): Promise<void> => {
  try {
    const { questionId, tokenType, quantity } = req.body;
    const clerkUserId = req.auth?.userId;

    // Validation
    if (!clerkUserId || !questionId || !tokenType || !quantity || quantity <= 0) {
      res.status(400).json({ success: false, error: "Missing or invalid required fields" });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1) Load the DB user via Clerk user id
      const user = await tx.user.findUnique({
        where: { clerkUserId },
      });
      if (!user) {
        throw new Error('User not found');
      }
      const dbUserId = user.id;

      // 2) Load question with tokens
      const question = await tx.question.findUnique({
        where: { id: questionId },
        include: { yesToken: true, noToken: true },
      });
      if (!question || question.status !== 'ACTIVE') {
        throw new Error('Question not found or not active');
      }

      const token = tokenType === TokenType.YES ? question.yesToken : question.noToken;
      if (!token) {
        throw new Error('Token not found');
      }

      // 3) Supply check
      if (token.availableSupply < quantity) {
        throw new Error('Insufficient token supply');
      }

      // 4) Pricing
      const totalCost = PricingService.calculateTotalCost(
        token.availableSupply,
        quantity,
        question.constantValue.toNumber()
      );
      const platformFee = totalCost * question.platformFeeRate.toNumber();
      const totalAmount = totalCost + platformFee;

      // 5) Balance check
      if (user.balance.toNumber() < totalAmount) {
        throw new Error('Insufficient balance');
      }

      // 6) Deduct balance from the authenticated user
      await tx.user.update({
        where: { id: dbUserId },
        data: {
          balance: { decrement: totalAmount },
        },
      });

      // 7) Update token price/supply
      const newPrice = PricingService.calculateBuyPrice(
        token.availableSupply,
        quantity,
        question.constantValue.toNumber()
      );

      if (tokenType === TokenType.YES) {
        await tx.yesToken.update({
          where: { id: token.id },
          data: {
            availableSupply: { decrement: quantity },
            circulatingSupply: { increment: quantity },
            currentPrice: newPrice,
            totalVolume: { increment: totalCost },
            lastTradePrice: newPrice,
          },
        });

        await tx.question.update({
          where: { id: questionId },
          data: {
            totalYesTokens: { increment: quantity },
            currentYesPrice: newPrice,
            collectedFees: { increment: platformFee },
          },
        });
      } else {
        await tx.noToken.update({
          where: { id: token.id },
          data: {
            availableSupply: { decrement: quantity },
            circulatingSupply: { increment: quantity },
            currentPrice: newPrice,
            totalVolume: { increment: totalCost },
            lastTradePrice: newPrice,
          },
        });

        await tx.question.update({
          where: { id: questionId },
          data: {
            totalNoTokens: { increment: quantity },
            currentNoPrice: newPrice,
            collectedFees: { increment: platformFee },
          },
        });
      }

      // 8) Update/create holdings for the authenticated DB user
      if (tokenType === TokenType.YES) {
        const existingHolding = await tx.yesTokenHolding.findUnique({
          where: { userId_questionId: { userId: dbUserId, questionId } },
        });

        if (existingHolding) {
          const newTotalInvested = existingHolding.totalInvested.toNumber() + totalCost;
          const newQuantity = existingHolding.quantity + quantity;
          const newAveragePrice = newTotalInvested / newQuantity;

          await tx.yesTokenHolding.update({
            where: { id: existingHolding.id },
            data: {
              quantity: newQuantity,
              totalInvested: newTotalInvested,
              averageBuyPrice: newAveragePrice,
            },
          });
        } else {
          await tx.yesTokenHolding.create({
            data: {
              userId: dbUserId,
              questionId,
              quantity,
              totalInvested: totalCost,
              averageBuyPrice: totalCost / quantity,
            },
          });
        }
      } else {
        const existingHolding = await tx.noTokenHolding.findUnique({
          where: { userId_questionId: { userId: dbUserId, questionId } },
        });

        if (existingHolding) {
          const newTotalInvested = existingHolding.totalInvested.toNumber() + totalCost;
          const newQuantity = existingHolding.quantity + quantity;
          const newAveragePrice = newTotalInvested / newQuantity;

          await tx.noTokenHolding.update({
            where: { id: existingHolding.id },
            data: {
              quantity: newQuantity,
              totalInvested: newTotalInvested,
              averageBuyPrice: newAveragePrice,
            },
          });
        } else {
          await tx.noTokenHolding.create({
            data: {
              userId: dbUserId,
              questionId,
              quantity,
              totalInvested: totalCost,
              averageBuyPrice: totalCost / quantity,
            },
          });
        }
      }

      // 9) Create transaction record for the authenticated DB user
      const transaction = await tx.transaction.create({
        data: {
          userId: dbUserId,
          questionId,
          type: TransactionType.BUY,
          source: TransactionSource.PLATFORM_MINT,
          tokenType,
          quantity,
          pricePerToken: totalCost / quantity,
          totalAmount: totalCost,
          platformFee,
          status: 'COMPLETED',
        },
      });

      return { transaction, newPrice, totalCost, platformFee, totalAmount };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error buying token:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to buy token',
    });
  }
};


export const previewTrade = async (
  req: Request<{}, any, PreviewTradeRequest>,
  res: Response
): Promise<void> => {
  try {
    const { questionId, tokenType, quantity } = req.body;
    console.log("Preview trade called with:", { questionId, tokenType, quantity });
    if (!questionId || !tokenType || !quantity || quantity <= 0) {
      res.status(400).json({
        success: false,
        error: 'Missing or invalid required fields'
      });
      return;
    }

    // Get question and token data
    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        yesToken: true,
        noToken: true
      }
    });

    if (!question) {
      res.status(404).json({
        success: false,
        error: 'Question not found'
      });
      return;
    }

    const token = tokenType === TokenType.YES ? question.yesToken : question.noToken;
    if (!token) {
      res.status(404).json({
        success: false,
        error: 'Token not found'
      });
      return;
    }

    // Check available supply
    if (token.availableSupply < quantity) {
      res.status(400).json({
        success: false,
        error: 'Insufficient token supply'
      });
      return;
    }

    // Calculate pricing for BUY only
    const totalAmount = PricingService.calculateTotalCost(
      token.availableSupply,
      quantity,
      question.constantValue.toNumber()
    );
    
    const pricePerToken = totalAmount / quantity;
    const platformFee = totalAmount * question.platformFeeRate.toNumber();
    const totalCost = totalAmount + platformFee;

    const preview = {
      questionId,
      tokenType,
      quantity,
      action: 'BUY',
      pricePerToken,
      totalAmount,
      platformFee,
      totalCost,
      availableSupply: token.availableSupply,
      note: 'Users can only buy from platform. To sell tokens, use P2P trading.'
    };

    const response: ApiResponse<typeof preview> = {
      success: true,
      data: preview
    };

    res.json(response);

  } catch (error) {
    console.error('Error previewing trade:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to preview trade'
    };
    res.status(500).json(errorResponse);
  }
};

export const getTokenPrices = async (
  req: Request<{ questionId: string }>,
  res: Response
): Promise<void> => {
  try {
    const { questionId } = req.params;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        yesToken: true,
        noToken: true
      }
    });

    if (!question) {
      res.status(404).json({
        success: false,
        error: 'Question not found'
      });
      return;
    }

    const prices = {
      questionId,
      yesPrice: question.yesToken?.currentPrice.toNumber() || 0,
      noPrice: question.noToken?.currentPrice.toNumber() || 0,
      yesAvailableSupply: question.yesToken?.availableSupply || 0,
      noAvailableSupply: question.noToken?.availableSupply || 0,
      lastUpdated: question.updatedAt
    };

    const response: ApiResponse<typeof prices> = {
      success: true,
      data: prices
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting token prices:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get token prices'
    };
    res.status(500).json(errorResponse);
  }
};

export const getMarketStats = async (
  req: Request<{ questionId: string }>,
  res: Response
): Promise<void> => {
  try {
    const { questionId } = req.params;

    const question = await prisma.question.findUnique({
      where: { id: questionId },
      include: {
        yesToken: true,
        noToken: true,
        _count: {
          select: {
            yesTokenHoldings: true,
            noTokenHoldings: true
          }
        }
      }
    });

    if (!question) {
      res.status(404).json({
        success: false,
        error: 'Question not found'
      });
      return;
    }

    const stats = {
      questionId,
      totalYesTokens: question.totalYesTokens,
      totalNoTokens: question.totalNoTokens,
      yesHolders: question._count.yesTokenHoldings,
      noHolders: question._count.noTokenHoldings,
      totalVolume: (question.yesToken?.totalVolume.toNumber() || 0) + 
                   (question.noToken?.totalVolume.toNumber() || 0),
      collectedFees: question.collectedFees.toNumber(),
      yesPrice: question.yesToken?.currentPrice.toNumber() || 0,
      noPrice: question.noToken?.currentPrice.toNumber() || 0,
      yesAvailableSupply: question.yesToken?.availableSupply || 0,
      noAvailableSupply: question.noToken?.availableSupply || 0
    };

    const response: ApiResponse<typeof stats> = {
      success: true,
      data: stats
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting market stats:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get market stats'
    };
    res.status(500).json(errorResponse);
  }
};

export const getUserPortfolio = async (
  req: Request<{ userId: string }>,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;

    const [yesHoldings, noHoldings] = await Promise.all([
      prisma.yesTokenHolding.findMany({
        where: { userId },
        include: {
          question: {
            select: {
              id: true,
              title: true,
              status: true,
              currentYesPrice: true
            }
          }
        }
      }),
      prisma.noTokenHolding.findMany({
        where: { userId },
        include: {
          question: {
            select: {
              id: true,
              title: true,
              status: true,
              currentNoPrice: true
            }
          }
        }
      })
    ]);

    const portfolio = {
      userId,
      yesHoldings: yesHoldings.map(holding => ({
        ...holding,
        currentValue: holding.quantity * holding.question.currentYesPrice.toNumber(),
        unrealizedPnL: (holding.quantity * holding.question.currentYesPrice.toNumber()) - 
                      holding.totalInvested.toNumber(),
        availableToSell: holding.quantity - holding.lockedInOrders // Available for P2P selling
      })),
      noHoldings: noHoldings.map(holding => ({
        ...holding,
        currentValue: holding.quantity * holding.question.currentNoPrice.toNumber(),
        unrealizedPnL: (holding.quantity * holding.question.currentNoPrice.toNumber()) - 
                      holding.totalInvested.toNumber(),
        availableToSell: holding.quantity - holding.lockedInOrders // Available for P2P selling
      }))
    };

    const response: ApiResponse<typeof portfolio> = {
      success: true,
      data: portfolio
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting user portfolio:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get user portfolio'
    };
    res.status(500).json(errorResponse);
  }
};

export const getTradeHistory = async (
  req: Request<{ userId: string }>,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;
    const { page = '1', limit = '20' } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where: { 
          userId,
          OR: [
            { source: TransactionSource.PLATFORM_MINT },
            { source: TransactionSource.P2P_TRADE }
          ]
        },
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
      prisma.transaction.count({
        where: { 
          userId,
          OR: [
            { source: TransactionSource.PLATFORM_MINT },
            { source: TransactionSource.P2P_TRADE }
          ]
        }
      })
    ]);

    const totalPages = Math.ceil(totalCount / take);

    const history = {
      userId,
      transactions,
      pagination: {
        page: parseInt(page as string),
        limit: take,
        total: totalCount,
        totalPages,
        hasNext: parseInt(page as string) < totalPages,
        hasPrev: parseInt(page as string) > 1
      }
    };

    const response: ApiResponse<typeof history> = {
      success: true,
      data: history
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting trade history:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get trade history'
    };
    res.status(500).json(errorResponse);
  }
};
