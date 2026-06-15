import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import * as crypto from 'crypto';
import { GenerateUploadUrlDto } from './dto/generate-upload-url.dto';

@Injectable()
export class MediaService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async generateSignedUploadUrl(orgId: string, userId: string, dto: GenerateUploadUrlDto) {
    const { fileName, mapCardId } = dto;
    const uuid = crypto.randomUUID();
    
    // Формат пути: ${orgId}/${mapCardId}/${uuid}-${fileName}
    // Используем encodeURIComponent для безопасного имени файла
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${orgId}/${mapCardId}/${uuid}-${safeFileName}`;
    
    const adminClient = this.supabaseService.getAdminClient();
    
    const { data, error } = await adminClient.storage
      .from('mapcard-media')
      .createSignedUploadUrl(filePath);

    if (error) {
      throw new InternalServerErrorException(`Failed to create signed upload URL: ${error.message}`);
    }

    // Возвращаем URL для загрузки и путь
    return {
      uploadUrl: data.signedUrl,
      path: data.path,
      // В будущем фронтенд может получить публичную ссылку на этот файл 
      // (или подписанную для чтения, в зависимости от того, бакет публичный или нет)
    };
  }
}
