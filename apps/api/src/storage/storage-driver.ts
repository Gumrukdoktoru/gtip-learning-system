export interface PutObjectParams {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface SignedUrl {
  url: string;
  expiresAt: Date;
}

/**
 * Minimal object-store contract shared by the local and S3 drivers.
 *
 * Keys are always full object keys (folder prefix included) produced by
 * `buildStorageKey` from @gtip/shared.
 */
export interface StorageDriver {
  readonly name: 'local' | 's3' | 'memory';

  putObject(params: PutObjectParams): Promise<void>;

  getObject(key: string): Promise<Buffer>;

  deleteObject(key: string): Promise<void>;

  objectExists(key: string): Promise<boolean>;

  /**
   * Directly reachable URL for an object, or `null` when the driver cannot
   * serve bytes itself and the API has to stream them.
   */
  getPublicUrl(key: string): string | null;

  /**
   * Time limited URL for a private object, or `null` when unsupported.
   */
  createSignedUrl(key: string, ttlSeconds: number): Promise<SignedUrl | null>;
}
