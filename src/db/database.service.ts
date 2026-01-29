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
   */
  async withOrgContext<T>(orgId: string, callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.org_id', $1, true)", [orgId]);
      const res = await callback(client);
      await client.query('COMMIT');
      return res;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Run callback inside a transaction with app.user_id set locally for RLS.
   * The callback receives a connected client and may run multiple queries.
   * 
   * Note: SET LOCAL search_path ensures that schema resolution works correctly
   * when using transaction poolers (Supabase port 6543), which may reuse
   * sessions and leave search_path uninitialized.
   */
  async withUserContext<T>(userId: string, callback: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      // ПРИНУДИТЕЛЬНО задаем схему. Это лечит ошибку "relation does not exist",
      // так как транзакция иногда инициализируется с пустым путем поиска
      // при использовании Transaction Pooler (порт 6543).
      await client.query('SET LOCAL search_path TO public, extensions');
      
      // Устанавливаем ID пользователя для RLS политик
      await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
      
      const res = await callback(client);
      await client.query('COMMIT');
      return res;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
