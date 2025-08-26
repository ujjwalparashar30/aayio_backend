// routes/tradingRoutes.ts
import { Router } from 'express';
import {
  buyTokenFromPlatform,
  getTokenPrices,
  getMarketStats,
  getUserPortfolio,
  getTradeHistory,
  previewTrade
} from '../controllers/trading.controller';

const router = Router();

// Core trading operations (ONLY BUYING from platform)
router.post('/buy', buyTokenFromPlatform);
router.post('/preview', previewTrade);

// Market data
router.get('/price/:questionId', getTokenPrices);
router.get('/stats/:questionId', getMarketStats);

// User trading data
router.get('/portfolio/:userId', getUserPortfolio);
router.get('/history/:userId', getTradeHistory);

export default router;
