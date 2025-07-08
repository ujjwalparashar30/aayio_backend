import { Router } from 'express';
import { syncUser, handleWebhookCallback } from '../controllers/authController';

const router = Router();

// Remove the express.raw middleware from here since it's now in index.ts
router.post("/webhooks", handleWebhookCallback);

// Uncomment if you need the sync user route
// router.get('/me', syncUser);

export default router;
