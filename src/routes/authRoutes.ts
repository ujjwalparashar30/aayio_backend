// src/routes/authRoutes.ts
import { Router } from 'express';
import {syncUser } from '../controllers/authController';
// import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/me',syncUser );


export default router;
