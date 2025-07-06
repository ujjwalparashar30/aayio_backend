// src/types/index.ts
export interface ClerkUser {
  id: string;
  emailAddresses: Array<{ emailAddress: string }>;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  username: string | null;
}

export interface AppUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  role?: string;
  isOnboarded?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    clerkId: string;
    email: string;
  };
}
