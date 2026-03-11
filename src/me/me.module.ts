import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { AuthModule } from '../auth/auth.module';
import { ContextBuilderService } from '../auth/context-builder.service';
import { OrganizationsModule } from '../organizations/organizations.module';
import { OrgProjectsModule } from '../org-projects/org-projects.module';

@Module({
  imports: [AuthModule, OrganizationsModule, OrgProjectsModule],
  controllers: [MeController],
  providers: [ContextBuilderService],
})
export class MeModule { }
