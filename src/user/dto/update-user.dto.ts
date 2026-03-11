import { IsOptional, IsString, IsUrl } from 'class-validator';

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    full_name?: string;

    @IsOptional()
    @IsUrl()
    avatar_url?: string;

    // Здесь в будущем можно добавить другие личные настройки (тема, язык и т.д.)
}
