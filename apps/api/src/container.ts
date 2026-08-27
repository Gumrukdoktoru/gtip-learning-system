import path from 'node:path';

import type { AppConfig } from './config/env.js';
import {
  JsonResourceRepository,
  type ResourceRepository,
} from './repositories/resource-repository.js';
import {
  JsonUserRepository,
  type UserRepository,
} from './repositories/user-repository.js';
import { AuthService } from './services/auth-service.js';
import { ResourceService } from './services/resource-service.js';
import { createStorageDriver } from './storage/create-storage-driver.js';
import type { StorageDriver } from './storage/storage-driver.js';

/** Path prefix every versioned route lives under. */
export const API_VERSION_PREFIX = '/api/v1';

export interface Container {
  config: AppConfig;
  storage: StorageDriver;
  users: UserRepository;
  resources: ResourceRepository;
  authService: AuthService;
  resourceService: ResourceService;
}

export interface ContainerOverrides {
  storage?: StorageDriver;
  users?: UserRepository;
  resources?: ResourceRepository;
}

/**
 * Wires the object graph.
 *
 * Overrides exist so tests can drop in the in-memory driver and repositories
 * without touching disk.
 */
export function createContainer(
  config: AppConfig,
  overrides: ContainerOverrides = {},
): Container {
  const storage = overrides.storage ?? createStorageDriver(config);
  const users =
    overrides.users ??
    new JsonUserRepository(path.join(config.dataDir, 'users.json'));
  const resources =
    overrides.resources ??
    new JsonResourceRepository(path.join(config.dataDir, 'resources.json'));

  const authService = new AuthService({
    users,
    jwtSecret: config.JWT_SECRET,
    accessTokenExpiresIn: config.JWT_EXPIRES_IN,
    refreshTokenExpiresIn: config.REFRESH_TOKEN_EXPIRES_IN,
    // Hashing dominates the test suite's runtime; production keeps the
    // OWASP baseline cost.
    ...(config.NODE_ENV === 'test' ? { bcryptCostFactor: 4 } : {}),
  });

  const resourceService = new ResourceService({
    resources,
    storage,
    folderPrefix: config.AWS_FOLDER_PREFIX,
    signedUrlTtlSeconds: config.AWS_SIGNED_URL_TTL,
    apiBaseUrl: `${config.API_BASE_URL}${API_VERSION_PREFIX}`,
    maxUploadSizeBytes: config.MAX_UPLOAD_SIZE_BYTES,
  });

  return { config, storage, users, resources, authService, resourceService };
}
