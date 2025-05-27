// src/auth/auth.dto.ts
import { IsEmail, IsString, MinLength, IsBoolean, IsOptional, Matches } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Некорректный формат email' })
  email: string;

  @IsString({ message: 'Пароль должен быть строкой' })
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  password: string;

  @IsBoolean({ message: 'rememberMe должен быть булевым значением' })
  @IsOptional() // Делаем поле необязательным
  rememberMe?: boolean;
}

export class RegisterDto {
  @IsEmail({}, { message: 'Некорректный формат email' })
  email: string;

  @IsString({ message: 'Пароль должен быть строкой' })
  @MinLength(6, { message: 'Пароль должен быть не короче 6 символов' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]+$/, {
    message: 'Пароль должен содержать заглавные и строчные буквы, цифры и специальные символы',
  })
  password: string;

  @IsString({ message: 'Имя пользователя должно быть строкой' })
  @MinLength(3, { message: 'Имя пользователя должно быть не короче 3 символов' })
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Имя пользователя может содержать только буквы, цифры, подчеркивания и дефисы',
  })
  username: string;
}