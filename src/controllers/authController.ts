import { Request, Response } from "express";
import { verifyWebhook } from '@clerk/express/webhooks';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const syncUser = async (req: Request, res: Response): Promise<void> => {
  console.log("Syncing user with Clerk ID:", req.body.clerkId);
  res.status(200).json({ message: "Sync user endpoint" });
};

export const handleWebhookCallback = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    console.log("=== WEBHOOK RECEIVED ===");
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    
    const evt = await verifyWebhook(req);
    const eventType = evt.type;
    
    console.log(`Received webhook with event type: ${eventType}`);
    console.log("Webhook payload:", evt.data);

    // Handle different event types
    switch (eventType) {
      case 'user.created':
        await handleUserCreated(evt.data);
        break;
      case 'user.updated':
        await handleUserUpdated(evt.data);
        break;
      case 'user.deleted':
        await handleUserDeleted(evt.data);
        break;
      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    res.status(200).send("Webhook processed successfully");
    return;
  } catch (err) {
    console.error("Error processing webhook:", err);
    res.status(400).send("Error processing webhook");
    return;
  }
};

// Handle user creation
async function handleUserCreated(userData: any) {
  console.log('=== USER CREATED EVENT ===');
  
  try {
    // Extract email from the email_addresses array
    const primaryEmail = userData.email_addresses?.find(
      (email: any) => email.id === userData.primary_email_address_id
    ) || userData.email_addresses?.[0];

    const userPayload = {
      clerkUserId: userData.id,
      email: primaryEmail?.email_address || '',
      firstName: userData.first_name || null,
      lastName: userData.last_name || null,
      imageUrl: userData.image_url || userData.profile_image_url || null,
      createdAt: new Date(userData.created_at),
      updatedAt: new Date(userData.updated_at)
    };

    console.log('Creating user with payload:', userPayload);

    // Create user in database
    const newUser = await prisma.user.create({
      data: userPayload
    });

    console.log('User created successfully:', newUser.id);
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

// Handle user updates
async function handleUserUpdated(userData: any) {
  console.log('=== USER UPDATED EVENT ===');
  
  try {
    // Extract email from the email_addresses array
    const primaryEmail = userData.email_addresses?.find(
      (email: any) => email.id === userData.primary_email_address_id
    ) || userData.email_addresses?.[0];

    const updatePayload = {
      email: primaryEmail?.email_address || '',
      firstName: userData.first_name || null,
      lastName: userData.last_name || null,
      imageUrl: userData.image_url || userData.profile_image_url || null,
      updatedAt: new Date(userData.updated_at)
    };

    console.log('Updating user with payload:', updatePayload);

    // Update user in database
    const updatedUser = await prisma.user.update({
      where: { clerkUserId: userData.id },
      data: updatePayload
    });

    console.log('User updated successfully:', updatedUser.id);
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

// Handle user deletion
async function handleUserDeleted(userData: any) {
  console.log('=== USER DELETED EVENT ===');
  
  try {
    // Soft delete - update deletedAt timestamp
    const deletedUser = await prisma.user.update({
      where: { clerkUserId: userData.id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log('User deleted successfully:', deletedUser.id);
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}
