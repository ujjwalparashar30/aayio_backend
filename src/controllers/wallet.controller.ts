// controllers/walletController.ts
import { Request, Response } from 'express';
import { PrismaClient, WalletTransactionType, WalletTransactionStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Types and Interfaces
interface AddPlayMoneyRequest {
  userId: string;
  amount: number;
  description?: string;
}

interface TransferMoneyRequest {
  fromUserId: string;
  toUserId: string;
  amount: number;
  description?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Controllers
export const getBalance = async (
  req: Request<{ userId: string }>,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        balance: true,
        lockedBalance: true,
        p2pEscrowBalance: true,
        totalDeposited: true,
        totalWithdrawn: true
      }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'User not found'
      });
      return;
    }

    const balanceInfo = {
      user: {
        id: user.id,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      },
      balances: {
        available: user.balance.toNumber(),
        locked: user.lockedBalance.toNumber(),
        p2pEscrow: user.p2pEscrowBalance.toNumber(),
        total: user.balance.toNumber() + user.lockedBalance.toNumber() + user.p2pEscrowBalance.toNumber()
      },
      lifetime: {
        totalAdded: user.totalDeposited.toNumber(),
        totalSpent: user.totalWithdrawn.toNumber(),
        netGain: user.totalDeposited.toNumber() - user.totalWithdrawn.toNumber()
      }
    };

    const response: ApiResponse<typeof balanceInfo> = {
      success: true,
      data: balanceInfo
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting balance:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get balance'
    };
    res.status(500).json(errorResponse);
  }
};

export const addPlayMoney = async (
  req: Request<{}, any, AddPlayMoneyRequest>,
  res: Response
): Promise<void> => {
  try {
    const { userId, amount, description } = req.body;

    // Validation
    if (!userId || !amount || amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid userId or amount. Amount must be positive.'
      });
      return;
    }

    // Set reasonable limits for play money (make it game-like)
    if (amount > 100000) {
      res.status(400).json({
        success: false,
        error: '🎮 Whoa there! Maximum play money addition is ₹100,000 at once!'
      });
      return;
    }

    if (amount < 1) {
      res.status(400).json({
        success: false,
        error: '🎮 Minimum play money addition is ₹1!'
      });
      return;
    }

    // Start database transaction
    const result = await prisma.$transaction(async (tx) => {
      // Check if user exists
      const user = await tx.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('User not found');
      }

      // Game-like balance limit (prevent unlimited money)
      const currentTotal = user.balance.toNumber() + user.lockedBalance.toNumber() + user.p2pEscrowBalance.toNumber();
      if (currentTotal + amount > 1000000) {
        throw new Error('🎮 Balance limit reached! Maximum total balance is ₹10,00,000 (like a game!)');
      }

      // Update user balance
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          balance: {
            increment: amount
          },
          totalDeposited: {
            increment: amount
          }
        }
      });

      // Create wallet transaction record
      const transaction = await tx.walletTransaction.create({
        data: {
          userId,
          type: WalletTransactionType.DEPOSIT,
          amount,
          status: WalletTransactionStatus.COMPLETED,
          description: description || `🎮 Play money added: ₹${amount}`,
          paymentMethod: 'PLAY_MONEY'
        }
      });

      return {
        user: {
          id: updatedUser.id,
          newBalance: updatedUser.balance.toNumber(),
          totalAdded: updatedUser.totalDeposited.toNumber()
        },
        transaction,
        message: `🎉 Successfully added ₹${amount} play money! Happy trading!`
      };
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result
    };

    res.json(response);

  } catch (error) {
    console.error('Error adding play money:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add play money'
    };
    res.status(500).json(errorResponse);
  }
};

export const transferMoney = async (
  req: Request<{}, any, TransferMoneyRequest>,
  res: Response
): Promise<void> => {
  try {
    const { fromUserId, toUserId, amount, description } = req.body;

    // Validation
    if (!fromUserId || !toUserId || !amount || amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid transfer details. Amount must be positive.'
      });
      return;
    }

    if (fromUserId === toUserId) {
      res.status(400).json({
        success: false,
        error: '🎮 You cannot transfer money to yourself!'
      });
      return;
    }

    // Game-like transfer limits
    if (amount > 50000) {
      res.status(400).json({
        success: false,
        error: '🎮 Maximum transfer amount is ₹50,000!'
      });
      return;
    }

    // Start database transaction
    const result = await prisma.$transaction(async (tx) => {
      // Get both users
      const [fromUser, toUser] = await Promise.all([
        tx.user.findUnique({ where: { id: fromUserId } }),
        tx.user.findUnique({ where: { id: toUserId } })
      ]);

      if (!fromUser) {
        throw new Error('Sender not found');
      }

      if (!toUser) {
        throw new Error('Recipient not found');
      }

      // Check sender balance
      if (fromUser.balance.toNumber() < amount) {
        throw new Error('🎮 Insufficient balance for transfer!');
      }

      // Update balances
      const [updatedFromUser, updatedToUser] = await Promise.all([
        tx.user.update({
          where: { id: fromUserId },
          data: {
            balance: { decrement: amount },
            totalWithdrawn: { increment: amount }
          }
        }),
        tx.user.update({
          where: { id: toUserId },
          data: {
            balance: { increment: amount },
            totalDeposited: { increment: amount }
          }
        })
      ]);

      // Create transaction records
      const [senderTransaction, receiverTransaction] = await Promise.all([
        tx.walletTransaction.create({
          data: {
            userId: fromUserId,
            type: WalletTransactionType.WITHDRAWAL,
            amount,
            status: WalletTransactionStatus.COMPLETED,
            description: description || `🎮 Transfer to ${toUser.firstName} ${toUser.lastName}`,
            paymentMethod: 'TRANSFER'
          }
        }),
        tx.walletTransaction.create({
          data: {
            userId: toUserId,
            type: WalletTransactionType.DEPOSIT,
            amount,
            status: WalletTransactionStatus.COMPLETED,
            description: description || `🎮 Transfer from ${fromUser.firstName} ${fromUser.lastName}`,
            paymentMethod: 'TRANSFER'
          }
        })
      ]);

      return {
        transfer: {
          amount,
          from: {
            id: fromUserId,
            name: `${fromUser.firstName} ${fromUser.lastName}`,
            newBalance: updatedFromUser.balance.toNumber()
          },
          to: {
            id: toUserId,
            name: `${toUser.firstName} ${toUser.lastName}`,
            newBalance: updatedToUser.balance.toNumber()
          }
        },
        transactions: {
          sender: senderTransaction,
          receiver: receiverTransaction
        },
        message: `🎉 Successfully transferred ₹${amount} to ${toUser.firstName}!`
      };
    });

    const response: ApiResponse<typeof result> = {
      success: true,
      data: result
    };

    res.json(response);

  } catch (error) {
    console.error('Error transferring money:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to transfer money'
    };
    res.status(500).json(errorResponse);
  }
};

export const getTransactionHistory = async (
  req: Request<{ userId: string }>,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;
    const { page = '1', limit = '20', type } = req.query;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const take = parseInt(limit as string);

    // Build where clause
    const whereClause: any = { userId };
    if (type) {
      whereClause.type = type;
    }

    const [transactions, totalCount] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.walletTransaction.count({ where: whereClause })
    ]);

    const totalPages = Math.ceil(totalCount / take);

    // Add fun emojis and descriptions
    const enhancedTransactions = transactions.map(tx => ({
      ...tx,
      amount: tx.amount.toNumber(),
      friendlyType: tx.type === 'DEPOSIT' ? '💰 Money Added' : '📤 Money Spent/Transferred',
      emoji: tx.type === 'DEPOSIT' ? '💰' : '📤'
    }));

    const history = {
      userId,
      transactions: enhancedTransactions,
      summary: {
        totalTransactions: totalCount,
        totalDeposits: transactions
          .filter(tx => tx.type === 'DEPOSIT')
          .reduce((sum, tx) => sum + tx.amount.toNumber(), 0),
        totalWithdrawals: transactions
          .filter(tx => tx.type === 'WITHDRAWAL')
          .reduce((sum, tx) => sum + tx.amount.toNumber(), 0)
      },
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
    console.error('Error getting transaction history:', error);
    const errorResponse: ApiResponse<never> = {
      success: false,
      error: 'Failed to get transaction history'
    };
    res.status(500).json(errorResponse);
  }
};
