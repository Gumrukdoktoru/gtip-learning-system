import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import type { AuthTokens, LoginResponse, User, UserRole } from '@gtip/shared';

import { UnauthorizedError } from '../errors/app-error.js';
import {
  normalizeEmail,
  type UserRecord,
  type UserRepository,
} from '../repositories/user-repository.js';
import { logger } from '../utils/logger.js';

/** OWASP baseline for bcrypt; lowered only for the test suite. */
export const DEFAULT_BCRYPT_COST_FACTOR = 12;

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  type: 'access' | 'refresh';
}

export interface AuthServiceOptions {
  users: UserRepository;
  jwtSecret: string;
  accessTokenExpiresIn: string;
  refreshTokenExpiresIn: string;
  bcryptCostFactor?: number;
}

export function toPublicUser(record: UserRecord): User {
  return {
    id: record.id,
    email: record.email,
    displayName: record.displayName,
    role: record.role,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class AuthService {
  private readonly users: UserRepository;
  private readonly jwtSecret: string;
  private readonly accessTokenExpiresIn: string;
  private readonly refreshTokenExpiresIn: string;
  private readonly bcryptCostFactor: number;

  constructor({
    users,
    jwtSecret,
    accessTokenExpiresIn,
    refreshTokenExpiresIn,
    bcryptCostFactor = DEFAULT_BCRYPT_COST_FACTOR,
  }: AuthServiceOptions) {
    this.users = users;
    this.jwtSecret = jwtSecret;
    this.accessTokenExpiresIn = accessTokenExpiresIn;
    this.refreshTokenExpiresIn = refreshTokenExpiresIn;
    this.bcryptCostFactor = bcryptCostFactor;
  }

  private sign(record: UserRecord, type: 'access' | 'refresh'): string {
    const payload: AccessTokenPayload = {
      sub: record.id,
      email: record.email,
      role: record.role,
      type,
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn:
        type === 'access'
          ? this.accessTokenExpiresIn
          : this.refreshTokenExpiresIn,
    } as jwt.SignOptions);
  }

  private issueTokens(record: UserRecord): AuthTokens {
    return {
      accessToken: this.sign(record, 'access'),
      refreshToken: this.sign(record, 'refresh'),
      expiresIn: this.accessTokenExpiresIn,
    };
  }

  /**
   * Creates the bootstrap admin when the user table is empty.
   *
   * Returns `null` when an account already exists or the credentials are not
   * configured, so restarts never silently reset the password.
   */
  public async ensureBootstrapAdmin(
    email: string | undefined,
    password: string | undefined,
    displayName: string,
  ): Promise<User | null> {
    if (!email || !password) {
      return null;
    }

    if ((await this.users.count()) > 0) {
      return null;
    }

    const created = await this.register({
      email,
      password,
      displayName,
      role: 'admin',
    });

    logger.info('Bootstrap admin account created', { email: created.email });

    return created;
  }

  public async register(params: {
    email: string;
    password: string;
    displayName: string;
    role: UserRole;
  }): Promise<User> {
    const now = new Date().toISOString();
    const record: UserRecord = {
      id: randomUUID(),
      email: normalizeEmail(params.email),
      passwordHash: await bcrypt.hash(params.password, this.bcryptCostFactor),
      displayName: params.displayName,
      role: params.role,
      createdAt: now,
      updatedAt: now,
    };

    return toPublicUser(await this.users.create(record));
  }

  public async login(email: string, password: string): Promise<LoginResponse> {
    const record = await this.users.findByEmail(email);

    // Compare against a dummy hash when the account is unknown so the response
    // time does not reveal whether the e-mail exists.
    const passwordHash =
      record?.passwordHash ??
      '$2a$12$0000000000000000000000000000000000000000000000000000';
    const passwordMatches = await bcrypt.compare(password, passwordHash);

    if (!record || !passwordMatches) {
      throw new UnauthorizedError('E-posta veya parola hatalı.');
    }

    return { user: toPublicUser(record), tokens: this.issueTokens(record) };
  }

  public verifyToken(
    token: string,
    expectedType: 'access' | 'refresh' = 'access',
  ): AccessTokenPayload {
    let decoded: unknown;

    try {
      decoded = jwt.verify(token, this.jwtSecret);
    } catch {
      throw new UnauthorizedError('Oturum süresi dolmuş veya geçersiz.');
    }

    const payload = decoded as Partial<AccessTokenPayload>;

    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.role !== 'string' ||
      payload.type !== expectedType
    ) {
      throw new UnauthorizedError('Oturum süresi dolmuş veya geçersiz.');
    }

    return payload as AccessTokenPayload;
  }

  public async refresh(refreshToken: string): Promise<LoginResponse> {
    const payload = this.verifyToken(refreshToken, 'refresh');
    const record = await this.users.findById(payload.sub);

    if (!record) {
      throw new UnauthorizedError('Kullanıcı bulunamadı.');
    }

    return { user: toPublicUser(record), tokens: this.issueTokens(record) };
  }

  public async getUserById(id: string): Promise<User | null> {
    const record = await this.users.findById(id);

    return record ? toPublicUser(record) : null;
  }
}
