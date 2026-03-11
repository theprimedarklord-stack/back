import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UserService {
    constructor(private readonly supabaseService: SupabaseService) { }

    async getMe(userId: string) {
        const client = this.supabaseService.getClient();

        const { data, error } = await client
            .from('users')
            .select('user_id, full_name, avatar_url, email')
            .eq('user_id', userId)
            .single();

        if (error) {
            throw new NotFoundException('User not found');
        }

        return data;
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
}
