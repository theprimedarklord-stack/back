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
import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../db/database.service';
import { RuntimeService } from './runtime.service';
import { DeviceService } from './device/device.service';
import Redis from 'ioredis';
import * as crypto from 'crypto';

interface ExtendedWebSocket extends WebSocket {
  id: string;
  isAlive: boolean;
  deviceKey?: string;
  deviceId?: string;
  userId?: string;
  sessionId?: string;
  orgId?: string | null;
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
  private sessionDeviceCache = new Map<string, string>();
  private pingInterval: NodeJS.Timeout;
  private deviceDisconnectTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
    @Inject('WS_REDIS') private wsRedis: Redis,
    private db: DatabaseService,
    private runtimeService: RuntimeService,
    private deviceService: DeviceService,
  ) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (redisUrl) {
      this.pubClient = new Redis(redisUrl, { enableOfflineQueue: false });
      this.subClient = new Redis(redisUrl, { enableOfflineQueue: false });
    } else {
      this.logger.warn('REDIS_URL not set — RuntimeGateway Pub/Sub disabled. Direct relay only.');
    }

    this.eventEmitter.on('runtime.terminate_requested', async (payload: { sessionId: string; deviceId: string }) => {
      await this.wsRedis.del(`runtime:session_device:${payload.sessionId}`);
      this.sessionDeviceCache.delete(payload.sessionId);
      this.pubClient?.publish(`runtime:destroy:${payload.sessionId}`, JSON.stringify(payload));
    });



    this.eventEmitter.on('runtime.resume_requested', async (payload: { sessionId: string; userId: string }) => {
      const targetDeviceId = this.sessionDeviceCache.get(payload.sessionId)
        ?? await this.wsRedis.get(`runtime:session_device:${payload.sessionId}`);
      if (!targetDeviceId) {
        this.logger.warn(`No device mapping for session ${payload.sessionId}, cannot resume`);
        return;
      }
      this.pubClient?.publish(`runtime:resume:${payload.sessionId}`, JSON.stringify({ sessionId: payload.sessionId }));
    });
  }

  afterInit(server: Server) {
    this.logger.log('RuntimeGateway initialized');
    
    if (this.subClient) {
      this.subClient.on('ready', () => {
        this.subClient.psubscribe('runtime:*').catch(err => this.logger.error(err));
      });

      this.subClient.on('pmessageBuffer', (pattern, channelBuffer, messageBuffer) => {
        const channel = channelBuffer.toString('utf-8');
        this.handleRedisMessage(channel, messageBuffer);
      });
    }

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
    const ticket = url.searchParams.get('ticket');
    const deviceKey = url.searchParams.get('deviceKey');

    try {
      if (deviceKey) {
        const hash = crypto.createHash('sha256').update(deviceKey).digest('hex');
        const res = await this.db.query(
          `SELECT id, user_id FROM rt_devices WHERE device_key_hash = $1 AND status != 'revoked'`,
          [hash]
        );
        if (res.rows.length === 0) {
          client.close(4003, 'Invalid device key');
          return;
        }
        client.deviceId = res.rows[0].id;
        client.userId = res.rows[0].user_id;
        client.deviceKey = deviceKey;
        this.deviceSockets.set(client.id, client);
        
        const existingTimer = this.deviceDisconnectTimers.get(client.deviceId!);
        if (existingTimer) {
          clearTimeout(existingTimer);
          this.deviceDisconnectTimers.delete(client.deviceId!);
          this.logger.log(`Device ${client.deviceId!} reconnected within grace period`);
        }
        
        await this.deviceService.markOnline(client.deviceId!);
        this.logger.log(`Device connected: ${client.id}`);
      } else if (ticket) {
        const script = `
          local val = redis.call("GET", KEYS[1])
          if val then
            redis.call("DEL", KEYS[1])
          end
          return val
        `;
        const raw = await this.wsRedis.eval(script, 1, `ws:ticket:${ticket}`) as string | null;
        
        if (!raw) {
          client.close(4001, 'Invalid or expired ticket');
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          client.userId = parsed.userId;
          client.orgId = parsed.orgId ?? null;
        } catch {
          client.userId = raw;
          client.orgId = null;
        }
        client.permissions = {}; 
        this.clientSockets.set(client.id, client);
        this.logger.log(`Client connected: ${client.id} (user ${client.userId})`);
      } else {
        client.close(4001, 'Unauthorized');
        return;
      }

      // Handle raw binary messages (multiplexed input from browser)
      client.on('message', (data: any, isBinary: boolean) => {
        if (isBinary && Buffer.isBuffer(data) && data.length >= 36) {
          const sessionId = data.toString('utf-8', 0, 36).trim();
          const payload = data.subarray(36);
          const channel = client.deviceId 
            ? `runtime:output:${sessionId}` 
            : `runtime:input:${sessionId}`;
          this.pubClient?.publish(channel, payload);
        } else if (!isBinary) {
          try {
            const messageStr = Buffer.isBuffer(data) ? data.toString('utf-8') : data.toString();
            const parsed = JSON.parse(messageStr);
            this.handleDeviceEvent(client, parsed);
          } catch (e) {
            this.logger.error(`Failed to parse non-binary message: ${e.message}`);
          }
        }
      });
    } catch (e) {
      this.logger.error(`Connection auth failed: ${e.message}`);
      client.close(4001, 'Auth failed');
    }
  }

  async handleDisconnect(client: ExtendedWebSocket) {
    if (client.deviceKey) {
      this.deviceSockets.delete(client.id);
      this.logger.log(`Device disconnected: ${client.id}`);
      this.eventEmitter.emit('runtime.destroyed', { deviceId: client.deviceId });
      
      const timer = setTimeout(async () => {
        try {
          this.logger.warn(`Device ${client.deviceId!} did not reconnect within grace period, marking offline`);
          await this.deviceService.markOffline(client.deviceId!);
          await this.db.query(
            "UPDATE rt_runtime_sessions SET status='disconnected' WHERE device_id=$1 AND status IN ('active','creating')",
            [client.deviceId!]
          );
          
          const offlineEvent = JSON.stringify({
            type: 'device.offline',
            payload: { deviceId: client.deviceId! }
          });
          
          for (const clientSocket of this.clientSockets.values()) {
            clientSocket.send(offlineEvent);
          }
        } catch (e) {
          this.logger.error(`Grace period timeout handler failed for device ${client.deviceId!}: ${e.message}`, e.stack);
        } finally {
          this.deviceDisconnectTimers.delete(client.deviceId!);
        }
      }, 45_000);
      
      this.deviceDisconnectTimers.set(client.deviceId!, timer);
    } else {
      this.clientSockets.delete(client.id);
      this.logger.log(`Client disconnected: ${client.id}`);
    }
  }

  @SubscribeMessage('create_runtime')
  async handleCreateRuntime(@ConnectedSocket() client: ExtendedWebSocket, @MessageBody() payload: any) {
    if (payload.sessionId) {
      client.sessionId = payload.sessionId;
    }
    
    const deviceId = payload.deviceId;
    if (!deviceId) {
      this.logger.error(`create_runtime failed: no deviceId provided`);
      client.send(JSON.stringify({ event: 'runtime.error', data: { error: 'Missing deviceId', sessionId: payload.sessionId } }));
      return;
    }

    const activeCount = await this.runtimeService.countActiveSessions(deviceId);
    if (activeCount >= 5) {
      this.logger.warn(`Device ${deviceId} reached 5 sessions limit`);
      client.send(JSON.stringify({ event: 'runtime.error', data: { error: 'Device reached 5 sessions limit', sessionId: payload.sessionId } }));
      return;
    }

    try {
      await this.runtimeService.createSession(client.userId!, {
        sessionId: payload.sessionId,
        nodeId: payload.nodeId,
        deviceId: deviceId,
        runtimeType: payload.type || 'terminal',
        runtimeProvider: payload.provider || 'local',
        runtimeConfig: payload.config,
        metadata: { clientSessionId: payload.sessionId },
        mapCardId: payload.mapCardId,
        organizationId: client.orgId,
      });
    } catch (e) {
      this.logger.error(`Failed to create session in DB: ${e.message}`);
      client.send(JSON.stringify({ event: 'runtime.error', data: { error: 'Failed to create session', sessionId: payload.sessionId } }));
      return;
    }

    if (payload.sessionId) {
      this.sessionDeviceCache.set(payload.sessionId, deviceId);
      if (this.wsRedis) {
        await this.wsRedis.setex(`runtime:session_device:${payload.sessionId}`, 86400, deviceId);
      }
    }

    // Forward to agent
    this.pubClient?.publish(`runtime:create:${payload.nodeId}`, JSON.stringify(payload));
  }

  @SubscribeMessage('runtime_resize')
  handleResize(@ConnectedSocket() client: ExtendedWebSocket, @MessageBody() payload: any) {
    this.pubClient?.publish(`runtime:resize:${payload.sessionId}`, JSON.stringify(payload));
  }

  @SubscribeMessage('runtime_input')
  handleInput(@ConnectedSocket() client: ExtendedWebSocket, @MessageBody() payload: any) {
    // Fallback for JSON inputs if not using binary multiplexing
    if (client.bufferedAmount > 1024 * 1024) {
      this.logger.warn(`Backpressure: client ${client.id} buffer full`);
      return;
    }
    this.pubClient?.publish(`runtime:input:${payload.sessionId}`, JSON.stringify(payload));
  }

  private async handleDeviceEvent(client: ExtendedWebSocket, payload: any) {
    if (!payload || !payload.event) return;
    const data = payload.data || {};
    const sessionId = data.sessionId;

    switch (payload.event) {
      case 'runtime.created':
        if (sessionId) await this.runtimeService.activateSession(sessionId);
        this.relayToSession(sessionId, payload);
        break;
      case 'runtime.error':
        if (sessionId) await this.runtimeService.failSession(sessionId);
        this.relayToSession(sessionId, payload);
        break;
      case 'runtime.resumed':
        if (sessionId) await this.runtimeService.resumeSession(sessionId);
        this.relayToSession(sessionId, payload);
        break;
      case 'device_info':
        if (client.deviceId) {
          await this.db.query(
            `UPDATE rt_devices SET os_info = $1 WHERE id = $2`,
            [JSON.stringify(data), client.deviceId],
          );
        }
        break;
      case 'sessions_alive': {
        const aliveIds: string[] = data.sessionIds || [];
        if (client.deviceId) {
          await this.runtimeService.syncAliveSessions(client.deviceId, aliveIds);
        }
        break;
      }
      default:
        break;
    }
  }

  private relayToSession(sessionId: string, payload: any) {
    if (!sessionId) return;
    for (const browserClient of this.clientSockets.values()) {
      if (browserClient.sessionId === sessionId) {
        browserClient.send(JSON.stringify(payload));
        break;
      }
    }
  }

  private async handleRedisMessage(channel: string, messageBuffer: Buffer) {
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
      const sessionBytes = Buffer.alloc(36, 32);
      sessionBytes.write(sessionId, 0, 'utf-8');
      const combined = Buffer.concat([sessionBytes, messageBuffer]);

      const targetDeviceId = this.sessionDeviceCache.get(sessionId)
        ?? await this.wsRedis.get(`runtime:session_device:${sessionId}`);

      if (!targetDeviceId) {
        this.logger.warn(`No device mapping for session ${sessionId}, input dropped`);
        for (const client of this.clientSockets.values()) {
          if (client.sessionId === sessionId) {
            client.send(JSON.stringify({
              event: 'runtime.error',
              data: { error: 'Device not found for session', sessionId }
            }));
            break;
          }
        }
        return;
      }

      for (const device of this.deviceSockets.values()) {
        if (device.deviceId === targetDeviceId) {
          device.send(combined);
          break;
        }
      }
    } else if (parts[1] === 'create' || parts[1] === 'resize' || parts[1] === 'destroy' || parts[1] === 'resume') {
      const messageStr = messageBuffer.toString('utf-8');
      const data = JSON.parse(messageStr);
      let targetDeviceId = data.deviceId;

      if (parts[1] === 'resume') {
        const sessionId = parts[2];
        targetDeviceId = this.sessionDeviceCache.get(sessionId)
          ?? await this.wsRedis.get(`runtime:session_device:${sessionId}`);
      }

      if (!targetDeviceId) {
        this.logger.error(`Missing targetDeviceId in ${parts[1]} message, rejecting`);
        return;
      }

      let delivered = false;
      for (const device of this.deviceSockets.values()) {
        if (device.deviceId === targetDeviceId) {
          const payloadStr = JSON.stringify({
            event: parts[1] === 'create' ? 'create_runtime' : 
                   parts[1] === 'resize' ? 'runtime_resize' : 
                   parts[1] === 'destroy' ? 'destroy_runtime' : 'resume_runtime',
            data,
          });
          this.logger.log(`Sending to device ${targetDeviceId}: ${payloadStr}`);
          device.send(payloadStr);
          delivered = true;
          break;
        }
      }

      if (!delivered) {
        this.logger.warn(`Device ${targetDeviceId} not connected, ${parts[1]} message dropped`);
      }
    }
  }
}
