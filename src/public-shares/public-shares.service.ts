import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import * as crypto from 'crypto';

@Injectable()
export class PublicSharesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  // ---------------------------------------------------------------------------
  // AUTHENTICATED CRUD (runs with adminClient / service-role to bypass RLS for UPSERT,
  // since standard RLS policies for public_shares might be restricted)
  // ---------------------------------------------------------------------------

  async publish(userId: string, orgId: string, mapCardId: number, nodeId?: string, permission = 'view') {
    const adminClient = this.supabaseService.getAdminClient() as any;
    const entityType = nodeId ? 'node' : 'map_card';
    const uuidStr = crypto.randomUUID();
    const slug = uuidStr.split('-')[0] + '-' + uuidStr.split('-')[1]; // Simple random slug, in real app better to generate something nicer

    // Upsert logic rewritten to avoid ON CONFLICT with partial indexes
    let query = adminClient
      .from('public_shares')
      .select('id, slug, is_active')
      .eq('organization_id', orgId)
      .eq('map_card_id', mapCardId)
      .eq('entity_type', entityType);

    if (entityType === 'node' && nodeId) {
      query = query.eq('node_id', nodeId);
    } else {
      query = query.is('node_id', null);
    }

    const { data: existing, error: findError } = await query.maybeSingle();

    if (findError) {
      console.error('[PublicSharesService] Find error:', findError);
      throw new InternalServerErrorException('Failed to check existing share');
    }

    let resultSlug = slug;

    if (existing) {
      // Update existing
      resultSlug = existing.slug;
      const { error: updateError } = await adminClient
        .from('public_shares')
        .update({
          is_active: true,
          revoked_at: null,
          permission,
          published_by: userId
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('[PublicSharesService] Update error:', updateError);
        throw new InternalServerErrorException('Failed to update share');
      }
    } else {
      // Insert new
      const { error: insertError } = await adminClient
        .from('public_shares')
        .insert({
          organization_id: orgId,
          entity_type: entityType,
          map_card_id: mapCardId,
          node_id: nodeId || null,
          slug,
          permission,
          published_by: userId,
          is_active: true,
          revoked_at: null,
        });

      if (insertError) {
        console.error('[PublicSharesService] Insert error:', insertError);
        throw new InternalServerErrorException('Failed to insert share');
      }
    }

    // If node, call sync_public_node
    if (entityType === 'node') {
      const { error: syncError } = await adminClient.rpc('sync_public_node', {
        p_map_card_id: mapCardId,
        p_node_id: nodeId,
      });
      if (syncError) {
        console.error('[PublicSharesService] sync_public_node error:', syncError);
      }
    }

    return { slug: resultSlug };
  }

  async updateStatus(userId: string, orgId: string, id: string, isActive: boolean) {
    const adminClient = this.supabaseService.getAdminClient() as any;

    const { data: share, error: fetchError } = await adminClient
      .from('public_shares')
      .select('map_card_id, node_id, entity_type')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    if (fetchError || !share) {
      throw new NotFoundException('Share not found');
    }

    const { error: updateError } = await adminClient
      .from('public_shares')
      .update({
        is_active: isActive,
        revoked_at: isActive ? null : new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', orgId);

    if (updateError) {
      throw new InternalServerErrorException('Failed to update share status');
    }

    if (share.entity_type === 'node') {
      await adminClient.rpc('sync_public_node', {
        p_map_card_id: share.map_card_id,
        p_node_id: share.node_id,
      });
    }

    return { success: true };
  }

  /**
   * Усе, що ця людина опублікувала в цій організації.
   *
   * Назви приїжджають окремими запитами, а не через `join`: `public_shares`
   * адресує ноду парою `(map_card_id, node_id)`, і зв'язку на `map_nodes` у
   * таблиці немає — з'єднати їх у PostgREST нічим.
   *
   * Фільтр по `published_by` тут обов'язковий: клієнт адміністратора обходить
   * RLS, і без нього в сайдбар приїхали б чужі публікації організації.
   */
  async getSharesForUser(orgId: string, userId: string) {
    const adminClient = this.supabaseService.getAdminClient() as any;

    const { data, error } = await adminClient
      .from('public_shares')
      .select('*')
      .eq('organization_id', orgId)
      .eq('published_by', userId)
      .order('published_at', { ascending: false });

    if (error) throw new InternalServerErrorException('Failed to fetch shares');

    const shares = data || [];
    if (shares.length === 0) return [];

    const cardIds = [...new Set(shares.map((row: any) => row.map_card_id).filter(Boolean))];
    const nodeIds = [...new Set(shares.map((row: any) => row.node_id).filter(Boolean))];

    const [cards, nodes] = await Promise.all([
      cardIds.length
        ? adminClient.from('map_cards').select('id, title').in('id', cardIds)
        : Promise.resolve({ data: [] }),
      nodeIds.length
        ? adminClient.from('map_nodes').select('id, title, kind').in('id', nodeIds)
        : Promise.resolve({ data: [] }),
    ]);

    const cardTitle = new Map<string, string>(
      (cards.data || []).map((row: any) => [String(row.id), row.title]),
    );
    const nodeRow = new Map<string, any>((nodes.data || []).map((row: any) => [row.id, row]));

    return shares.map((share: any) => {
      const node = share.node_id ? nodeRow.get(share.node_id) : null;
      return {
        ...share,
        title: node?.title || cardTitle.get(String(share.map_card_id)) || '',
        node_kind: node?.kind || null,
      };
    });
  }

  async getSharesForMapCard(orgId: string, mapCardId: number) {
    const adminClient = this.supabaseService.getAdminClient() as any;
    const { data, error } = await adminClient
      .from('public_shares')
      .select('*')
      .eq('organization_id', orgId)
      .eq('map_card_id', mapCardId);

    if (error) throw new InternalServerErrorException('Failed to fetch shares');
    return data || [];
  }

  // ---------------------------------------------------------------------------
  // PUBLIC GET (runs with anonClient)
  // ---------------------------------------------------------------------------

  async getPublicMapCard(slug: string) {
    const anonClient = this.supabaseService.getClient() as any; // This uses anon_key

    const { data: share, error: shareError } = await anonClient
      .from('public_shares')
      .select('map_card_id')
      .eq('slug', slug)
      .eq('entity_type', 'map_card')
      .eq('is_active', true)
      .single();

    if (shareError || !share) {
      return null;
    }

    const { data: mapCard, error: mapCardError } = await anonClient
      .from('map_cards')
      .select('data_core')
      .eq('id', share.map_card_id)
      .single();

    if (mapCardError || !mapCard) {
      return null;
    }

    return mapCard;
  }

  async getPublicNode(slug: string) {
    const anonClient = this.supabaseService.getClient() as any;

    const { data, error } = await anonClient
      .from('public_nodes')
      .select('content')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return null;
    }

    return data.content;
  }
}
