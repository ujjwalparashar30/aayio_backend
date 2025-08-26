// routes/walletRoutes.ts
import { Router } from 'express';
import {
  getBalance,
  addPlayMoney,
  getTransactionHistory,
  transferMoney
} from '../controllers/wallet.controller';

const router = Router();

// Wallet operations
router.get('/balance/:userId', getBalance);
router.post('/add-money', addPlayMoney);
router.get('/transactions/:userId', getTransactionHistory);
router.post('/transfer', transferMoney);

export default router;
