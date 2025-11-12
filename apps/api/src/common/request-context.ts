import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';

type Store = { req?: Request };

class RequestContextCls {
  private als = new AsyncLocalStorage<Store>();
  run<T>(req: Request, cb: () => T) {
    return this.als.run({ req }, cb);
  }
  get req() {
    return this.als.getStore()?.req;
  }
  get tenantId(): string | undefined {
    return this.req?.tenantId;
  }
  set tenantId(val: string | undefined) {
    if (this.req) this.req.tenantId = val;
  }
}

export const RequestContext = new RequestContextCls();

export function requestContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  RequestContext.run(req, () => next());
}
