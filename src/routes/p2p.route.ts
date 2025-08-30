// routes/p2pRoutes.ts
import { Router } from 'express';
import {
  createP2POrder,
  getOrderBook,
  matchOrder,
  cancelOrder,
  getUserOrders,
  getOrderDetails
} from '../controllers/p2p.controller';
import { requireAuth } from "../middleware/clerkMiddleware";

const router = Router();

// P2P Order Management (require authentication)
router.post('/create-order', requireAuth, createP2POrder);
router.post('/match/:orderId', requireAuth, matchOrder);
router.post('/cancel/:orderId', requireAuth, cancelOrder);

// Order Book and Data (public - no auth needed)
router.get('/orders/:questionId', getOrderBook);
router.get('/order/:orderId', getOrderDetails);

// User-specific data (no auth needed since we map Clerk ID from params)
router.get('/my-orders/:userId', getUserOrders);

export default router;
