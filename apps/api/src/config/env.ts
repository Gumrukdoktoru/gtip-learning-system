import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import { z } from 'zod';

import { MAX_UPLOAD_SIZE_BYTES } from '@gtip/shared';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '../../../..');
const envFile = path.join(repoRoot, '.env');

if (existsSync(envFile)) {
  dotenv.config({ path: envFile });
} else {
  dotenv.config();
}

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    API_PORT: z.coerce.number().int().positive().default(3000),
    API_BASE_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),

    JWT_SECRET: z.string().min(1).default('development-only-insecure-secret'),
    JWT_EXPIRES_IN: z.string().default('1h'),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    ADMIN_DISPLAY_NAME: z.string().default('Sistem Yöneticisi'),

    STORAGE_DRIVER: z.enum(['local', 's3', 'memory']).default('local'),
    STORAGE_LOCAL_ROOT: z.string().default('./storage-data/objects'),
    AWS_FOLDER_PREFIX: z.string().default('69655/'),
    AWS_REGION: z.string().default('eu-central-1'),
    AWS_S3_BUCKET: z.string().optional(),
    AWS_S3_PUBLIC_BASE_URL: z.string().url().optional(),
    AWS_SIGNED_URL_TTL: z.coerce.number().int().positive().default(300),

    MAX_UPLOAD_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(MAX_UPLOAD_SIZE_BYTES),

    // ---- Learning hub -----------------------------------------------------
    SITE_TITLE: z.string().default('Gümrük Mevzuatı Kaynakları'),
    SITE_TAGLINE: z
      .string()
      .default(
        'Videolar, gönderiler ve belgeler tek sayfada; öğrenciler için derlenmiş çalışma kaynakları.',
      ),
    /** Channel id, @handle or channel URL. Empty disables the YouTube shelf. */
    YOUTUBE_CHANNEL: z.string().default(''),
    YOUTUBE_SYNC_INTERVAL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(30),
    INSTAGRAM_PROFILE_URL: z.string().url().optional(),

    DATA_DIR: z.string().default('./storage-data/db'),
    SEED_SAMPLE_DATA: booleanFromString.default('false'),
  })
  .superRefine((value, ctx) => {
    if (value.STORAGE_DRIVER === 's3' && !value.AWS_S3_BUCKET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AWS_S3_BUCKET'],
        message: 'AWS_S3_BUCKET is required when STORAGE_DRIVER is "s3"',
      });
    }

    if (
      value.NODE_ENV === 'production' &&
      value.JWT_SECRET.length < 32
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be at least 32 characters in production',
      });
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export interface AppConfig extends AppEnv {
  repoRoot: string;
  /** Absolute path derived from STORAGE_LOCAL_ROOT. */
  localStorageRoot: string;
  /** Absolute path derived from DATA_DIR. */
  dataDir: string;
  /** Origins allowed by CORS, parsed from the comma separated CORS_ORIGIN. */
  corsOrigins: string[];
}

function resolveFromRoot(target: string): string {
  return path.isAbsolute(target) ? target : path.resolve(repoRoot, target);
}

let cachedConfig: AppConfig | null = null;

/**
 * Parses and caches process.env.
 *
 * Throws with the offending variable names so a misconfigured deployment fails
 * at boot instead of at the first upload.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  ');

    throw new Error(`Invalid environment configuration:\n  ${details}`);
  }

  return {
    ...parsed.data,
    repoRoot,
    localStorageRoot: resolveFromRoot(parsed.data.STORAGE_LOCAL_ROOT),
    dataDir: resolveFromRoot(parsed.data.DATA_DIR),
    corsOrigins: parsed.data.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  };
}

export function getConfig(): AppConfig {
  cachedConfig ??= loadConfig();

  return cachedConfig;
}

/** Test helper: drops the cached config so the next read re-parses env. */
export function resetConfigCache(): void {
  cachedConfig = null;
}
