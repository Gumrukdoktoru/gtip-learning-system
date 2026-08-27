import { Route, Routes } from 'react-router-dom';

import { AppShell } from './components/layout/app-shell';
import { ProtectedRoute } from './components/protected-route';
import { AdminResourcesPage } from './pages/admin-resources-page';
import { AdminUploadPage } from './pages/admin-upload-page';
import { LoginPage } from './pages/login-page';
import { NotFoundPage } from './pages/not-found-page';
import { ResourcesPage } from './pages/resources-page';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ResourcesPage />} />
        <Route path="giris" element={<LoginPage />} />

        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="yonetim" element={<AdminResourcesPage />} />
          <Route path="yonetim/yukle" element={<AdminUploadPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
