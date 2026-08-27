import { getConfig } from './config/env.js';
import { createApp } from './app.js';
import { API_VERSION_PREFIX, createContainer } from './container.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  const config = getConfig();
  const container = createContainer(config);

  await container.authService.ensureBootstrapAdmin(
    config.ADMIN_EMAIL,
    config.ADMIN_PASSWORD,
    config.ADMIN_DISPLAY_NAME,
  );

  const app = createApp(container);

  app.listen(config.API_PORT, () => {
    logger.info('API listening', {
      port: config.API_PORT,
      baseUrl: `${config.API_BASE_URL}${API_VERSION_PREFIX}`,
      storageDriver: container.storage.name,
      folderPrefix: config.AWS_FOLDER_PREFIX,
    });
  });
}

main().catch((error: unknown) => {
  logger.error('Failed to start API', {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
