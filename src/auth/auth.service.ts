// src/auth/auth.service.ts
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  ConfirmSignUpCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import * as crypto from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuthService {
  private cognitoClient: CognitoIdentityProviderClient;
  private clientId: string;
  private clientSecret: string;

  constructor(private supabaseService: SupabaseService) {
    this.cognitoClient = new CognitoIdentityProviderClient({
      region: process.env.COGNITO_REGION || 'eu-central-1',
    });
    this.clientId = process.env.COGNITO_CLIENT_ID || '';
    this.clientSecret = process.env.COGNITO_CLIENT_SECRET || '';
  }

  /**
   * Generate SECRET_HASH required by Cognito Confidential client
   */
  private generateSecretHash(username: string): string {
    const hmac = crypto.createHmac('sha256', this.clientSecret);
    hmac.update(username + this.clientId);
    return hmac.digest('base64');
  }

  /**
   * Register a new user via Cognito SignUp
   */
  async register(email: string, password: string, username: string) {
    // Check email uniqueness in our DB
    const admin = this.supabaseService.getAdminClient();

    const { data: existingEmail } = await admin
      .from('users')
      .select('email')
      .eq('email', email)
      .single();

    if (existingEmail) {
      throw new BadRequestException('Этот email уже зарегистрирован');
    }

    // Check username uniqueness in our DB
    const { data: existingUsername } = await admin
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (existingUsername) {
      throw new BadRequestException('Это имя пользователя уже занято');
    }

    // Register in Cognito
    const secretHash = this.generateSecretHash(email);

    const command = new SignUpCommand({
      ClientId: this.clientId,
      SecretHash: secretHash,
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
      ],
    });

    try {
      const response = await this.cognitoClient.send(command);

      return {
        success: true,
        userConfirmed: response.UserConfirmed ?? false,
        cognitoSub: response.UserSub,
        message: response.UserConfirmed
          ? 'Регистрация завершена'
          : 'Требуется подтверждение email',
      };
    } catch (error: any) {
      if (error.name === 'UsernameExistsException') {
        throw new BadRequestException('Пользователь с таким email уже существует');
      }
      if (error.name === 'InvalidPasswordException') {
        throw new BadRequestException('Пароль не соответствует требованиям безопасности');
      }
      console.error('Cognito SignUp error:', error);
      throw new InternalServerErrorException(`Ошибка регистрации: ${error.message}`);
    }
  }

  /**
   * Confirm email with verification code (if auto-confirm is off)
   */
  async confirmSignUp(email: string, code: string) {
    const secretHash = this.generateSecretHash(email);

    const command = new ConfirmSignUpCommand({
      ClientId: this.clientId,
      SecretHash: secretHash,
      Username: email,
      ConfirmationCode: code,
    });

    try {
      await this.cognitoClient.send(command);
      return { success: true, message: 'Email подтверждён' };
    } catch (error: any) {
      if (error.name === 'CodeMismatchException') {
        throw new BadRequestException('Неверный код подтверждения');
      }
      if (error.name === 'ExpiredCodeException') {
        throw new BadRequestException('Код подтверждения истёк');
      }
      console.error('Cognito ConfirmSignUp error:', error);
      throw new InternalServerErrorException('Ошибка подтверждения');
    }
  }

  /**
   * Login via Cognito InitiateAuth (USER_PASSWORD_AUTH)
   * Returns Cognito tokens: AccessToken, IdToken, RefreshToken
   */
  async login(email: string, password: string) {
    const secretHash = this.generateSecretHash(email);

    const command = new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: this.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
        SECRET_HASH: secretHash,
      },
    });

    try {
      const response = await this.cognitoClient.send(command);
      const result = response.AuthenticationResult;

      if (!result?.AccessToken) {
        throw new UnauthorizedException('Не удалось получить токены');
      }

      // Get user data from our DB for theme etc.
      const admin = this.supabaseService.getAdminClient();
      const { data: userData } = await admin
        .from('users')
        .select('theme, role, username, user_id')
        .eq('email', email)
        .single();

      return {
        accessToken: result.AccessToken,
        idToken: result.IdToken,
        refreshToken: result.RefreshToken,
        expiresIn: result.ExpiresIn,
        theme: userData?.theme || 'light',
        user_id: userData?.user_id,
      };
    } catch (error: any) {
      if (
        error.name === 'NotAuthorizedException' ||
        error.name === 'UserNotFoundException'
      ) {
        throw new UnauthorizedException('Неверный email или пароль');
      }
      if (error.name === 'UserNotConfirmedException') {
        throw new BadRequestException('Email не подтверждён');
      }
      // Re-throw our own exceptions
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Cognito InitiateAuth error:', error);
      throw new InternalServerErrorException('Ошибка входа');
    }
  }
}