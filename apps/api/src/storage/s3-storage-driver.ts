import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { NotFoundError } from '../errors/app-error.js';
import type {
  PutObjectParams,
  SignedUrl,
  StorageDriver,
} from './storage-driver.js';

export interface S3StorageDriverOptions {
  bucket: string;
  region: string;
  /** Set when public objects are served from a CDN or a public bucket URL. */
  publicBaseUrl?: string;
  client?: S3Client;
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    candidate.name === 'NoSuchKey' ||
    candidate.name === 'NotFound' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export class S3StorageDriver implements StorageDriver {
  public readonly name = 's3';

  private readonly bucket: string;
  private readonly publicBaseUrl: string | undefined;
  private readonly client: S3Client;

  constructor({
    bucket,
    region,
    publicBaseUrl,
    client,
  }: S3StorageDriverOptions) {
    this.bucket = bucket;
    this.publicBaseUrl = publicBaseUrl;
    this.client = client ?? new S3Client({ region });
  }

  public async putObject({
    key,
    body,
    contentType,
  }: PutObjectParams): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.byteLength,
      }),
    );
  }

  public async getObject(key: string): Promise<Buffer> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      if (!result.Body) {
        throw new NotFoundError('Dosya depolama alanında bulunamadı.');
      }

      const bytes = await result.Body.transformToByteArray();

      return Buffer.from(bytes);
    } catch (error) {
      if (isNotFound(error)) {
        throw new NotFoundError('Dosya depolama alanında bulunamadı.');
      }

      throw error;
    }
  }

  public async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  public async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }

      throw error;
    }
  }

  public getPublicUrl(key: string): string | null {
    if (!this.publicBaseUrl) {
      return null;
    }

    const base = this.publicBaseUrl.replace(/\/+$/, '');
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    return `${base}/${encodedKey}`;
  }

  public async createSignedUrl(
    key: string,
    ttlSeconds: number,
  ): Promise<SignedUrl | null> {
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );

    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }
}
