import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import * as crypto from 'node:crypto';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AppException } from '../common/errors/app.exception';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MINUTES,
  ARGON2_OPTIONS,
  REFRESH_REUSE_GRACE_SECONDS,
} from './constants/auth.constants';

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  sessionVersion: number;
}

export interface RefreshedTokens {
  accessToken: string;
  csrfToken: string;
}

export interface IssuedTokens extends RefreshedTokens {
  refreshToken: string;
}

interface RefreshTokenPayload {
  sub: string;
  sv: number;
  jti?: string;
}

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

  async issueTokens(user: SessionUser): Promise<IssuedTokens> {
    const tokens = this.signTokens(user);
    await this.prisma.client.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: this.hashRefreshToken(tokens.refreshToken),
        previousRefreshTokenHash: null,
        refreshRotatedAt: null,
      },
    });
    return tokens;
  }

  async refreshTokens(rawRefreshToken: string): Promise<RefreshedTokens> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwt.verify<RefreshTokenPayload>(rawRefreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(
        'Sesión expirada, vuelve a iniciar sesión',
      );
    }

    const presentedHash = this.hashRefreshToken(rawRefreshToken);
    const user = await this.findActiveSessionUser(payload);

    if (presentedHash === user.refreshTokenHash) {
      const rotated = await this.rotate(user, presentedHash);
      if (rotated) return rotated;
    }

    const current = await this.findActiveSessionUser(payload);
    if (this.isWithinReuseGrace(current, presentedHash)) {
      return this.signAccessOnly(current);
    }

    await this.revokeAllSessions(user.id);
    throw new UnauthorizedException('Sesión inválida, vuelve a iniciar sesión');
  }

  async revokeSession(userId: string) {
    await this.revokeAllSessions(userId);
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
      throw new AppException('AUTH_CURRENT_PASSWORD_INVALID');
    }
    if (currentPassword === newPassword) {
      throw new AppException('AUTH_PASSWORD_UNCHANGED');
    }

    return this.prisma.client.user.update({
      where: { id: userId },
      data: {
        passwordHash: await argon2.hash(newPassword, ARGON2_OPTIONS),
        refreshTokenHash: null,
        previousRefreshTokenHash: null,
        refreshRotatedAt: null,
        sessionVersion: { increment: 1 },
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

  private signTokens(user: SessionUser): IssuedTokens {
    const refreshToken = this.jwt.sign(
      {
        sub: user.id,
        sv: user.sessionVersion,
        jti: crypto.randomUUID(),
      } satisfies RefreshTokenPayload,
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      },
    );
    return { ...this.signAccessOnly(user), refreshToken };
  }

  private signAccessOnly(user: SessionUser): RefreshedTokens {
    const accessToken = this.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        sv: user.sessionVersion,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
    );
    const csrfToken = crypto.randomBytes(32).toString('hex');
    return { accessToken, csrfToken };
  }

  private async rotate(
    user: SessionUser,
    presentedHash: string,
  ): Promise<IssuedTokens | null> {
    const tokens = this.signTokens(user);
    const result = await this.prisma.client.user.updateMany({
      where: {
        id: user.id,
        isActive: true,
        sessionVersion: user.sessionVersion,
        refreshTokenHash: presentedHash,
      },
      data: {
        refreshTokenHash: this.hashRefreshToken(tokens.refreshToken),
        previousRefreshTokenHash: presentedHash,
        refreshRotatedAt: new Date(),
      },
    });
    return result.count === 1 ? tokens : null;
  }

  private async findActiveSessionUser(payload: RefreshTokenPayload) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: payload.sub },
    });
    if (
      !user ||
      !user.isActive ||
      !user.refreshTokenHash ||
      payload.sv !== user.sessionVersion
    ) {
      throw new UnauthorizedException(
        'Sesión inválida, vuelve a iniciar sesión',
      );
    }
    return user;
  }

  private isWithinReuseGrace(
    user: {
      previousRefreshTokenHash: string | null;
      refreshRotatedAt: Date | null;
    },
    presentedHash: string,
  ): boolean {
    if (
      !user.previousRefreshTokenHash ||
      !user.refreshRotatedAt ||
      user.previousRefreshTokenHash !== presentedHash
    ) {
      return false;
    }
    const elapsedMs = Date.now() - user.refreshRotatedAt.getTime();
    return elapsedMs <= REFRESH_REUSE_GRACE_SECONDS * 1000;
  }

  private async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        refreshTokenHash: null,
        previousRefreshTokenHash: null,
        refreshRotatedAt: null,
        sessionVersion: { increment: 1 },
      },
    });
  }

  private hashRefreshToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }
}
