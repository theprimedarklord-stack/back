import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';

export interface NodeCapabilityRow {
  id: string;
  node_id: string;
  slug: string;
  config: Record<string, any>;
  created_at: string;
}

@Injectable()
export class CapabilitiesService {
  constructor(private db: DatabaseService) {}

  /** List all capabilities attached to a node. */
  async listByNode(nodeId: string): Promise<NodeCapabilityRow[]> {
    const res = await this.db.query(
      `SELECT id, node_id, slug, config, created_at
       FROM node_capabilities
       WHERE node_id = $1
       ORDER BY created_at`,
      [nodeId],
    );
    return res.rows;
  }

  /** Attach a capability to a node. */
  async attach(
    nodeId: string,
    slug: string,
    config: Record<string, any> = {},
  ): Promise<NodeCapabilityRow> {
    const res = await this.db.query(
      `INSERT INTO node_capabilities (node_id, slug, config)
       VALUES ($1, $2, $3)
       ON CONFLICT (node_id, slug) DO UPDATE SET config = $3
       RETURNING id, node_id, slug, config, created_at`,
      [nodeId, slug, JSON.stringify(config)],
    );
    return res.rows[0];
  }

  /** Detach a capability from a node. */
  async detach(nodeId: string, slug: string): Promise<void> {
    const res = await this.db.query(
      `DELETE FROM node_capabilities WHERE node_id = $1 AND slug = $2`,
      [nodeId, slug],
    );
    if (res.rowCount === 0) {
      throw new NotFoundException(`Capability '${slug}' not found on node ${nodeId}`);
    }
  }

  /** Update the config of an attached capability. */
  async updateConfig(
    nodeId: string,
    slug: string,
    config: Record<string, any>,
  ): Promise<NodeCapabilityRow> {
    const res = await this.db.query(
      `UPDATE node_capabilities
       SET config = $3
       WHERE node_id = $1 AND slug = $2
       RETURNING id, node_id, slug, config, created_at`,
      [nodeId, slug, JSON.stringify(config)],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Capability '${slug}' not found on node ${nodeId}`);
    }
    return res.rows[0];
  }
}
