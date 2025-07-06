"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/authRoutes.ts
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
// import { authenticateToken } from '../middleware/auth';
const router = (0, express_1.Router)();
router.get('/me', authController_1.syncUser);
exports.default = router;
