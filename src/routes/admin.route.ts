// routes/adminRoutes.ts
import { Router } from 'express';
import {
  createQuestion,
  resolveQuestion,
  getDashboardStats,
  getAllQuestions,
  updateQuestion,
  getQuestionStats,
  getPlatformRevenue
} from '../controllers/admin.controller';

const router = Router();

// Question Management
router.post('/create-question', createQuestion);
router.put('/update-question/:questionId', updateQuestion);
router.post('/resolve-question/:questionId', resolveQuestion);

// Analytics & Stats
router.get('/dashboard', getDashboardStats);
router.get('/questions', getAllQuestions);
router.get('/question-stats/:questionId', getQuestionStats);
router.get('/revenue', getPlatformRevenue);

export default router;
