import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { createRequestTimingMiddleware } from './request-timing.middleware';
import type { MetricsService } from './metrics.service';

function buildResponse(statusCode = 200) {
  class ResponseEmitter extends EventEmitter {}
  const res = new ResponseEmitter() as Response & EventEmitter;
  res.statusCode = statusCode;
  res.setHeader = jest.fn();
  return res;
}

describe('request-timing.middleware', () => {
  it('records duration for non-metrics requests', () => {
    const observeHttpRequest = jest.fn();
    const metricsService = { observeHttpRequest } as unknown as MetricsService;
    const middleware = createRequestTimingMiddleware(metricsService);

    const req = {
      method: 'GET',
      path: '/v1/demo',
      route: { path: '/demo' },
      originalUrl: '/v1/demo',
    } as unknown as Request;
    const res = buildResponse(200);
    const next = jest.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();

    res.emit('finish');
    expect(observeHttpRequest).toHaveBeenCalledWith(
      {
        method: 'GET',
        route: '/demo',
        statusCode: 200,
      },
      expect.any(Number),
    );
  });

  it('skips metrics endpoint', () => {
    const observeHttpRequest = jest.fn();
    const metricsService = { observeHttpRequest } as unknown as MetricsService;
    const middleware = createRequestTimingMiddleware(metricsService);

    const req = {
      method: 'GET',
      path: '/metrics',
      route: { path: '/metrics' },
    } as unknown as Request;
    const res = buildResponse(200);

    const next = jest.fn();

    middleware(req, res, next);
    res.emit('finish');

    expect(observeHttpRequest).not.toHaveBeenCalled();
  });
});

describe('normalize route behaviour', () => {
  it('combines baseUrl and route path', () => {
    const observeHttpRequest = jest.fn();
    const metricsService = { observeHttpRequest } as unknown as MetricsService;
    const middleware = createRequestTimingMiddleware(metricsService);

    const req = {
      method: 'GET',
      baseUrl: '/v1/availability',
      route: { path: '' },
      originalUrl: '/v1/availability?date=2025-10-01',
      path: '/v1/availability',
    } as unknown as Request;
    const res = buildResponse(200);
    const next = jest.fn();

    middleware(req, res, next);
    res.emit('finish');
    expect(observeHttpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        route: '/v1/availability',
      }),
      expect.any(Number),
    );
  });
});
