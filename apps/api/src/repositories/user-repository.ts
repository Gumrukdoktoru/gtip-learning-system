import type { UserRole } from '@gtip/shared';

import { JsonStore } from './json-store.js';

/** E-mails are stored and compared in a locale independent lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Stored user record; the password hash never leaves this layer. */
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(user: UserRecord): Promise<UserRecord>;
  count(): Promise<number>;
}

export class JsonUserRepository implements UserRepository {
  private readonly store: JsonStore<UserRecord>;

  constructor(filePath: string | null) {
    this.store = new JsonStore<UserRecord>(filePath);
  }

  public findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = normalizeEmail(email);

    return this.store.find((user) => user.email === normalized);
  }

  public findById(id: string): Promise<UserRecord | null> {
    return this.store.findById(id);
  }

  public create(user: UserRecord): Promise<UserRecord> {
    return this.store.insert(user);
  }

  public count(): Promise<number> {
    return this.store.count();
  }
}
