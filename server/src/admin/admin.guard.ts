import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * שומר על נקודות הקצה הניהוליות. דורש header X-Admin-Token התואם ל-ADMIN_TOKEN.
 * אם ADMIN_TOKEN ריק — כל נקודות הניהול מושבתות.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) {
      throw new ForbiddenException('נקודות הניהול מושבתות (הגדר ADMIN_TOKEN)');
    }
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.header('X-Admin-Token');
    if (!token || token !== expected) {
      throw new UnauthorizedException('אסימון ניהול לא תקין');
    }
    return true;
  }
}
