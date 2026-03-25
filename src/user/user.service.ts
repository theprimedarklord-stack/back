import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateUserDto } from './dto/update-user.dto';
import * as crypto from 'crypto';

@Injectable()
export class UserService {
    constructor(private readonly supabaseService: SupabaseService) { }

    async getMe(userId: string) {
        const client = this.supabaseService.getClient();

        const { data, error } = await client
            .from('users')
            .select('user_id, full_name, avatar_url, email, username, last_active_org_id')
            .eq('user_id', userId)
            .single();

        if (error) {
            throw new NotFoundException('User not found');
        }

        const fullName = data?.full_name;
        const username = data?.username;

        return {
            user_id: data?.user_id,
            full_name: fullName ?? null,
            avatar_url: data?.avatar_url ?? null,
            email: data?.email ?? null,
            username: username ?? null,
            active_org_id: data?.last_active_org_id ?? null,
            // Backward/forward compatible alias
            last_active_org_id: data?.last_active_org_id ?? null,
            // Normalize display name: prefer full_name, fallback to username
            name: fullName || username || null,
        };
    }

    async updateMe(userId: string, dto: UpdateUserDto) {
        const client = this.supabaseService.getClient();

        const { data, error } = await client
            .from('users')
            .update(dto)
            .eq('user_id', userId)
            .select('user_id, full_name, avatar_url, email')
            .single();

        if (error) {
            throw new InternalServerErrorException('Failed to update user profile');
        }

        return data;
    }

    async generateAvatarUploadUrl(userId: string, fileName: string) {
        const ext = fileName.split('.').pop();
        const filePath = `${userId}/${crypto.randomUUID()}.${ext}`;
        
        const adminClient = this.supabaseService.getAdminClient();
        const { data, error } = await adminClient
            .storage
            .from('avatars')
            .createSignedUploadUrl(filePath);

        if (error) {
            throw new InternalServerErrorException('Failed to generate upload URL');
        }

        return {
            signedUrl: data.signedUrl,
            path: filePath,
        };
    }

    async updateAvatarInDb(dbClient: any, userId: string, filePath: string) {
        const adminClient = this.supabaseService.getAdminClient();
        const { data } = adminClient.storage.from('avatars').getPublicUrl(filePath);
        
        await dbClient.query(
            `UPDATE users SET avatar_url = $1 WHERE user_id = $2`,
            [data.publicUrl, userId]
        );

        return { avatarUrl: data.publicUrl };
    }
}
