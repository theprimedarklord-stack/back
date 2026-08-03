import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class ArchitectureService {
  constructor(private readonly supabaseService: SupabaseService) {}

  private get supabase() {
    return this.supabaseService.getClient();
  }

  async getModules() {
    const { data, error } = await this.supabase
      .from('arch_modules')
      .select('*');

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const modules = data || [];
    const moduleIds = new Set(modules.map(m => m.id));

    // Edge validation: ensure no dangling dependencies
    const validModules = modules.map(m => {
      const validDependsOn = (m.depends_on || []).filter(id => {
        if (!moduleIds.has(id)) {
          console.warn(`[ArchModules] Dangling reference found: Module ${m.id} depends on non-existent ${id}`);
          return false;
        }
        return true;
      });
      return { ...m, depends_on: validDependsOn };
    });

    return validModules;
  }

  async getModuleById(id: string) {
    const { data, error } = await this.supabase
      .from('arch_modules')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundException(`Module with id ${id} not found`);
      }
      throw new InternalServerErrorException(error.message);
    }

    return data;
  }

  async updateModule(id: string, updateData: any) {
    const { data, error } = await this.supabase
      .from('arch_modules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
    
    if (!data) {
      throw new NotFoundException(`Module with id ${id} not found`);
    }

    return data;
  }

  async getAgentContext() {
    const modules = await this.getModules();
    
    const systems = modules.map(m => ({
      id: m.id,
      name: m.name,
      status: m.status,
      fileCount: (m.files || []).length,
      issueCount: (m.issues || []).length,
      dependsOn: m.depends_on || []
    }));

    return {
      project: "2Brain / SmartMemory",
      version: "Next.js 15.5.7",
      frontend: {
        framework: "Next.js 15.5.7 (App Router)",
        state: "Redux Toolkit + Context + SWR",
        styling: "SCSS Modules + CSS Variables",
        auth: "Cognito + Redis Sessions"
      },
      systems,
      criticalFiles: [
        "src/store/slices/uiSettingsSlice.ts",
        "src/lib/redis/serverSession.ts",
        "src/app/(protected)/adminys/layout.tsx",
        "src/app/api/auth/cognito/route.ts"
      ],
      knownProblems: [
        "Auth state triplicated"
      ],
      lastAudit: new Date().toISOString().split('T')[0]
    };
  }
}
