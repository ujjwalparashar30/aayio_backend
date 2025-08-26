import { Request, Response } from 'express';
import { PrismaClient, QuestionStatus, TokenType } from '@prisma/client';

const prisma = new PrismaClient();

// Types and Interfaces
interface GetAllQuestionsQuery {
  page?: string;
  limit?: string;
  category?: string;
  status?: QuestionStatus;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface GetQuestionByIdParams {
  id: string;
}

interface GetPriceHistoryParams {
  id: string;
}

interface GetPriceHistoryQuery {
  timeframe?: '1h' | '1d' | '7d' | '30d';
  interval?: string;
}

interface GetOrderBookParams {
  id: string;
}

interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface MarketStats {
  totalParticipants: number;
  totalVolume: number;
  yesHolders: number;
  noHolders: number;
  totalYesTokens: number;
  totalNoTokens: number;
  yesPercentage: string;
  noPercentage: string;
}

interface PricePoint {
  timestamp: Date;
  yesPrice: number | null;
  noPrice: number | null;
}

interface OrderData {
  id: string;
  userId: string;
  userName: string;
  quantity: number;
  pricePerToken: number;
  totalAmount: number;
  createdAt: Date;
  expiresAt: Date | null;
}

interface OrderBook {
  yesOrders: {
    buys: OrderData[];
    sells: OrderData[];
  };
  noOrders: {
    buys: OrderData[];
    sells: OrderData[];
  };
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Controllers
export const getAllQuestions = async (
  req: Request<{}, any, any, GetAllQuestionsQuery>,
  res: Response
): Promise<void> => {
  try {
    const {
      page = '1',
      limit = '10',
      category,
      status = 'ACTIVE',
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build where clause
    const whereClause = {
      status: status as QuestionStatus,
      ...(category && { category }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } }
        ]
      })
    };

    // Build orderBy clause
    const orderByClause = {
      [sortBy]: sortOrder
    };

    // Get questions with pagination
    const [questions, totalCount] = await Promise.all([
      prisma.question.findMany({
        where: whereClause,
        orderBy: orderByClause,
        skip,
        take,
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
              circulatingSupply: true,
              totalVolume: true
            }
          },
          noToken: {
            select: {
              currentPrice: true,
              circulatingSupply: true,
              totalVolume: true
            }
          },
          _count: {
            select: {
              yesTokenHoldings: true,
              noTokenHoldings: true
            }
          }
        }
      }),
      prisma.question.count({ where: whereClause })
    ]);

    const totalPages = Math.ceil(totalCount / take);

    const paginationData: PaginationData = {
      page: parseInt(page),
      limit: take,
      total: totalCount,
      totalPages,
      hasNext: parseInt(page) < totalPages,
      hasPrev: parseInt(page) > 1
    };

    const response: ApiResponse<{ questions: typeof questions; pagination: PaginationData }> = {
      success: true,
      data: {
        questions,
        pagination: paginationData
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Error fetching questions:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch questions'
    };
    res.status(500).json(errorResponse);
  }
};

export const getQuestionById = async (
  req: Request<GetQuestionByIdParams>,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const question = await prisma.question.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true
          }
        },
        yesToken: true,
        noToken: true,
        yesTokenHoldings: {
          select: {
            quantity: true,
            averageBuyPrice: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        noTokenHoldings: {
          select: {
            quantity: true,
            averageBuyPrice: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        },
        marketResolution: true
      }
    });

    if (!question) {
      const errorResponse: ApiResponse<never> = {
        success: false,
        error: 'Question not found'
      };
      res.status(404).json(errorResponse);
      return;
    }

    // Calculate market stats
    const marketStats: MarketStats = {
      totalParticipants: question.yesTokenHoldings.length + question.noTokenHoldings.length,
      totalVolume: (question.yesToken?.totalVolume.toNumber() || 0) + (question.noToken?.totalVolume.toNumber() || 0),
      yesHolders: question.yesTokenHoldings.length,
      noHolders: question.noTokenHoldings.length,
      totalYesTokens: question.totalYesTokens,
      totalNoTokens: question.totalNoTokens,
      yesPercentage: question.totalYesTokens > 0 ? 
        ((question.totalYesTokens / (question.totalYesTokens + question.totalNoTokens)) * 100).toFixed(2) : '0',
      noPercentage: question.totalNoTokens > 0 ? 
        ((question.totalNoTokens / (question.totalYesTokens + question.totalNoTokens)) * 100).toFixed(2) : '0'
    };

    const response: ApiResponse<{ question: typeof question; marketStats: MarketStats }> = {
      success: true,
      data: {
        question,
        marketStats
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Error fetching question:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch question'
    };
    res.status(500).json(errorResponse);
  }
};

export const getQuestionPriceHistory = async (
  req: Request<GetPriceHistoryParams, any, any, GetPriceHistoryQuery>,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { timeframe = '7d', interval = '1h' } = req.query;

    // Calculate date range based on timeframe
    const now = new Date();
    let startDate: Date;
    
    switch (timeframe) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '1d':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // Get price history from transactions
    const priceHistory = await prisma.transaction.findMany({
      where: {
        questionId: id,
        createdAt: {
          gte: startDate
        },
        type: 'BUY'
      },
      orderBy: {
        createdAt: 'asc'
      },
      select: {
        pricePerToken: true,
        tokenType: true,
        createdAt: true,
        quantity: true
      }
    });

    // Group by time intervals and calculate price points
    const pricePoints: Record<string, PricePoint> = {};
    
    priceHistory.forEach(transaction => {
      const timeKey = new Date(transaction.createdAt).toISOString().slice(0, 16); // minute precision
      
      if (!pricePoints[timeKey]) {
        pricePoints[timeKey] = {
          timestamp: transaction.createdAt,
          yesPrice: null,
          noPrice: null
        };
      }
      
      if (transaction.tokenType === TokenType.YES) {
        pricePoints[timeKey].yesPrice = transaction.pricePerToken.toNumber();
      } else {
        pricePoints[timeKey].noPrice = transaction.pricePerToken.toNumber();
      }
    });

    // Convert to array and fill missing prices
    const sortedPriceHistory = Object.values(pricePoints).sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Forward fill missing prices
    let lastYesPrice: number | null = null;
    let lastNoPrice: number | null = null;
    
    sortedPriceHistory.forEach(point => {
      if (point.yesPrice) lastYesPrice = point.yesPrice;
      if (point.noPrice) lastNoPrice = point.noPrice;
      
      if (!point.yesPrice && lastYesPrice) point.yesPrice = lastYesPrice;
      if (!point.noPrice && lastNoPrice) point.noPrice = lastNoPrice;
    });

    const response: ApiResponse<{ priceHistory: PricePoint[]; timeframe: string; interval: string }> = {
      success: true,
      data: {
        priceHistory: sortedPriceHistory,
        timeframe,
        interval
      }
    };

    res.json(response);

  } catch (error) {
    console.error('Error fetching price history:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch price history'
    };
    res.status(500).json(errorResponse);
  }
};

export const getQuestionOrderBook = async (
  req: Request<GetOrderBookParams>,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    // Get all active P2P orders for this question
    const p2pOrders = await prisma.p2POrder.findMany({
      where: {
        questionId: id,
        status: 'PENDING',
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
    const orderBook: OrderBook = {
      yesOrders: {
        buys: [],
        sells: []
      },
      noOrders: {
        buys: [],
        sells: []
      }
    };

    p2pOrders.forEach(order => {
      const orderData: OrderData = {
        id: order.id,
        userId: order.userId,
        userName: `${order.user.firstName || ''} ${order.user.lastName || ''}`.trim(),
        quantity: order.remainingQuantity,
        pricePerToken: order.pricePerToken.toNumber(),
        totalAmount: order.pricePerToken.toNumber() * order.remainingQuantity,
        createdAt: order.createdAt,
        expiresAt: order.expiresAt
      };

      if (order.tokenType === TokenType.YES) {
        if (order.orderType === 'BUY') {
          orderBook.yesOrders.buys.push(orderData);
        } else {
          orderBook.yesOrders.sells.push(orderData);
        }
      } else {
        if (order.orderType === 'BUY') {
          orderBook.noOrders.buys.push(orderData);
        } else {
          orderBook.noOrders.sells.push(orderData);
        }
      }
    });

    // Sort orders properly
    orderBook.yesOrders.buys.sort((a, b) => b.pricePerToken - a.pricePerToken);
    orderBook.yesOrders.sells.sort((a, b) => a.pricePerToken - b.pricePerToken);
    orderBook.noOrders.buys.sort((a, b) => b.pricePerToken - a.pricePerToken);
    orderBook.noOrders.sells.sort((a, b) => a.pricePerToken - b.pricePerToken);

    const response: ApiResponse<OrderBook> = {
      success: true,
      data: orderBook
    };

    res.json(response);

  } catch (error) {
    console.error('Error fetching order book:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to fetch order book'
    };
    res.status(500).json(errorResponse);
  }
};