import type { AppConfig } from '../config/env.js';
import { LocalStorageDriver } from './local-storage-driver.js';
import { MemoryStorageDriver } from './memory-storage-driver.js';
import { S3StorageDriver } from './s3-storage-driver.js';
import type { StorageDriver } from './storage-driver.js';

/** Picks the driver named by STORAGE_DRIVER. */
export function createStorageDriver(config: AppConfig): StorageDriver {
  switch (config.STORAGE_DRIVER) {
    case 's3':
      return new S3StorageDriver({
        // Validated in env.ts: the bucket is required for this driver.
        bucket: config.AWS_S3_BUCKET as string,
        region: config.AWS_REGION,
        publicBaseUrl: config.AWS_S3_PUBLIC_BASE_URL,
      });
    case 'memory':
      return new MemoryStorageDriver();
    case 'local':
    default:
      return new LocalStorageDriver(config.localStorageRoot);
  }
}
