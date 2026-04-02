import { IsString, IsInt, IsOptional, IsArray, ValidateNested, IsBoolean, IsIn, Min, Max } from 'class-validator';
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
    @IsString() type: string;
    @IsOptional() width?: number | string;
    @IsOptional() height?: number | string;
    @IsOptional() x?: number;
    @IsOptional() y?: number;
    @IsOptional() @IsBoolean() isMinimized?: boolean;
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
    @Max(700)
    @Type(() => Number)
    sidebar_width?: number;

    @IsOptional()
    @IsString()
    @IsIn(['expanded', 'collapsed', 'hover', 'overlay'])
    sidebar_mode?: string;

    // Существующие поля
    @IsOptional()
    @IsString()
    @IsIn(['indicator', 'simple'])
    on_this_page_display_mode?: string;

    @IsOptional()
    @IsString()
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
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => WindowDto)
    active_windows?: WindowDto[];

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
