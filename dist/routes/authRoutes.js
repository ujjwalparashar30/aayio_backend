"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const router = (0, express_1.Router)();
// Remove the express.raw middleware from here since it's now in index.ts
router.post("/webhooks", authController_1.handleWebhookCallback);
// Uncomment if you need the sync user route
// router.get('/me', syncUser);
exports.default = router;
