import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import { AppShell } from './components/layout/app-shell';
import { ProtectedRoute } from './components/protected-route';
import { Spinner } from './components/spinner';
import { LearningHubPage } from './pages/learning-hub-page';

// Students only ever see the hub. The sign-in and admin screens pull in the
// form stack (react-hook-form + zod), so they are split out of the entry
// bundle and fetched on demand.
const LoginPage = lazy(async () => ({
  default: (await import('./pages/login-page')).LoginPage,
}));
const AdminResourcesPage = lazy(async () => ({
  default: (await import('./pages/admin-resources-page')).AdminResourcesPage,
}));
const AdminUploadPage = lazy(async () => ({
  default: (await import('./pages/admin-upload-page')).AdminUploadPage,
}));
const AdminSocialPage = lazy(async () => ({
  default: (await import('./pages/admin-social-page')).AdminSocialPage,
}));
const NotFoundPage = lazy(async () => ({
  default: (await import('./pages/not-found-page')).NotFoundPage,
}));

export function App(): JSX.Element {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<LearningHubPage />} />
          <Route path="giris" element={<LoginPage />} />

          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="yonetim" element={<AdminResourcesPage />} />
            <Route path="yonetim/yukle" element={<AdminUploadPage />} />
            <Route path="yonetim/sosyal" element={<AdminSocialPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
