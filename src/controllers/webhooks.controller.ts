import { Request, Response } from 'express';
import { Webhook } from 'svix';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const handleClerkWebhook = async (req: Request, res: Response) => {
  try {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
      console.error('❌ Missing CLERK_WEBHOOK_SECRET');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const svix_id = req.headers['svix-id'] as string;
    const svix_timestamp = req.headers['svix-timestamp'] as string;
    const svix_signature = req.headers['svix-signature'] as string;

    if (!svix_id || !svix_timestamp || !svix_signature) {
      console.error('❌ Missing Svix headers');
      return res.status(400).json({ error: 'Missing webhook headers' });
    }

    const wh = new Webhook(WEBHOOK_SECRET);
    const payload = JSON.stringify(req.body);

    // Fix: Type the event properly
    let evt: any;
    try {
      evt = wh.verify(payload, {
        'svix-id': svix_id,
        'svix-timestamp': svix_timestamp,
        'svix-signature': svix_signature,
      });
    } catch (err) {
      console.error('❌ Webhook verification failed:', err);
      return res.status(400).json({ error: 'Webhook verification failed' });
    }

    console.log('🔔 Webhook event received:', evt.type);
    
    if (evt.type === 'user.created') {
      const { id, email_addresses, first_name, last_name, image_url } = evt.data;

      console.log('👤 Creating user:', id);

      try {
        // Use upsert to avoid duplicate key errors
        const user = await prisma.user.upsert({
          where: { id },
          update: {}, // Don't update if exists
          create: {
            id,
            clerkUserId: id,
            email: email_addresses?.[0]?.email_address || '',
            firstName: first_name || '',
            lastName: last_name || '',
            imageUrl: image_url || '',
            balance: 1000,
            lockedBalance: 0,
            p2pEscrowBalance: 0,
            totalDeposited: 1000,
            totalWithdrawn: 0
            // isActive: true,
          }
        });

        console.log('✅ User created/found successfully:', user.id);
        return res.status(200).json({ 
          success: true, 
          message: 'User processed', 
          userId: user.id 
        });
      } catch (dbError: any) {
        console.error('❌ Database error:', dbError);
        return res.status(500).json({ error: 'Database error' });
      }
    }

    return res.status(200).json({ success: true, message: 'Webhook processed' });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
