import { IsOptional, IsString, IsUrl, MinLength, MaxLength } from 'class-validator';

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    @MinLength(2)
    @MaxLength(50)
    username?: string;

    @IsOptional()
    @IsString()
    @MaxLength(100)
    full_name?: string;

    @IsOptional()
    @IsUrl()
    @MaxLength(2048)
    avatar_url?: string;

    // Здесь в будущем можно добавить другие личные настройки (тема, язык и т.д.)
}
