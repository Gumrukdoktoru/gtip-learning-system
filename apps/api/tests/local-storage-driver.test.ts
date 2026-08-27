import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { buildStorageKey } from '@gtip/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NotFoundError } from '../src/errors/app-error.js';
import { LocalStorageDriver } from '../src/storage/local-storage-driver.js';

describe('LocalStorageDriver', () => {
  let root: string;
  let driver: LocalStorageDriver;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'gtip-storage-'));
    driver = new LocalStorageDriver(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('mirrors the object key onto the filesystem layout', async () => {
    const key = buildStorageKey({
      folderPrefix: '69655/',
      visibility: 'public',
      storedFileName: '1724783400-tebligi.pdf',
    });

    await driver.putObject({
      key,
      body: Buffer.from('pdf-bytes'),
      contentType: 'application/pdf',
    });

    const onDisk = path.join(
      root,
      '69655',
      'public',
      'uploads',
      '1724783400-tebligi.pdf',
    );

    await expect(fs.readFile(onDisk, 'utf8')).resolves.toBe('pdf-bytes');
    await expect(driver.objectExists(key)).resolves.toBe(true);
  });

  it('round-trips and deletes', async () => {
    const key = '69655/uploads/1-a.pdf';

    await driver.putObject({
      key,
      body: Buffer.from('gizli'),
      contentType: 'application/pdf',
    });

    await expect(driver.getObject(key)).resolves.toEqual(Buffer.from('gizli'));

    await driver.deleteObject(key);

    await expect(driver.objectExists(key)).resolves.toBe(false);
    await expect(driver.getObject(key)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses keys that would escape the storage root', async () => {
    await expect(
      driver.putObject({
        key: '../../escaped.pdf',
        body: Buffer.from('x'),
        contentType: 'application/pdf',
      }),
    ).rejects.toThrow(/escapes the storage root/);
  });

  it('has no direct URL and cannot sign', async () => {
    expect(driver.getPublicUrl()).toBeNull();
    await expect(driver.createSignedUrl()).resolves.toBeNull();
  });
});
