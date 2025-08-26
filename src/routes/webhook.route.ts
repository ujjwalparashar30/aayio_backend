import { Router, Request, Response, NextFunction } from 'express';
import { handleClerkWebhook } from '../controllers/webhooks.controller';

const router = Router();

// Fix: Properly handle async function with error catching
router.post('/clerk', (req: Request, res: Response, next: NextFunction) => {
  handleClerkWebhook(req, res).catch(next);
});

export default router;
