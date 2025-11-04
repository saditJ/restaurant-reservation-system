// Ambient declarations to augment Express Request across both common module paths.
// No exports here on purpose — keep this as a pure .d.ts so tsc merges it globally.

// 1) Augment the commonly used internal module where Nest types derive Request:
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

// 2) Also augment the global Express namespace (covers code that uses Express.Request type)
declare global {
  namespace Express {
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
}

// Keep this file as a .d.ts with no runtime side effects.
