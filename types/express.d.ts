import { UserPayload } from '../src/auth/jwt-auth.guard'; // или откуда ты экспортируешь payload

declare module 'express-serve-static-core' {
  interface Request {
    user: UserPayload | null;
  }
}
