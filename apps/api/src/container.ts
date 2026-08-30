import path from 'node:path';

import type { AppConfig } from './config/env.js';
import {
  JsonMediaRepository,
  type MediaRepository,
} from './repositories/media-repository.js';
import {
  JsonResourceRepository,
  type ResourceRepository,
} from './repositories/resource-repository.js';
import {
  JsonQuizRepository,
  type QuizRepository,
} from './repositories/quiz-repository.js';
import {
  JsonTokenRepository,
  type TokenRepository,
} from './repositories/token-repository.js';
import {
  JsonUserRepository,
  type UserRepository,
} from './repositories/user-repository.js';
import { AuthService } from './services/auth-service.js';
import { InstagramGraphClient } from './services/instagram-graph.js';
import { MediaService } from './services/media-service.js';
import { QuizService } from './services/quiz-service.js';
import { ResourceService } from './services/resource-service.js';
import { YouTubeFeedClient } from './services/youtube-feed.js';
import { createStorageDriver } from './storage/create-storage-driver.js';
import type { StorageDriver } from './storage/storage-driver.js';

/** Path prefix every versioned route lives under. */
export const API_VERSION_PREFIX = '/api/v1';

export interface Container {
  config: AppConfig;
  storage: StorageDriver;
  users: UserRepository;
  resources: ResourceRepository;
  media: MediaRepository;
  tokens: TokenRepository;
  quizQuestions: QuizRepository;
  authService: AuthService;
  resourceService: ResourceService;
  mediaService: MediaService;
  quizService: QuizService;
}

export interface ContainerOverrides {
  storage?: StorageDriver;
  users?: UserRepository;
  resources?: ResourceRepository;
  media?: MediaRepository;
  tokens?: TokenRepository;
  quizQuestions?: QuizRepository;
  /** Injected by tests so no request ever leaves the process. */
  youtubeFetch?: typeof fetch;
  instagramFetch?: typeof fetch;
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
  const media =
    overrides.media ??
    new JsonMediaRepository(path.join(config.dataDir, 'media.json'));
  const tokens =
    overrides.tokens ??
    new JsonTokenRepository(path.join(config.dataDir, 'tokens.json'));
  const quizQuestions =
    overrides.quizQuestions ??
    new JsonQuizRepository(path.join(config.dataDir, 'quiz-questions.json'));

  const instagramToken = config.INSTAGRAM_ACCESS_TOKEN.trim();
  const instagram =
    instagramToken.length > 0
      ? new InstagramGraphClient({
          accessToken: instagramToken,
          userId: config.INSTAGRAM_USER_ID,
          host: config.INSTAGRAM_GRAPH_HOST,
          version: config.INSTAGRAM_GRAPH_VERSION,
          ...(overrides.instagramFetch
            ? { fetchImpl: overrides.instagramFetch }
            : {}),
        })
      : null;

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

  const mediaService = new MediaService({
    media,
    youtube: new YouTubeFeedClient(
      overrides.youtubeFetch ? { fetchImpl: overrides.youtubeFetch } : {},
    ),
    youtubeChannel: config.YOUTUBE_CHANNEL,
    syncIntervalMs: config.YOUTUBE_SYNC_INTERVAL_MINUTES * 60 * 1000,
    instagram,
    instagramSyncIntervalMs:
      config.INSTAGRAM_SYNC_INTERVAL_MINUTES * 60 * 1000,
    instagramSyncLimit: config.INSTAGRAM_SYNC_LIMIT,
    // Only Instagram-Login tokens can be exchanged in place; a Facebook-Login
    // token is renewed through a different flow.
    instagramTokenRefreshable:
      config.INSTAGRAM_GRAPH_HOST.includes('graph.instagram.com'),
    tokens,
    storage,
    folderPrefix: config.AWS_FOLDER_PREFIX,
    apiBaseUrl: `${config.API_BASE_URL}${API_VERSION_PREFIX}`,
  });

  return {
    config,
    storage,
    users,
    resources,
    media,
    tokens,
    quizQuestions,
    authService,
    resourceService,
    mediaService,
    quizService: new QuizService({ questions: quizQuestions }),
  };
}
