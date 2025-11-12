import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

export type LinkTokenAction = 'view' | 'cancel' | 'reschedule';

export type LinkTokenPayload = {
  reservationId: string;
  action: LinkTokenAction;
  exp: number;
};

export type LinkTokenErrorCode = 'INVALID' | 'EXPIRED' | 'ACTION_NOT_ALLOWED';

export class LinkTokenError extends Error {
  constructor(
    public readonly code: LinkTokenErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'LinkTokenError';
  }
}

@Injectable()
export class LinkTokenService {
  private readonly secret: Buffer;
  private readonly defaultTtlHours: number;

  constructor() {
    const rawSecret = (process.env.GUEST_LINK_SECRET ?? '').trim();
    if (!rawSecret) {
      throw new Error('GUEST_LINK_SECRET is required to issue guest tokens.');
    }
    this.secret = this.toSecretBuffer(rawSecret);
    this.defaultTtlHours = this.normalizeTtl(process.env.GUEST_LINK_TTL_HOURS);
  }

  issueToken(
    reservationId: string,
    action: LinkTokenAction,
    ttlHours?: number,
  ): string {
    const trimmed = reservationId?.trim();
    if (!trimmed) {
      throw new LinkTokenError('INVALID', 'reservationId is required');
    }
    const exp = this.computeExpiry(ttlHours);
    const payload: LinkTokenPayload = {
      reservationId: trimmed,
      action,
      exp,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString(
      'base64url',
    );
    const signature = this.sign(encoded);
    return `${encoded}.${signature}`;
  }

  verifyToken(
    token: string,
    allowedActions?: LinkTokenAction | LinkTokenAction[],
  ): LinkTokenPayload {
    const trimmed = token?.trim();
    if (!trimmed) {
      throw new LinkTokenError('INVALID', 'Token is required');
    }
    const [encoded, providedSignature] = trimmed.split('.');
    if (!encoded || !providedSignature) {
      throw new LinkTokenError('INVALID', 'Malformed token');
    }

    const expectedSignature = this.sign(encoded);
    const provided = this.decodeBase64Url(providedSignature);
    if (expectedSignature.length !== provided.length) {
      throw new LinkTokenError('INVALID', 'Signature mismatch');
    }
    const expected = Buffer.from(expectedSignature, 'base64url');
    if (!timingSafeEqual(expected, provided)) {
      throw new LinkTokenError('INVALID', 'Signature mismatch');
    }

    let payload: LinkTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf-8'),
      ) as LinkTokenPayload;
    } catch {
      throw new LinkTokenError('INVALID', 'Payload could not be decoded');
    }

    if (!payload?.reservationId || !payload.action || !payload.exp) {
      throw new LinkTokenError('INVALID', 'Payload is missing claims');
    }
    if (payload.exp * 1000 <= Date.now()) {
      throw new LinkTokenError('EXPIRED', 'Token has expired');
    }

    if (allowedActions) {
      const allowed = Array.isArray(allowedActions)
        ? new Set(allowedActions)
        : new Set<LinkTokenAction>([allowedActions]);
      if (!allowed.has(payload.action)) {
        throw new LinkTokenError('ACTION_NOT_ALLOWED', 'Action mismatch');
      }
    }

    return payload;
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(payload, 'utf-8')
      .digest('base64url');
  }

  private computeExpiry(ttlHours?: number): number {
    const ttl =
      typeof ttlHours === 'number' && Number.isFinite(ttlHours) && ttlHours > 0
        ? Math.floor(ttlHours)
        : this.defaultTtlHours;
    const clamped = Math.max(ttl, 1);
    const ms = Date.now() + clamped * 60 * 60 * 1000;
    return Math.floor(ms / 1000);
  }

  private toSecretBuffer(secret: string): Buffer {
    const base64Pattern = /^[A-Za-z0-9+/=_-]+$/;
    if (base64Pattern.test(secret) && secret.length % 4 === 0) {
      try {
        const decoded = Buffer.from(secret, 'base64');
        if (decoded.length > 0) {
          return decoded;
        }
      } catch {
        // Fall through to UTF-8 buffer
      }
    }
    return Buffer.from(secret, 'utf-8');
  }

  private normalizeTtl(raw?: string): number {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 72;
    }
    return Math.min(Math.floor(parsed), 24 * 14);
  }

  private decodeBase64Url(value: string): Buffer {
    try {
      return Buffer.from(value, 'base64url');
    } catch {
      throw new LinkTokenError('INVALID', 'Signature is not valid base64');
    }
  }
}
