import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '../infrastructure/database/prisma.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES,
  ARGON2_OPTIONS,
} from './constants/auth.constants';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.client.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Cuenta bloqueada temporalmente por intentos fallidos',
      );
    }

    const passwordValid = await argon2.verify(user.passwordHash, password);

    if (!passwordValid) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    return user;
  }

  async issueTokens(user: { id: string; email: string; role: string }) {
    const accessToken = this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );

    const refreshToken = this.jwt.sign(
      { sub: user.id },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      },
    );

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: this.hashRefreshToken(refreshToken) },
    });

    const csrfToken = crypto.randomBytes(32).toString('hex');

    return { accessToken, refreshToken, csrfToken };
  }

  async refreshTokens(rawRefreshToken: string) {
    let payload: { sub: string };
    try {
      payload = this.jwt.verify(rawRefreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(
        'Sesión expirada, vuelve a iniciar sesión',
      );
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException();
    }

    if (this.hashRefreshToken(rawRefreshToken) !== user.refreshTokenHash) {
      await this.prisma.client.user.update({
        where: { id: user.id },
        data: { refreshTokenHash: null },
      });
      throw new UnauthorizedException(
        'Sesión inválida, vuelve a iniciar sesión',
      );
    }

    return this.issueTokens(user);
  }

  async revokeSession(userId: string) {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
  }

  async validateGoogleLogin(email: string, emailVerified: boolean) {
    if (!emailVerified) {
      throw new UnauthorizedException('Email de Google no verificado');
    }

    const user = await this.prisma.client.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new UnauthorizedException(
        'Esta cuenta de Google no está autorizada',
      );
    }

    await this.prisma.client.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return user;
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.client.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const currentValid = await argon2.verify(
      user.passwordHash,
      currentPassword,
    );

    if (!currentValid) {
      throw new UnauthorizedException('La contraseña actual no es correcta');
    }

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        passwordHash: await argon2.hash(newPassword, ARGON2_OPTIONS),
        refreshTokenHash: null,
      },
    });
  }

  private async registerFailedAttempt(userId: string, currentAttempts: number) {
    const attempts = currentAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_LOGIN_ATTEMPTS;

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000)
          : null,
      },
    });
  }

  private hashRefreshToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }
}
