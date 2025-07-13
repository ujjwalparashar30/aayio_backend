import { Router } from 'express';
import {
  getAllQuestions,
  getQuestionById,
  getQuestionPriceHistory,
  getQuestionOrderBook
} from '../controllers/questionController';

const router = Router();

// GET /api/questions - Get all questions with pagination and filters
router.get('/', getAllQuestions);

// GET /api/questions/:id - Get specific question with full details
router.get('/:id', getQuestionById);

// GET /api/questions/:id/price-history - Get price history for charts
router.get('/:id/price-history', getQuestionPriceHistory);

// GET /api/questions/:id/order-book - Get P2P order book
router.get('/:id/order-book', getQuestionOrderBook);

export default router;
