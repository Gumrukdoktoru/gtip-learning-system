import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.'),
  password: z.string().min(1, 'Parola gerekli.'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Yenileme anahtarı gerekli.'),
});
