import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export type UserContextOptions = {
  /**
   * If true, uses `BEGIN READ ONLY` to reduce overhead while keeping
   * `set_config(..., true)` transaction-local (no context leakage in pools).
   */
  readOnly?: boolean;
  /**
   * Optional label for perf logging.
   */
  label?: string;
};

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor(private config: ConfigService) {
    const connectionString = this.config.get<string>('APP_DATABASE_URL');
    if (!connectionString) {
      throw new Error('APP_DATABASE_URL is required');
    }

    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 20,
    });

    // Handle idle client errors to prevent crash
    this.pool.on('error', (err: any, client: any) => {
      console.error('Unexpected error on idle client', err);
      // process.exit(-1); // Do not exit, just log
    });
  }

  async onModuleInit() {
    await this.pool.query('SELECT 1');

    // DEBUG: List all tables in public schema to verify visibility
    try {
      const res = await this.pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      console.log('[DatabaseService] Tables in public schema:', res.rows.map(r => r.table_name));
    } catch (e) {
      console.error('[DatabaseService] Failed to list tables:', e);
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query(text: string, params?: any[]) {
    return this.pool.query(text, params);
  }

  /**
   * Run callback inside a transaction with app.org_id set locally for RLS.
   * The callback receives a connected client and may run multiple queries.
   * 
   * Использует SET LOCAL паттерн для Session Context:
   * 1. SET LOCAL search_path - гарантирует видимость таблиц в public схеме
   * 2. SET LOCAL "app.org_id" - устанавливает контекст организации для RLS
   * 
   * Преимущества:
   * - Работает везде (Supabase, AWS RDS, Docker)
   * - Не требует прав суперпользователя
   * - Автоматически удаляется при завершении транзакции
   */
  async withOrgContext<T>(orgId: string, callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Устанавливаем путь к схемам в этой транзакции
      await client.query('SET LOCAL search_path TO public, extensions');

      // 2. Устанавливаем ID организации для RLS политик
      if (orgId) {
        await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
      }

      // 3. Выполняем основной код
      const res = await callback(client);

      await client.query('COMMIT');
      return res;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[DatabaseService] Transaction failed:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Run callback inside a transaction with app.user_id (and optionally app.org_id) set locally for RLS.
   * The callback receives a connected client and may run multiple queries.
   * 
   * Supports two call signatures:
   *   withUserContext(userId, callback)          — sets only app.user_id
   *   withUserContext(userId, orgId, callback)   — sets app.user_id AND app.org_id
   * 
   * Использует SET LOCAL паттерн для Session Context:
   * 1. SET LOCAL search_path - гарантирует видимость таблиц в public схеме
   * 2. SET LOCAL "app.user_id" - устанавливает контекст пользователя для RLS
   * 3. SET LOCAL "app.org_id" - устанавливает контекст организации для RLS (если передан)
   */
  async withUserContext<T>(
    userId: string,
    orgIdOrCallback: string | null | ((client: any) => Promise<T>),
    callbackOrOptions?: ((client: any) => Promise<T>) | UserContextOptions,
    options?: UserContextOptions,
  ): Promise<T> {
    // Support both 2-arg and 3-arg overloads
    let orgId: string | null = null;
    let cb: (client: any) => Promise<T>;
    let opts: UserContextOptions = {};

    if (typeof orgIdOrCallback === 'function') {
      cb = orgIdOrCallback;
      // withUserContext(userId, callback, options?)
      if (callbackOrOptions && typeof callbackOrOptions === 'object') {
        opts = callbackOrOptions;
      }
    } else {
      orgId = orgIdOrCallback;
      cb = callbackOrOptions as (client: any) => Promise<T>;
      opts = options || {};
    }

    const client = await this.pool.connect();
    const startedAt = Date.now();
    const label = opts.label ? ` ${opts.label}` : '';
    const orgIdValue = orgId ?? '';

    // One-shot transaction-local context setter (safe for pooled connections).
    // We must keep `is_local=true` to avoid session-level leakage.
    const buildSetConfigSql = () =>
      `SELECT
        set_config('search_path', 'public, extensions', true),
        set_config('app.user_id', $1, true),
        set_config('app.org_id', $2, true)`;

    try {
      const tBegin = Date.now();
      await client.query(opts.readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
      const beginMs = Date.now() - tBegin;

      const tSet = Date.now();
      await client.query(buildSetConfigSql(), [userId, orgIdValue]);
      const setMs = Date.now() - tSet;

      // 4. Выполняем основной код (SELECT, INSERT, UPDATE, DELETE)
      const tCb = Date.now();
      const res = await cb(client);
      const cbMs = Date.now() - tCb;

      const tCommit = Date.now();
      await client.query('COMMIT');
      const commitMs = Date.now() - tCommit;

      const totalMs = Date.now() - startedAt;
      console.log(
        `[withUserContext]${label} total=${totalMs}ms begin=${beginMs}ms set_config=${setMs}ms cb=${cbMs}ms commit=${commitMs}ms`,
      );
      return res;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      console.error('[DatabaseService] Transaction failed:', err.message);
      throw err;
    } finally {
      client.release();
    }
  }
}
