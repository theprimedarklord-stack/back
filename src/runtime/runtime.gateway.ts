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
  sessionId?: string;
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
    
    this.subClient.on('ready', () => {
      this.subClient.psubscribe('runtime:*').catch(err => this.logger.error(err));
    });

    this.subClient.on('pmessageBuffer', (pattern, channelBuffer, messageBuffer) => {
      const channel = channelBuffer.toString('utf-8');
      this.handleRedisMessage(channel, messageBuffer);
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

      // Handle raw binary messages (multiplexed input from browser)
      client.on('message', (data: any, isBinary: boolean) => {
        if (isBinary && Buffer.isBuffer(data) && data.length >= 36) {
          const sessionId = data.toString('utf-8', 0, 36).trim();
          const payload = data.subarray(36);
          // Publish binary payload to Redis
          this.pubClient.publishBuffer(`runtime:input:${sessionId}`, payload);
        }
      });
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

  @SubscribeMessage('create_runtime')
  handleCreateRuntime(@ConnectedSocket() client: ExtendedWebSocket, @MessageBody() payload: any) {
    if (payload.sessionId) {
      client.sessionId = payload.sessionId;
    }
    // Forward to agent
    this.pubClient.publish(`runtime:create:${payload.nodeId}`, JSON.stringify(payload));
  }

  @SubscribeMessage('runtime_resize')
  handleResize(@ConnectedSocket() client: ExtendedWebSocket, @MessageBody() payload: any) {
    this.pubClient.publish(`runtime:resize:${payload.sessionId}`, JSON.stringify(payload));
  }

  @SubscribeMessage('runtime_input')
  handleInput(@ConnectedSocket() client: ExtendedWebSocket, @MessageBody() payload: any) {
    // Fallback for JSON inputs if not using binary multiplexing
    if (client.bufferedAmount > 1024 * 1024) {
      this.logger.warn(`Backpressure: client ${client.id} buffer full`);
      return;
    }
    this.pubClient.publish(`runtime:input:${payload.sessionId}`, JSON.stringify(payload));
  }

  private handleRedisMessage(channel: string, messageBuffer: Buffer) {
    const parts = channel.split(':');
    if (parts[1] === 'output') {
      const sessionId = parts[2];
      for (const client of this.clientSockets.values()) {
        if (client.sessionId === sessionId) {
          client.send(messageBuffer);
          break;
        }
      }
    } else if (parts[1] === 'input') {
      const sessionId = parts[2];
      // Re-multiplex it for the agent (prepend sessionId)
      const sessionBytes = Buffer.alloc(36, 32); // 32 is space
      sessionBytes.write(sessionId, 0, 'utf-8');
      const combined = Buffer.concat([sessionBytes, messageBuffer]);
      for (const device of this.deviceSockets.values()) {
        device.send(combined);
      }
    } else if (parts[1] === 'create' || parts[1] === 'resize') {
      const messageStr = messageBuffer.toString('utf-8');
      for (const device of this.deviceSockets.values()) {
        device.send(JSON.stringify({
          event: parts[1] === 'create' ? 'create_runtime' : 'runtime_resize',
          data: JSON.parse(messageStr)
        }));
      }
    }
  }
}
