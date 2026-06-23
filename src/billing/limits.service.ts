import { Injectable, Inject, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CACHE_REDIS_CLIENT } from '../common/redis/cache-redis.module';
import Redis from 'ioredis';

export interface OrgLimitsAndUsage {
  limits: {
    max_projects: number;
    max_members: number;
    max_cards: number;
    max_nodes: number;
    max_storage_mb: number;
    max_api_requests: number;
    max_ai_requests: number;
    ai_access_enabled: boolean;
    blockchain_enabled: boolean;
    rust_agent_enabled: boolean;
  };
  usage: {
    used_projects: number;
    used_members: number;
    used_cards: number;
    used_nodes: number;
    used_storage_mb: number;
    used_api_requests: number;
    used_ai_requests: number;
  };
}

@Injectable()
export class LimitsService {
  private readonly logger = new Logger(LimitsService.name);

  constructor(
    private supabaseService: SupabaseService,
    @Inject(CACHE_REDIS_CLIENT) private redis: Redis,
  ) {}

  async getLimitsAndUsage(orgId: string): Promise<OrgLimitsAndUsage | null> {
    const cacheKey = `limits:${orgId}`;
    
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      this.logger.warn(`Redis get failed for ${cacheKey}`, e);
    }

    const adminClient = this.supabaseService.getAdminClient() as any;

    const [limitsResult, usageResult] = await Promise.all([
      adminClient.from('org_limits').select('*').eq('org_id', orgId).single(),
      adminClient.from('org_usage').select('*').eq('org_id', orgId).single(),
    ]);

    if (limitsResult.error || !limitsResult.data) {
      this.logger.error(`Limits not found for org ${orgId}`);
      return null;
    }

    if (usageResult.error || !usageResult.data) {
      this.logger.error(`Usage not found for org ${orgId}`);
      return null;
    }

    const data: OrgLimitsAndUsage = {
      limits: limitsResult.data as any,
      usage: usageResult.data as any,
    };

    try {
      await this.redis.set(cacheKey, JSON.stringify(data), 'EX', 60);
    } catch (e) {
      this.logger.warn(`Redis set failed for ${cacheKey}`, e);
    }

    return data;
  }

  async checkLimit(orgId: string, resource: string): Promise<{ allowed: boolean; current: number; max: number }> {
    const data = await this.getLimitsAndUsage(orgId);
    if (!data) {
      // Fail open or fail closed? Fail closed is safer for billing, but could break app if DB is slow.
      // Let's fail open if we literally can't find limits to avoid breaking users, but log heavily.
      this.logger.error(`Could not check limit for ${orgId} - granting access temporarily`);
      return { allowed: true, current: 0, max: 0 };
    }

    let current = 0;
    let max = 0;

    switch (resource) {
      case 'projects':
        current = data.usage.used_projects;
        max = data.limits.max_projects;
        break;
      case 'members':
        current = data.usage.used_members;
        max = data.limits.max_members;
        break;
      case 'cards':
        current = data.usage.used_cards;
        max = data.limits.max_cards;
        break;
      case 'nodes':
        current = data.usage.used_nodes;
        max = data.limits.max_nodes;
        break;
      default:
        this.logger.warn(`Unknown resource limit check: ${resource}`);
        return { allowed: true, current: 0, max: 0 };
    }

    return {
      allowed: current < max,
      current,
      max,
    };
  }

  async invalidateCache(orgId: string) {
    try {
      await this.redis.del(`limits:${orgId}`);
    } catch (e) {
      this.logger.error(`Failed to invalidate limits cache for ${orgId}`, e);
    }
  }
}
