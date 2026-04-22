import { IsString, IsInt, IsOptional, IsArray, ValidateNested, IsBoolean, IsIn, Min, Max, IsObject, IsNumber, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

// ─────────────────────────────────────────────────────
// Вложенные DTO для JSON-полей (L2: Persistent UI State)
// ─────────────────────────────────────────────────────

export class UiTogglesDto {
    @IsOptional() @IsBoolean() isHeaderHidden?: boolean;
    @IsOptional() @IsBoolean() isSplitMode?: boolean;
    @IsOptional() @IsBoolean() isPomodoroActive?: boolean;
    @IsOptional() @IsBoolean() isFullscreen?: boolean;
    @IsOptional() @IsBoolean() isFpsMonitorActive?: boolean;
}

export class SidebarFooterConfigDto {
    @IsOptional() @IsString() buttonSize?: string;
    @IsOptional() @IsArray() @IsString({ each: true }) selectedButtons?: string[];
}

export class WindowDto {
    @IsString() id: string;
    @IsString() kind: string;

    @IsOptional() @IsObject() payload?: any;
    @IsOptional() @IsObject() meta?: any;
    @IsOptional() @IsObject() position?: { x: number; y: number };
    @IsOptional() @IsObject() size?: { width: number; height: number };
    @IsOptional() @IsString() state?: string;
    @IsOptional() @IsNumber() zIndex?: number;
}

export class PinnedFavoriteDto {
    @IsString() id: string;
    @IsString() label: string;
    @IsString() href: string;
    @IsString() type: string;
}

// ─────────────────────────────────────────────────────
// Основной DTO: PATCH /user/settings
// ─────────────────────────────────────────────────────

export class UpdateUserSettingsDto {
    // L1: SSR-критичные поля (проксируются в cookie для Next.js layout.tsx)
    @IsOptional()
    @IsString()
    @IsIn(['light', 'dark'])
    theme?: string;

    @IsOptional()
    @IsString()
    @IsIn(['en', 'uk', 'ru'])
    language?: string;

    @IsOptional()
    @IsInt()
    @Min(150)
    @Max(3840)
    @Type(() => Number)
    sidebar_width?: number;

    @IsOptional()
    @IsString()
    @IsIn(['expanded', 'collapsed', 'hover', 'overlay'])
    sidebar_mode?: string;

    @IsOptional()
    @IsString()
    @IsIn(['modal', 'workspace'])
    ui_mode?: string;

    // Существующие поля
    @IsOptional()
    @IsString()
    @IsIn(['indicator', 'simple'])
    on_this_page_display_mode?: string;

    @IsOptional()
    @IsString()
    @IsIn(['online', 'away', 'busy', 'offline'])
    @MaxLength(32)
    user_status?: string;

    // L2: JSON-объекты (Persistent UI State, синхронизируется через Redux Persist + debounce)
    @IsOptional()
    @ValidateNested()
    @Type(() => UiTogglesDto)
    ui_toggles?: UiTogglesDto;

    @IsOptional()
    @ValidateNested()
    @Type(() => SidebarFooterConfigDto)
    sidebar_footer_config?: SidebarFooterConfigDto;

    // L2: JSON-массивы
    @IsOptional()
    @IsObject()
    active_windows?: Record<string, any>; // Принимает наш словарь { org_id: [...] }

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    sidebar_order?: string[];

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PinnedFavoriteDto)
    pinned_favorites?: PinnedFavoriteDto[];
}
