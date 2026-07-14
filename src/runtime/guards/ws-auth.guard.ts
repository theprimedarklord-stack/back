import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * WebSocket authentication guard for user connections.
 * Validates the JWT token passed via the WS handshake query parameter `?token=...`.
 *
 * On success, attaches `client.userId` and `client.email` to the WebSocket instance.
 */
@Injectable()
export class WsAuthGuard implements CanActivate {
  private readonly logger = new Logger(WsAuthGuard.name);
  private readonly JWKS: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly clientId: string;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('COGNITO_REGION') || 'eu-central-1';
    const userPoolId = this.configService.get<string>('COGNITO_USER_POOL_ID');
    this.clientId = this.configService.get<string>('COGNITO_CLIENT_ID') || '';
    this.issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    this.JWKS = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const request = context.switchToHttp().getRequest();

    // Extract token from query string (ws://host/runtime?token=xxx)
    let token: string | undefined;
    if (request?.url) {
      const url = new URL(request.url, 'http://localhost');
      token = url.searchParams.get('token') || undefined;
    }

    if (!token) {
      this.logger.warn('WsAuthGuard: No token in WS handshake');
      client.close?.(4001, 'Unauthorized: No token');
      return false;
    }

    try {
      const { payload } = await jwtVerify(token, this.JWKS, {
        issuer: this.issuer,
        algorithms: ['RS256'],
      });

      if (payload.client_id !== this.clientId) {
        this.logger.warn('WsAuthGuard: client_id mismatch');
        client.close?.(4001, 'Unauthorized: Invalid client_id');
        return false;
      }

      client.userId = payload.sub;
      client.email = payload.email || '';
      return true;
    } catch (err) {
      this.logger.error(`WsAuthGuard: JWT verification failed — ${err.message}`);
      client.close?.(4001, 'Unauthorized: Invalid token');
      return false;
    }
  }
}
