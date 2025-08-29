// types/express/index.d.ts
import "express";

declare module "express-serve-static-core" {
  interface Request {
    auth?: {
      userId: string;
      sessionId: string | null;
      getToken: (options?: { template?: string }) => Promise<string | null>;
    };
  }
}
