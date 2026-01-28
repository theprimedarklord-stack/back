// src/auth/jwt-auth.guard.ts
import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
  } from '@nestjs/common';
  import { Request } from 'express';
  import * as jwt from 'jsonwebtoken';
  
  export interface UserPayload {
    id: string;
    email: string;
    role?: string;
  }
  
  // src/auth/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();



    const token = this.extractTokenFromRequest(request);


    if (!token) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as UserPayload;
  
      // Set user with both id and userId for compatibility
      request.user = {
        id: payload.id,
        userId: payload.id,  // Alias for new code
        email: payload.email,
        role: payload.role,
      };
      return true;
    } catch (err) {
      throw new UnauthorizedException('Недействительный токен');
    }
  }

  private extractTokenFromRequest(req: Request): string | null {
    return req.cookies?.access_token || req.headers.authorization?.split(' ')[1] || null;
  }
}