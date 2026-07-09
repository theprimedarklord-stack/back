import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PublicSharesService {
  constructor(private readonly supabaseService: SupabaseService) {}

  // ---------------------------------------------------------------------------
  // AUTHENTICATED CRUD (runs with adminClient / service-role to bypass RLS for UPSERT,
  // since standard RLS policies for public_shares might be restricted)
  // ---------------------------------------------------------------------------

  async publish(userId: string, orgId: string, mapCardId: number, nodeId?: string, permission = 'view') {
    const adminClient = this.supabaseService.getAdminClient();
    const entityType = nodeId ? 'node' : 'map_card';
    const slug = uuidv4().split('-')[0] + '-' + uuidv4().split('-')[1]; // Simple random slug, in real app better to generate something nicer

    // Upsert logic matching the plan
    const { data, error } = await adminClient
      .from('public_shares')
      .upsert({
        organization_id: orgId,
        entity_type: entityType,
        map_card_id: mapCardId,
        node_id: nodeId || null,
        slug,
        permission,
        published_by: userId,
        is_active: true,
        revoked_at: null,
      }, {
        onConflict: entityType === 'node' ? 'map_card_id,node_id' : 'map_card_id',
      })
      .select('slug')
      .single();

    if (error) {
      console.error('[PublicSharesService] Publish error:', error);
      throw new InternalServerErrorException('Failed to publish');
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

    return { slug: data.slug };
  }

  async updateStatus(userId: string, orgId: string, id: string, isActive: boolean) {
    const adminClient = this.supabaseService.getAdminClient();

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

  async getSharesForMapCard(orgId: string, mapCardId: number) {
    const adminClient = this.supabaseService.getAdminClient();
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
    const anonClient = this.supabaseService.getClient(); // This uses anon_key

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
    const anonClient = this.supabaseService.getClient();

    const { data, error } = await anonClient
      .from('public_nodes')
      .select('content')
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      return null;
    }

    return data;
  }
}
