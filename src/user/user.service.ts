import { Injectable, InternalServerErrorException, BadRequestException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import * as crypto from 'crypto';

@Injectable()
export class UserService {
    constructor(private readonly supabaseService: SupabaseService) { }

    // ─────────────────────────────────────────────────────
    // 🛡️ ЖЁСТКИЙ WHITELIST КОЛОНОК (Защита от SQL-инъекций)
    // Имена колонок нельзя параметризовать ($1, $2...),
    // поэтому фильтруем их через Set ПЕРЕД подстановкой в SQL.
    // ─────────────────────────────────────────────────────
    private readonly ALLOWED_SETTINGS_COLUMNS = new Set([
        'sidebar_width', 'theme', 'language', 'sidebar_mode',
        'on_this_page_display_mode', 'user_status', 'ui_toggles',
        'sidebar_footer_config', 'active_windows', 'sidebar_order',
        'pinned_favorites',
    ]);

    /**
     * GET /user/settings — Читает все настройки текущего пользователя.
     * user_id берётся из current_setting('app.user_id'), установленного RlsContextInterceptor.
     */
    async getSettings(dbClient: any) {
        const query = `
            SELECT * FROM public.user_settings
            WHERE user_id = (NULLIF(current_setting('app.user_id', true), '')::uuid)
        `;
        const result = await dbClient.query(query);
        return result.rows[0] || null;
    }

    /**
     * PATCH /user/settings — Безопасный UPSERT настроек пользователя.
     *
     * Ключевые защиты:
     * 1. Whitelist колонок — Object.keys(dto) фильтруются через ALLOWED_SETTINGS_COLUMNS
     * 2. Параметризованные значения — $1, $2... защищают от SQL-инъекций в VALUES
     * 3. current_setting('app.user_id') — user_id берётся из транзакционного контекста,
     *    а не из тела запроса (невозможно подменить)
     * 4. class-validator DTO с forbidNonWhitelisted: true — NestJS отсекает мусор ДО контроллера
     */
    async updateSettings(dbClient: any, dto: UpdateUserSettingsDto) {
        // 1. Фильтруем ключи строго по whitelist
        const keys = Object.keys(dto).filter(k => this.ALLOWED_SETTINGS_COLUMNS.has(k));

        if (keys.length === 0) {
            return { success: true, message: 'No valid fields provided' };
        }

        // 2. Подготавливаем значения (сериализуем JSON для объектов/массивов)
        const vals = keys.map(k => typeof dto[k] === 'object' ? JSON.stringify(dto[k]) : dto[k]);

        // 3. Формируем безопасные параметризованные строки
        const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        const insertCols = keys.map(k => `"${k}"`).join(', ');
        const insertVals = keys.map((_, i) => `$${i + 1}`).join(', ');

        // 4. UPSERT: INSERT если записи нет, UPDATE если есть
        const query = `
            INSERT INTO public.user_settings (user_id, ${insertCols})
            VALUES ((NULLIF(current_setting('app.user_id', true), '')::uuid), ${insertVals})
            ON CONFLICT (user_id)
            DO UPDATE SET ${setClauses}, updated_at = now()
            RETURNING *;
        `;

        const result = await dbClient.query(query, vals);
        return result.rows[0];
    }


    async getMe(dbClient: any, userId: string) {
        const queryText = `
            SELECT 
                user_id, 
                full_name, 
                avatar_url, 
                email, 
                username, 
                last_active_org_id
            FROM users 
            WHERE user_id = $1
        `;

        const result = await dbClient.query(queryText, [userId]);

        if (result.rows.length === 0) {
            throw new NotFoundException('User not found');
        }

        const data = result.rows[0];
        const fullName = data.full_name;
        const username = data.username;

        return {
            user_id: data.user_id,
            full_name: fullName ?? null,
            avatar_url: data.avatar_url ?? null,
            email: data.email ?? null,
            username: username ?? null,
            active_org_id: data.last_active_org_id ?? null,
            // Backward/forward compatible alias
            last_active_org_id: data.last_active_org_id ?? null,
            // Normalize display name: prefer full_name, fallback to username
            name: fullName || username || null,
        };
    }

    async updateMe(dbClient: any, dto: UpdateUserDto) {
        // Build SET clause dynamically — only update fields that were provided
        const fieldMap: Record<keyof UpdateUserDto, string> = {
            username: 'username',
            full_name: 'full_name',
            avatar_url: 'avatar_url',
        };

        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        for (const [dtoKey, column] of Object.entries(fieldMap)) {
            if (dto[dtoKey as keyof UpdateUserDto] !== undefined) {
                setClauses.push(`${column} = $${paramIndex++}`);
                values.push(dto[dtoKey as keyof UpdateUserDto]);
            }
        }

        if (setClauses.length === 0) {
            throw new BadRequestException('No fields provided for update');
        }

        // Always touch updated_at when something changes
        setClauses.push('updated_at = NOW()');

        const queryText = `
            UPDATE public.users
            SET ${setClauses.join(', ')}
            WHERE user_id = (current_setting('app.user_id', true))::uuid
            RETURNING user_id, username, full_name, avatar_url, email
        `;

        const result = await dbClient.query(queryText, values);

        if (result.rows.length === 0) {
            throw new NotFoundException('User not found or RLS blocked the update');
        }

        return result.rows[0];
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
