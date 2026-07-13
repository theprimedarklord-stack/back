import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, WebSocket } from 'ws';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import * as crypto from 'crypto';

interface ExtendedWebSocket extends WebSocket {
  id: string;
  isAlive: boolean;
  deviceKey?: string;
  deviceId?: string;
  userId?: string;
  permissions?: Record<string, string>;
}

@Injectable()
@WebSocketGateway({ path: '/runtime' })
export class RuntimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RuntimeGateway.name);
  
  private pubClient: Redis;
  private subClient: Redis;
  
  private clientSockets = new Map<string, ExtendedWebSocket>();
  private deviceSockets = new Map<string, ExtendedWebSocket>();
  private pingInterval: NodeJS.Timeout;

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) throw new Error('REDIS_URL required for RuntimeGateway Pub/Sub');
    
    this.pubClient = new Redis(redisUrl, { enableOfflineQueue: false });
    this.subClient = new Redis(redisUrl, { enableOfflineQueue: false });
  }

  afterInit(server: Server) {
    this.logger.log('RuntimeGateway initialized');
    
    // Wait for connection to be ready before subscribing if offline queue is disabled,
    // or just rely on the fact that we can listen to the connect/ready event.
    this.subClient.on('ready', () => {
      this.subClient.psubscribe('runtime:*').catch(err => this.logger.error(err));
    });

    this.subClient.on('pmessage', (pattern, channel, message) => {
      this.handleRedisMessage(channel, message);
    });

    this.pingInterval = setInterval(() => {
      this.server?.clients?.forEach((ws: ExtendedWebSocket) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  async handleConnection(client: ExtendedWebSocket, request: any) {
    client.id = crypto.randomUUID();
    client.isAlive = true;
    client.on('pong', () => (client.isAlive = true));

    const url = new URL(request.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const deviceKey = url.searchParams.get('deviceKey');

    try {
      if (deviceKey) {
        client.deviceKey = deviceKey;
        this.deviceSockets.set(client.id, client);
        this.logger.log(`Device connected: ${client.id}`);
      } else if (token) {
        client.userId = 'user-from-token';
        client.permissions = {}; 
        this.clientSockets.set(client.id, client);
        this.logger.log(`Client connected: ${client.id}`);
      } else {
        client.close(4001, 'Unauthorized');
      }
    } catch (e) {
      client.close(4001, 'Auth failed');
    }
  }

  handleDisconnect(client: ExtendedWebSocket) {
    if (client.deviceKey) {
      this.deviceSockets.delete(client.id);
      this.logger.log(`Device disconnected: ${client.id}`);
      this.eventEmitter.emit('runtime.destroyed', { deviceId: client.deviceId });
    } else {
      this.clientSockets.delete(client.id);
      this.logger.log(`Client disconnected: ${client.id}`);
    }
  }

  @SubscribeMessage('runtime_input')
  handleInput(@ConnectedSocket() client: ExtendedWebSocket, @MessageBody() payload: any) {
    if (client.bufferedAmount > 1024 * 1024) {
      this.logger.warn(`Backpressure: client ${client.id} buffer full`);
      return;
    }
    
    this.pubClient.publish(`runtime:input:${payload.sessionId}`, JSON.stringify(payload));
  }

  private handleRedisMessage(channel: string, message: string) {
    // TODO: Routing logic
  }
}
