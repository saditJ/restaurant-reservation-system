import 'express';
import type { AuthenticatedApiKey } from '../auth/api-key.service';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      id?: string;
      responseDurationMs?: number;
      apiKey?: AuthenticatedApiKey;
    }
  }
}

export {};
