import { JsonStore } from './json-store.js';

/** A refreshed long-lived token, kept beside the other stored data. */
export interface StoredToken {
  id: string;
  accessToken: string;
  refreshedAt: string;
}

export interface TokenRepository {
  read(id: string): Promise<StoredToken | null>;
  write(id: string, accessToken: string): Promise<StoredToken>;
}

/**
 * Persists tokens the app rotates on its own.
 *
 * Meta's long-lived Instagram tokens last 60 days and must be exchanged for a
 * new one before they expire. The refreshed value cannot go back into `.env`,
 * so it lives here and takes precedence over the configured token.
 */
export class JsonTokenRepository implements TokenRepository {
  private readonly store: JsonStore<StoredToken>;

  constructor(filePath: string | null) {
    this.store = new JsonStore<StoredToken>(filePath);
  }

  public read(id: string): Promise<StoredToken | null> {
    return this.store.findById(id);
  }

  public async write(id: string, accessToken: string): Promise<StoredToken> {
    const record: StoredToken = {
      id,
      accessToken,
      refreshedAt: new Date().toISOString(),
    };

    return (await this.store.update(id, record)) ?? this.store.insert(record);
  }
}
