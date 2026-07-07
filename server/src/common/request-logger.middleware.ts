import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** לוג בקשות API (מדלג על static) — מקביל ל-log_requests במקור. */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    res.on('finish', () => {
      const { statusCode } = res;
      const path = req.originalUrl;
      if (path.startsWith('/assets/') || path.startsWith('/static/')) return;
      const ms = Date.now() - start;
      const msg = `${req.method} ${path} -> ${statusCode} (${ms}ms)`;
      if (statusCode >= 400) this.logger.warn(msg);
      else this.logger.log(msg);
    });
    next();
  }
}
