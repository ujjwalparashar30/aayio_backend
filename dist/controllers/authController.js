"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncUser = void 0;
// const prisma = new PrismaClient();
// GET /:cognitoId
const syncUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    //   try {
    console.log("Syncing user with Clerk ID:", req.body.clerkId);
    //   const { clerkId, email, firstName, lastName, imageUrl } = req.body;
    //   if (!clerkId || !email) {
    //      res.status(400).json({ message: 'ClerkId and email are required' });
    //      return;
    //   }
    //   // Check if user already exists
    // //   const existingUser = await prisma.user.findUnique({
    // //     where: { clerkId }
    // //   });
    //   if (existingUser) {
    //      res.status(409).json({ message: 'User already exists' });
    //      return;
    //   }
    //   // Create new user
    //   const user = await prisma.user.create({
    //     data: {
    //       clerkId,
    //       email,
    //       firstName: firstName || null,
    //       lastName: lastName || null,
    //       imageUrl: imageUrl || null,
    //       isOnboarded: false
    //     }
    //   });
    //   res.status(201).json(user);
    // } catch (error) {
    //   res.status(500).json({ message: 'Failed to sync user' });
    // }
});
exports.syncUser = syncUser;
