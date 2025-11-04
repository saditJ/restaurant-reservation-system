// Declaration merging for Express Request
import 'express-serve-static-core';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    tenantId?: string;
    apiKeyId?: string;
    actor?: {
      kind: 'service' | 'staff' | 'guest';
      userId?: string;
      roles?: string[];
    };
    responseDurationMs?: number;
  }
}
