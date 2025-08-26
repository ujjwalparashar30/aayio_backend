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

const router = Router();

// P2P Order Management
router.post('/create-order', createP2POrder);
router.post('/match/:orderId', matchOrder);
router.post('/cancel/:orderId', cancelOrder);

// Order Book and Data
router.get('/orders/:questionId', getOrderBook);
router.get('/order/:orderId', getOrderDetails);
router.get('/my-orders/:userId', getUserOrders);

export default router;
