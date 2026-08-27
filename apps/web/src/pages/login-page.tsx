import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Alert } from '../components/alert';
import { useAuthStore } from '../stores/auth-store';

const loginFormSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta adresi girin.'),
  password: z.string().min(1, 'Parola gerekli.'),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginPage(): JSX.Element {
  const user = useAuthStore((state) => state.user);
  const signIn = useAuthStore((state) => state.signIn);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const error = useAuthStore((state) => state.error);
  const navigate = useNavigate();
  const location = useLocation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  if (user) {
    return <Navigate to="/yonetim" replace />;
  }

  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? '/yonetim';

  const onSubmit = handleSubmit(async (values) => {
    if (await signIn(values.email, values.password)) {
      navigate(redirectTo, { replace: true });
    }
  });

  return (
    <div className="mx-auto max-w-md">
      <div className="card p-6">
        <h1 className="text-xl font-semibold text-slate-900">
          Yönetici Girişi
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Kaynak yüklemek ve düzenlemek için giriş yapın.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          {error ? <Alert tone="error">{error}</Alert> : null}

          <div>
            <label className="label" htmlFor="email">
              E-posta
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="field"
              {...register('email')}
            />
            {errors.email ? (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            ) : null}
          </div>

          <div>
            <label className="label" htmlFor="password">
              Parola
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="field"
              {...register('password')}
            />
            {errors.password ? (
              <p className="mt-1 text-xs text-red-600">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Giriş yapılıyor…' : 'Giriş Yap'}
          </button>
        </form>
      </div>
    </div>
  );
}
