import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { RuntimeSession, CreateRuntimeSessionDto } from './runtime.types';

@Injectable()
export class RuntimeService {
  private readonly logger = new Logger(RuntimeService.name);

  constructor(private db: DatabaseService) {}

  /** Create a new runtime session. */
  async createSession(
    userId: string,
    dto: CreateRuntimeSessionDto,
  ): Promise<RuntimeSession> {
    const res = await this.db.query(
      `INSERT INTO rt_runtime_sessions
         (node_id, user_id, device_id, agent_id, runtime_kind, runtime_provider, runtime_config, status, metadata, map_card_id, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'creating', $8, $9, $10)
       RETURNING *`,
      [
        dto.nodeId,
        userId,
        dto.deviceId,
        dto.agentId || null,
        dto.runtimeType,
        dto.runtimeProvider,
        JSON.stringify(dto.runtimeConfig || {}),
        JSON.stringify(dto.metadata || {}),
        dto.mapCardId || null,
        dto.organizationId || null,
      ],
    );
    this.logger.log(`Session created: ${res.rows[0].id} (kind=${dto.runtimeType}, status=creating)`);
    return res.rows[0];
  }

  /** List all sessions for a user, optionally filtered by status. */
  async listSessions(userId: string, status?: string): Promise<RuntimeSession[]> {
    if (status) {
      const res = await this.db.query(
        `SELECT * FROM rt_runtime_sessions
         WHERE user_id = $1 AND status = $2
         ORDER BY started_at DESC`,
        [userId, status],
      );
      return res.rows;
    }
    const res = await this.db.query(
      `SELECT * FROM rt_runtime_sessions
       WHERE user_id = $1
       ORDER BY started_at DESC`,
      [userId],
    );
    return res.rows;
  }

  /** Get a single session by ID. */
  async getSession(sessionId: string): Promise<RuntimeSession> {
    const res = await this.db.query(
      `SELECT * FROM rt_runtime_sessions WHERE id = $1`,
      [sessionId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return res.rows[0];
  }

  /** Terminate a session — sets status to 'terminated' and records ended_at. */
  async terminateSession(sessionId: string, userId: string): Promise<RuntimeSession> {
    const res = await this.db.query(
      `UPDATE rt_runtime_sessions
       SET status = 'terminated', ended_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [sessionId, userId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Session ${sessionId} not found or not owned by user`);
    }
    this.logger.log(`Session terminated: ${sessionId}`);
    return res.rows[0];
  }
  async activateSession(sessionId: string): Promise<RuntimeSession> {
    const res = await this.db.query(
      `UPDATE rt_runtime_sessions SET status = 'active' WHERE id = $1 RETURNING *`,
      [sessionId],
    );
    return res.rows[0];
  }

  async failSession(sessionId: string, error?: string): Promise<RuntimeSession> {
    const res = await this.db.query(
      `UPDATE rt_runtime_sessions 
       SET status = 'error', ended_at = NOW(), 
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('error', $2::text)
       WHERE id = $1 RETURNING *`,
      [sessionId, error || 'Unknown error'],
    );
    return res.rows[0];
  }

  async pauseSession(sessionId: string, userId: string): Promise<RuntimeSession> {
    const res = await this.db.query(
      `UPDATE rt_runtime_sessions SET status = 'paused' WHERE id = $1 AND user_id = $2 RETURNING *`,
      [sessionId, userId],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Session ${sessionId} not found or not owned by user`);
    }
    return res.rows[0];
  }

  async resumeSession(sessionId: string): Promise<RuntimeSession> {
    const res = await this.db.query(
      `UPDATE rt_runtime_sessions SET status = 'active' WHERE id = $1 RETURNING *`,
      [sessionId],
    );
    return res.rows[0];
  }

  async countActiveSessions(deviceId: string): Promise<number> {
    const res = await this.db.query(
      `SELECT COUNT(*) as count FROM rt_runtime_sessions 
       WHERE device_id = $1 AND status IN ('active', 'creating', 'paused', 'disconnected')`,
      [deviceId],
    );
    return parseInt(res.rows[0].count, 10);
  }

  async syncAliveSessions(deviceId: string, aliveSessionIds: string[]): Promise<void> {
    if (!aliveSessionIds || aliveSessionIds.length === 0) {
      await this.db.query(
        `UPDATE rt_runtime_sessions 
         SET status = 'disconnected' 
         WHERE device_id = $1 AND status IN ('active', 'creating', 'paused')`,
        [deviceId]
      );
    } else {
      await this.db.query(
        `UPDATE rt_runtime_sessions 
         SET status = 'disconnected' 
         WHERE device_id = $1 AND status IN ('active', 'creating', 'paused') AND id <> ALL($2::uuid[])`,
        [deviceId, aliveSessionIds]
      );
    }
  }

  async listSessionsByMapCard(mapCardId: number, userId: string): Promise<RuntimeSession[]> {
    const res = await this.db.query(
      `SELECT * FROM rt_runtime_sessions WHERE map_card_id = $1 AND user_id = $2 ORDER BY started_at DESC`,
      [mapCardId, userId],
    );
    return res.rows;
  }
}
