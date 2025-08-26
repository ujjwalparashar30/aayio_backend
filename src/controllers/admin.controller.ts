// controllers/adminController.ts
import { Request, Response } from 'express';
import { PrismaClient, QuestionStatus, TokenType, TransactionSource, PayoutStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Types and Interfaces
interface CreateQuestionRequest {
  adminId: string;
  title: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  resolutionDate: string;
  initialTokenSupply?: number;
  initialTokenPrice?: number;
  platformFeeRate?: number;
}

interface ResolveQuestionRequest {
  adminId: string;
  resolvedAnswer: boolean; // true for YES, false for NO
}

interface UpdateQuestionRequest {
  title?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  resolutionDate?: string;
  status?: QuestionStatus;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Helper function to calculate constant value
const calculateConstantValue = (initialSupply: number, initialPrice: number): number => {
  return initialSupply * initialPrice;
};

// Controllers
export const createQuestion = async (
    req: Request<{}, any, CreateQuestionRequest>,
    res: Response
  ): Promise<void> => {
    try {
      const {
        adminId,
        title,
        description,
        category,
        imageUrl,
        resolutionDate,
        initialTokenSupply = 1000,
        initialTokenPrice = 1.0,
        platformFeeRate = 0.025
      } = req.body;
  
      // Validation
      if (!adminId || !title || !resolutionDate) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: adminId, title, resolutionDate'
        });
        return;
      }
  
      // Check if admin exists
      const admin = await prisma.admin.findUnique({
        where: { id: adminId }
      });
  
      if (!admin || !admin.isActive) {
        res.status(403).json({
          success: false,
          error: 'Admin not found or not active'
        });
        return;
      }
  
      // Validate resolution date is in future
      const resDate = new Date(resolutionDate);
      if (resDate <= new Date()) {
        res.status(400).json({
          success: false,
          error: 'Resolution date must be in the future'
        });
        return;
      }
  
      // Validate token supply and price
      if (initialTokenSupply <= 0 || initialTokenPrice <= 0) {
        res.status(400).json({
          success: false,
          error: 'Initial token supply and price must be positive'
        });
        return;
      }
  
      if (platformFeeRate < 0 || platformFeeRate > 0.1) {
        res.status(400).json({
          success: false,
          error: 'Platform fee rate must be between 0 and 0.1 (10%)'
        });
        return;
      }
  
      // Calculate constant value for pricing
      const constantValue = calculateConstantValue(initialTokenSupply, initialTokenPrice);
  
      // Start database transaction
      const result = await prisma.$transaction(async (tx) => {
        // Create question
        const question = await tx.question.create({
          data: {
            title,
            description,
            category,
            imageUrl,
            resolutionDate: resDate,
            isResolved: false,
            resolvedAnswer: null,
            constantValue,
            totalYesTokens: 0,
            totalNoTokens: 0,
            currentYesPrice: initialTokenPrice,
            currentNoPrice: initialTokenPrice,
            initialTokenSupply,
            initialTokenPrice,
            collectedFees: 0,
            platformFeeRate,
            status: QuestionStatus.ACTIVE,
            createdById: adminId
          }
        });
  
        // Create YES token
        const yesToken = await tx.yesToken.create({
          data: {
            questionId: question.id,
            currentPrice: initialTokenPrice,
            availableSupply: initialTokenSupply,
            circulatingSupply: 0,
            totalVolume: 0,
            lastTradePrice: null
          }
        });
  
        // Create NO token
        const noToken = await tx.noToken.create({
          data: {
            questionId: question.id,
            currentPrice: initialTokenPrice,
            availableSupply: initialTokenSupply,
            circulatingSupply: 0,
            totalVolume: 0,
            lastTradePrice: null
          }
        });
  
        return {
          question,
          yesToken,
          noToken,
          summary: {
            questionId: question.id,
            title: question.title,
            category: question.category,
            resolutionDate: question.resolutionDate,
            initialSetup: {
              tokenSupply: initialTokenSupply,
              tokenPrice: initialTokenPrice,
              constantValue: constantValue,
              platformFeeRate: platformFeeRate
            }
          }
        };
      });
  
      const response: ApiResponse<typeof result> = {
        success: true,
        data: result
      };
  
      res.status(201).json(response);
  
    } catch (error) {
      console.error('Error creating question:', error);
      const errorResponse: ApiResponse<never> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create question'
      };
      res.status(500).json(errorResponse);
    }
  };
  

export const resolveQuestion = async (
  req: Request<{ questionId: string }, any, ResolveQuestionRequest>,
  res: Response
): Promise<void> => {
  try {
    const { questionId } = req.params;
    const { adminId, resolvedAnswer } = req.body;

    // Validation
    if (!adminId || typeof resolvedAnswer !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: adminId, resolvedAnswer'
      });
      return;
    }

    // Check admin permissions
    const admin = await prisma.admin.findUnique({
      where: { id: adminId }
    });

    if (!admin || !admin.isActive) {
      res.status(403).json({
        success: false,
        error: 'Admin not found or not active'
      });
      return;
    }

    // Start database transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get question with tokens
      const question = await tx.question.findUnique({
        where: { id: questionId },
        include: {
          yesToken: true,
          noToken: true,
          yesTokenHoldings: true,
          noTokenHoldings: true
        }
      });

      if (!question) {
        throw new Error('Question not found');
      }

      if (question.isResolved) {
        throw new Error('Question already resolved');
      }

      if (question.status !== QuestionStatus.ACTIVE) {
        throw new Error('Question is not active');
      }

      // Calculate total pool value
      const totalYesVolume = question.yesToken?.totalVolume.toNumber() || 0;
      const totalNoVolume = question.noToken?.totalVolume.toNumber() || 0;
      const totalPoolValue = totalYesVolume + totalNoVolume;

      // Calculate platform fee (total fees collected during trading)
      const platformFeeCollected = question.collectedFees.toNumber();

      // Winner pool value (total pool minus platform fees)
      const winnerPoolValue = totalPoolValue - platformFeeCollected;

      // Determine winner tokens
      const winnerTokenHoldings = resolvedAnswer ? question.yesTokenHoldings : question.noTokenHoldings;
      const totalWinnerTokens = resolvedAnswer ? question.totalYesTokens : question.totalNoTokens;

      // Calculate payout per token
      const payoutPerToken = totalWinnerTokens > 0 ? winnerPoolValue / totalWinnerTokens : 0;

      // Update question status
      await tx.question.update({
        where: { id: questionId },
        data: {
          isResolved: true,
          resolvedAnswer,
          status: QuestionStatus.RESOLVED
        }
      });

      // Create market resolution record
      const marketResolution = await tx.marketResolution.create({
        data: {
          questionId,
          resolvedAnswer,
          resolutionDate: new Date(),
          totalPoolValue,
          platformFeeCollected,
          winnerPoolValue,
          totalWinnerTokens,
          payoutPerToken
        }
      });

      // Create payout records for winners
      const payouts = [];
      for (const holding of winnerTokenHoldings) {
        const payoutAmount = holding.quantity * payoutPerToken;
        
        if (payoutAmount > 0) {
          const payout = await tx.payout.create({
            data: {
              userId: holding.userId,
              marketResolutionId: marketResolution.id,
              tokenQuantity: holding.quantity,
              payoutAmount,
              payoutStatus: PayoutStatus.PENDING
            }
          });
          payouts.push(payout);

          // Add payout to user balance
          await tx.user.update({
            where: { id: holding.userId },
            data: {
              balance: {
                increment: payoutAmount
              }
            }
          });

          // Mark payout as completed
          await tx.payout.update({
            where: { id: payout.id },
            data: {
              payoutStatus: PayoutStatus.COMPLETED
            }
          });
        }
      }

      // Update market resolution with total payouts sent
      const totalPayoutsSent = payouts.reduce((sum, payout) => sum + payout.payoutAmount.toNumber(), 0);
      await tx.marketResolution.update({
        where: { id: marketResolution.id },
        data: {
          totalPayoutsSent
        }
      });

      return {
        question,
        marketResolution,
        payouts,
        summary: {
          resolvedAnswer,
          totalPoolValue,
          platformFeeCollected,
          winnerPoolValue,
          totalWinnerTokens,
          payoutPerToken,
          totalPayoutsSent,
          winnersCount: payouts.length
        }
      };
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result
    };

    res.json(response);

  } catch (error) {
    console.error('Error resolving question:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resolve question'
    };
    res.status(500).json(errorResponse);
  }
};

export const getDashboardStats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Get overall platform statistics
    const [
      totalQuestions,
      activeQuestions,
      resolvedQuestions,
      totalUsers,
      totalTransactions,
      totalVolume,
      totalFees
    ] = await Promise.all([
      prisma.question.count(),
      prisma.question.count({ where: { status: QuestionStatus.ACTIVE } }),
      prisma.question.count({ where: { isResolved: true } }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.transaction.count(),
      prisma.transaction.aggregate({
        _sum: { totalAmount: true },
        where: { source: TransactionSource.PLATFORM_MINT }
      }),
      prisma.question.aggregate({
        _sum: { collectedFees: true }
      })
    ]);

    // Get recent questions
    const recentQuestions = await prisma.question.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        _count: {
          select: {
            yesTokenHoldings: true,
            noTokenHoldings: true
          }
        }
      }
    });

    // Get top performing questions (by volume)
    const topQuestions = await prisma.question.findMany({
      take: 5,
      include: {
        yesToken: {
          select: { totalVolume: true }
        },
        noToken: {
          select: { totalVolume: true }
        }
      },
      where: {
        status: { in: [QuestionStatus.ACTIVE, QuestionStatus.RESOLVED] }
      }
    });

    // Calculate total volume for each question and sort
    const topQuestionsByVolume = topQuestions
      .map(q => ({
        ...q,
        totalVolume: (q.yesToken?.totalVolume.toNumber() || 0) + (q.noToken?.totalVolume.toNumber() || 0)
      }))
      .sort((a, b) => b.totalVolume - a.totalVolume);

    const dashboardStats = {
      overview: {
        totalQuestions,
        activeQuestions,
        resolvedQuestions,
        totalUsers,
        totalTransactions,
        totalVolume: totalVolume._sum.totalAmount?.toNumber() || 0,
        totalFeesCollected: totalFees._sum.collectedFees?.toNumber() || 0
      },
      recentQuestions,
      topQuestions: topQuestionsByVolume
    };

    const response: ApiResponse<typeof dashboardStats> = {
      success: true,
      data: dashboardStats
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get dashboard stats'
    };
    res.status(500).json(errorResponse);
  }
};

export const getAllQuestions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { 
      status, 
      category, 
      page = '1', 
      limit = '10',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build where clause
    const whereClause: any = {};
    if (status) whereClause.status = status;
    if (category) whereClause.category = category;

    // Get questions with pagination
    const [questions, totalCount] = await Promise.all([
      prisma.question.findMany({
        where: whereClause,
        include: {
          creator: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          },
          yesToken: {
            select: {
              currentPrice: true,
              totalVolume: true,
              circulatingSupply: true
            }
          },
          noToken: {
            select: {
              currentPrice: true,
              totalVolume: true,
              circulatingSupply: true
            }
          },
          _count: {
            select: {
              yesTokenHoldings: true,
              noTokenHoldings: true
            }
          }
        },
        orderBy: {
          [sortBy as string]: sortOrder
        },
        skip,
        take
      }),
      prisma.question.count({ where: whereClause })
    ]);

    const totalPages = Math.ceil(totalCount / take);

    const adminQuestions = {
      questions,
      pagination: {
        page: parseInt(page as string),
        limit: take,
        total: totalCount,
        totalPages,
        hasNext: parseInt(page as string) < totalPages,
        hasPrev: parseInt(page as string) > 1
      }
    };

    const response: ApiResponse<typeof adminQuestions> = {
      success: true,
      data: adminQuestions
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting admin questions:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get questions'
    };
    res.status(500).json(errorResponse);
  }
};

export const updateQuestion = async (
  req: Request<{ questionId: string }, any, UpdateQuestionRequest>,
  res: Response
): Promise<void> => {
  try {
    const { questionId } = req.params;
    const updateData = req.body;

    // Remove undefined values
    const cleanUpdateData = Object.fromEntries(
      Object.entries(updateData).filter(([_, value]) => value !== undefined)
    );

    if (Object.keys(cleanUpdateData).length === 0) {
      res.status(400).json({
        success: false,
        error: 'No valid update fields provided'
      });
      return;
    }

    // Update question
    const updatedQuestion = await prisma.question.update({
      where: { id: questionId },
      data: {
        ...cleanUpdateData,
        ...(cleanUpdateData.resolutionDate && {
          resolutionDate: new Date(cleanUpdateData.resolutionDate as string)
        })
      },
      include: {
        creator: {
          select: {
            firstName: true,
            lastName: true
          }
        },
        yesToken: true,
        noToken: true
      }
    });

    const response: ApiResponse<typeof updatedQuestion> = {
      success: true,
      data: updatedQuestion
    };

    res.json(response);

  } catch (error) {
    console.error('Error updating question:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update question'
    };
    res.status(500).json(errorResponse);
  }
};

export const getQuestionStats = async (
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
        yesTokenHoldings: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        },
        noTokenHoldings: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true
              }
            }
          }
        },
        transactions: {
          where: {
            source: TransactionSource.PLATFORM_MINT
          },
          take: 10,
          orderBy: {
            createdAt: 'desc'
          }
        },
        marketResolution: {
          include: {
            payouts: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true
                  }
                }
              }
            }
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
      question,
      analytics: {
        totalHolders: question.yesTokenHoldings.length + question.noTokenHoldings.length,
        totalVolume: (question.yesToken?.totalVolume.toNumber() || 0) + 
                     (question.noToken?.totalVolume.toNumber() || 0),
        feesCollected: question.collectedFees.toNumber(),
        yesHolders: question.yesTokenHoldings.length,
        noHolders: question.noTokenHoldings.length,
        yesTokensCirculating: question.yesToken?.circulatingSupply || 0,
        noTokensCirculating: question.noToken?.circulatingSupply || 0
      }
    };

    const response: ApiResponse<typeof stats> = {
      success: true,
      data: stats
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting question stats:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get question stats'
    };
    res.status(500).json(errorResponse);
  }
};

export const getPlatformRevenue = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = new Date(startDate as string);
      if (endDate) dateFilter.createdAt.lte = new Date(endDate as string);
    }

    // Get revenue data
    const [
      totalRevenue,
      revenueByTimeframe,
      revenueByCategory
    ] = await Promise.all([
      // Total platform fees collected
      prisma.question.aggregate({
        _sum: { collectedFees: true },
        where: dateFilter.createdAt ? dateFilter : undefined
      }),
      
      // Revenue by question resolution
      prisma.marketResolution.findMany({
        select: {
          platformFeeCollected: true,
          resolutionDate: true,
          question: {
            select: {
              title: true,
              category: true
            }
          }
        },
        where: dateFilter.createdAt ? {
          resolutionDate: dateFilter.createdAt
        } : undefined,
        orderBy: {
          resolutionDate: 'desc'
        }
      }),

      // Revenue by category
      prisma.question.groupBy({
        by: ['category'],
        _sum: {
          collectedFees: true
        },
        where: dateFilter.createdAt ? dateFilter : undefined
      })
    ]);

    const revenue = {
      totalRevenue: totalRevenue._sum.collectedFees?.toNumber() || 0,
      revenueByTimeframe,
      revenueByCategory: revenueByCategory.map(item => ({
        category: item.category || 'Uncategorized',
        revenue: item._sum.collectedFees?.toNumber() || 0
      }))
    };

    const response: ApiResponse<typeof revenue> = {
      success: true,
      data: revenue
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting platform revenue:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get platform revenue'
    };
    res.status(500).json(errorResponse);
  }
};
