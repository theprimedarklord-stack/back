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
         (node_id, user_id, device_id, agent_id, runtime_kind, runtime_config, status, metadata)
       VALUES ($1::bigint, $2, $3, $4, $5, $6, 'active', $7)
       RETURNING *`,
      [
        dto.nodeId,
        userId,
        dto.deviceId || null,
        dto.agentId || null,
        dto.runtimeType,
        JSON.stringify(dto.runtimeConfig || {}),
        JSON.stringify(dto.metadata || {}),
      ],
    );
    this.logger.log(`Session created: ${res.rows[0].id} (kind=${dto.runtimeType})`);
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
}
