// routes/walletRoutes.ts
import { Router } from 'express';
import {
  getBalance,
  addPlayMoney,
  getTransactionHistory
} from '../controllers/wallet.controller';
import { requireAuth } from '../middleware/clerkMiddleware';

const router = Router();

// Wallet operations
router.get('/balance/:userId', requireAuth, getBalance);
router.post('/add-money',requireAuth, addPlayMoney);
router.get('/transactions/:userId', requireAuth, getTransactionHistory);
// router.post('/transfer', transferMoney);

export default router;
