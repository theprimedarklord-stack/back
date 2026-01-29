import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor(private config: ConfigService) {
    const connectionString = this.config.get<string>('DATABASE_URL');
    if (!connectionString) {
      throw new Error('DATABASE_URL is required');
    }

    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 20,
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
   * Run callback inside a transaction with app.user_id set locally for RLS.
   * The callback receives a connected client and may run multiple queries.
   * 
   * Использует SET LOCAL паттерн для Session Context:
   * 1. SET LOCAL search_path - гарантирует видимость таблиц в public схеме
   * 2. SET LOCAL "app.user_id" - устанавливает контекст пользователя для RLS
   * 
   * Преимущества:
   * - Работает везде (Supabase, AWS RDS, Docker)
   * - Не требует прав суперпользователя
   * - Автоматически удаляется при завершении транзакции
   */
  async withUserContext<T>(userId: string, callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Устанавливаем путь к схемам в этой транзакции
      // Без этого Postgres может "потерять" таблицы при переиспользовании сессий
      await client.query('SET LOCAL search_path TO public, extensions');

      // 2. Устанавливаем ID пользователя для RLS политик
      // Используем SELECT set_config(..., true) вместо SET LOCAL
      // Третий параметр true означает "is_local" - переменная существует только в транзакции
      if (userId) {
        await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      }

      // 3. Выполняем основной код (SELECT, INSERT, UPDATE, DELETE)
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
}
