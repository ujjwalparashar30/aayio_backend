import { AuthObject } from "@clerk/clerk-sdk-node"; // Clerk type for req.auth

declare global {
  namespace Express {
    export interface Request {
      auth?: AuthObject;  // 👈 Add auth to Request
    }
  }
}
