import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private configService: ConfigService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    cookieParser()(req, res, async () => {
      try {
        const token = req.cookies['access_token'];
        
        if (!token) {
          req['user'] = null;
          return next();
        }
        
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
        const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
        
        if (!supabaseUrl || !supabaseKey) {
          req['user'] = null;
          return next();
        }
        
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data, error } = await supabase.auth.getUser(token);
        
        if (error || !data.user) {
          req['user'] = null;
        } else {
          req['user'] = data.user;
        }
        next();
      } catch (err) {
        console.error('Auth middleware error:', err);
        req['user'] = null;
        next(err);
      }
    });
    
  }
}