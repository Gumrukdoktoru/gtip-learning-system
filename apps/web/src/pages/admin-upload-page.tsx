import { zodResolver } from '@hookform/resolvers/zod';
import {
  ALLOWED_RESOURCE_EXTENSIONS,
  MAX_UPLOAD_SIZE_BYTES,
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_LABELS,
} from '@gtip/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Alert } from '../components/alert';
import { ApiRequestError } from '../services/api-client';
import { uploadResource } from '../services/resource-service';
import { formatBytes } from '../utils/format';

const uploadFormSchema = z.object({
  title: z.string().trim().min(3, 'Başlık en az 3 karakter olmalı.').max(200),
  description: z.string().trim().max(2000).default(''),
  category: z.enum(
    RESOURCE_CATEGORIES as [
      (typeof RESOURCE_CATEGORIES)[number],
      ...(typeof RESOURCE_CATEGORIES)[number][],
    ],
  ),
  visibility: z.enum(['public', 'private']),
});

type UploadFormValues = z.infer<typeof uploadFormSchema>;

/** Mirrors the API's own check so the user is told before the upload starts. */
function validateFile(file: File | null): string | null {
  if (!file) {
    return 'Lütfen bir dosya seçin.';
  }

  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

  if (!(ALLOWED_RESOURCE_EXTENSIONS as readonly string[]).includes(extension)) {
    return 'Sadece PDF ve HTML dosyaları yüklenebilir.';
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return `Dosya boyutu en fazla ${formatBytes(MAX_UPLOAD_SIZE_BYTES)} olabilir.`;
  }

  return null;
}

export function AdminUploadPage(): JSX.Element {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UploadFormValues>({
    resolver: zodResolver(uploadFormSchema),
    defaultValues: {
      title: '',
      description: '',
      category: 'mevzuat',
      visibility: 'public',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const problem = validateFile(file);

    setFileError(problem);
    setSubmitError(null);

    if (problem || !file) {
      return;
    }

    setIsUploading(true);

    try {
      await uploadResource(values, file);
      navigate('/yonetim', { replace: true });
    } catch (cause) {
      setSubmitError(
        cause instanceof ApiRequestError
          ? cause.message
          : 'Kaynak yüklenemedi. Lütfen tekrar deneyin.',
      );
    } finally {
      setIsUploading(false);
    }
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Yeni Kaynak</h1>
      <p className="mt-1 text-sm text-slate-600">
        PDF veya HTML dosyası yükleyin. Herkese açık kaynaklar
        <code className="mx-1 rounded bg-slate-100 px-1 text-xs">
          public/uploads/
        </code>
        altında, özel kaynaklar
        <code className="mx-1 rounded bg-slate-100 px-1 text-xs">uploads/</code>
        altında saklanır.
      </p>

      <form className="card mt-6 flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        {submitError ? <Alert tone="error">{submitError}</Alert> : null}

        <div>
          <label className="label" htmlFor="title">
            Başlık
          </label>
          <input id="title" type="text" className="field" {...register('title')} />
          {errors.title ? (
            <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>
          ) : null}
        </div>

        <div>
          <label className="label" htmlFor="description">
            Açıklama
          </label>
          <textarea
            id="description"
            rows={4}
            className="field"
            {...register('description')}
          />
          {errors.description ? (
            <p className="mt-1 text-xs text-red-600">
              {errors.description.message}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="category">
              Kategori
            </label>
            <select id="category" className="field" {...register('category')}>
              {RESOURCE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {RESOURCE_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="visibility">
              Görünürlük
            </label>
            <select id="visibility" className="field" {...register('visibility')}>
              <option value="public">Herkese açık</option>
              <option value="private">Özel (imzalı bağlantı)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="file">
            Dosya
          </label>
          <input
            id="file"
            type="file"
            accept=".pdf,.html,.htm,application/pdf,text/html"
            className="field"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;

              setFile(selected);
              setFileError(validateFile(selected));
            }}
          />
          {file ? (
            <p className="mt-1 text-xs text-slate-500">
              {file.name} · {formatBytes(file.size)}
            </p>
          ) : null}
          {fileError ? (
            <p className="mt-1 text-xs text-red-600">{fileError}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate('/yonetim')}
          >
            Vazgeç
          </button>
          <button type="submit" className="btn-primary" disabled={isUploading}>
            {isUploading ? 'Yükleniyor…' : 'Kaynağı Yükle'}
          </button>
        </div>
      </form>
    </div>
  );
}
