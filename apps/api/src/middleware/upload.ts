import multer from 'multer';

/**
 * Buffers a single uploaded file in memory.
 *
 * Files are small (mevzuat PDFs) and are handed straight to the storage
 * driver, so there is no benefit to a temp-file round trip. The size limit is
 * enforced here as well as in ResourceService, since multer aborts the stream
 * before the whole body is read.
 */
export function createUploadMiddleware(
  maxUploadSizeBytes: number,
): multer.Multer {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadSizeBytes, files: 1 },
  });
}
