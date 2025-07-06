// import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";

// const prisma = new PrismaClient();

// GET /:cognitoId
export const syncUser = async (req: Request, res: Response): Promise<void> => {
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
    } 
