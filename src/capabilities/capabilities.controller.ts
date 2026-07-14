import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
} from '@nestjs/common';
import { CapabilityRegistry } from './capability.registry';
import { CapabilitiesService } from './capabilities.service';

@Controller()
export class CapabilitiesController {
  constructor(
    private registry: CapabilityRegistry,
    private capabilitiesService: CapabilitiesService,
  ) {}

  /** GET /capabilities — list all registered capabilities from the in-memory registry. */
  @Get('capabilities')
  listAll() {
    return this.registry.listAll();
  }

  /** GET /nodes/:id/capabilities — get capabilities attached to a specific node from DB. */
  @Get('nodes/:id/capabilities')
  async getNodeCapabilities(@Param('id') nodeId: string) {
    return this.capabilitiesService.listByNode(nodeId);
  }

  /** POST /nodes/:id/capabilities — attach a capability to a node. */
  @Post('nodes/:id/capabilities')
  async attachCapability(
    @Param('id') nodeId: string,
    @Body() body: { slug: string; config?: Record<string, any> },
  ) {
    return this.capabilitiesService.attach(nodeId, body.slug, body.config);
  }

  /** DELETE /nodes/:id/capabilities/:slug — detach a capability from a node. */
  @Delete('nodes/:id/capabilities/:slug')
  async detachCapability(
    @Param('id') nodeId: string,
    @Param('slug') slug: string,
  ) {
    await this.capabilitiesService.detach(nodeId, slug);
    return { success: true };
  }

  /** PATCH /nodes/:id/capabilities/:slug/config — update the capability config. */
  @Patch('nodes/:id/capabilities/:slug/config')
  async updateConfig(
    @Param('id') nodeId: string,
    @Param('slug') slug: string,
    @Body() config: Record<string, any>,
  ) {
    return this.capabilitiesService.updateConfig(nodeId, slug, config);
  }
}
