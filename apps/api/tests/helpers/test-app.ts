import type { Express } from 'express';

import { createApp } from '../../src/app.js';
import { loadConfig, type AppConfig } from '../../src/config/env.js';
import { createContainer, type Container } from '../../src/container.js';
import { JsonMediaRepository } from '../../src/repositories/media-repository.js';
import { JsonResourceRepository } from '../../src/repositories/resource-repository.js';
import { JsonUserRepository } from '../../src/repositories/user-repository.js';
import { MemoryStorageDriver } from '../../src/storage/memory-storage-driver.js';

export const TEST_ADMIN = {
  email: 'admin@gumrukdoktoru.com',
  password: 'cok-gizli-parola',
  displayName: 'Test Yöneticisi',
};

export const TEST_STUDENT = {
  email: 'ogrenci@example.com',
  password: 'ogrenci-parolasi',
  displayName: 'Test Öğrencisi',
};

export interface TestContext {
  app: Express;
  container: Container;
  storage: MemoryStorageDriver;
  config: AppConfig;
  adminToken: string;
  studentToken: string;
}

/**
 * Builds an isolated API instance: in-memory storage, in-memory repositories
 * (JsonStore with a null path never touches disk) and two seeded accounts.
 */
export interface TestContextOptions {
  env?: Record<string, string>;
  /** Stands in for global fetch inside the YouTube feed client. */
  youtubeFetch?: typeof fetch;
}

export async function createTestContext({
  env: envOverrides = {},
  youtubeFetch,
}: TestContextOptions = {}): Promise<TestContext> {
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-that-is-long-enough-for-tests',
    API_BASE_URL: 'http://localhost:3000',
    AWS_FOLDER_PREFIX: '69655/',
    STORAGE_DRIVER: 'memory',
    ...envOverrides,
  });

  const storage = new MemoryStorageDriver();
  const container = createContainer(config, {
    storage,
    users: new JsonUserRepository(null),
    resources: new JsonResourceRepository(null),
    media: new JsonMediaRepository(null),
    ...(youtubeFetch ? { youtubeFetch } : {}),
  });

  await container.authService.register({ ...TEST_ADMIN, role: 'admin' });
  await container.authService.register({ ...TEST_STUDENT, role: 'student' });

  const admin = await container.authService.login(
    TEST_ADMIN.email,
    TEST_ADMIN.password,
  );
  const student = await container.authService.login(
    TEST_STUDENT.email,
    TEST_STUDENT.password,
  );

  return {
    app: createApp(container),
    container,
    storage,
    config,
    adminToken: admin.tokens.accessToken,
    studentToken: student.tokens.accessToken,
  };
}

/** Minimal, valid PDF bytes so uploads exercise the real content type path. */
export function samplePdf(): Buffer {
  return Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
    'utf8',
  );
}

export function sampleHtml(): Buffer {
  return Buffer.from(
    '<!doctype html><html lang="tr"><body>Gümrük Genelgesi</body></html>',
    'utf8',
  );
}
