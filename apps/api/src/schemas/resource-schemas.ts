import { z } from 'zod';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  RESOURCE_CATEGORIES,
} from '@gtip/shared';
import type { ResourceCategory } from '@gtip/shared';

const categorySchema = z.enum(
  RESOURCE_CATEGORIES as [ResourceCategory, ...ResourceCategory[]],
);

const visibilitySchema = z.enum(['public', 'private']);

export const createResourceSchema = z.object({
  title: z.string().trim().min(3, 'Başlık en az 3 karakter olmalı.').max(200),
  description: z.string().trim().max(2000).default(''),
  category: categorySchema,
  visibility: visibilitySchema.default('public'),
});

export const updateResourceSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    category: categorySchema.optional(),
    visibility: visibilitySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Güncellenecek en az bir alan gönderilmeli.',
  });

export const listResourceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  search: z.string().trim().max(200).optional(),
  category: categorySchema.optional(),
  visibility: visibilitySchema.optional(),
});

export const resourceIdSchema = z.object({
  id: z.string().uuid('Geçersiz kaynak kimliği.'),
});

export type CreateResourceBody = z.infer<typeof createResourceSchema>;
export type UpdateResourceBody = z.infer<typeof updateResourceSchema>;
export type ListResourceQuery = z.infer<typeof listResourceQuerySchema>;
