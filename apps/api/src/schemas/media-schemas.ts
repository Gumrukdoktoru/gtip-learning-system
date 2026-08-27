import { z } from 'zod';

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MEDIA_SOURCES } from '@gtip/shared';
import type { MediaSource } from '@gtip/shared';

const sourceSchema = z.enum(
  MEDIA_SOURCES as [MediaSource, ...MediaSource[]],
);

export const listMediaQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(200).optional(),
  source: sourceSchema.optional(),
});

export const createInstagramItemSchema = z.object({
  url: z.string().trim().min(1, 'Gönderi adresi gerekli.'),
  title: z.string().trim().min(3, 'Başlık en az 3 karakter olmalı.').max(200),
  description: z.string().trim().max(2000).default(''),
  publishedAt: z.string().datetime().optional(),
});

export const updateMediaItemSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    isPinned: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Güncellenecek en az bir alan gönderilmeli.',
  });

export const mediaIdSchema = z.object({
  id: z.string().uuid('Geçersiz içerik kimliği.'),
});
