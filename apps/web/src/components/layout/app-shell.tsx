import { NavLink, Outlet, useNavigate } from 'react-router-dom';

import { useSiteConfig } from '../../hooks/use-site-config';
import { useAuthStore } from '../../stores/auth-store';

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return [
    'rounded-lg px-3 py-2 text-sm font-medium transition',
    isActive
      ? 'bg-brand-50 text-brand-700'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ');
}

export function AppShell(): JSX.Element {
  const site = useSiteConfig();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <NavLink to="/" className="text-base font-semibold text-slate-900">
            {site.title}
          </NavLink>

          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Ana Sayfa
            </NavLink>
            {user?.role === 'admin' ? (
              <>
                <NavLink to="/yonetim" end className={navLinkClass}>
                  Yönetim
                </NavLink>
                <NavLink to="/yonetim/sosyal" className={navLinkClass}>
                  Sosyal İçerik
                </NavLink>
                <NavLink to="/yonetim/sorular" className={navLinkClass}>
                  Sorular
                </NavLink>
                <NavLink to="/yonetim/yukle" className={navLinkClass}>
                  Yeni Kaynak
                </NavLink>
              </>
            ) : null}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden text-sm text-slate-600 sm:inline">
                  {user.displayName}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    signOut();
                    navigate('/');
                  }}
                >
                  Çıkış
                </button>
              </>
            ) : (
              <NavLink to="/giris" className="btn-secondary">
                Yönetici Girişi
              </NavLink>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500">
          Kaynaklar bilgilendirme amaçlıdır; bağlayıcı metin için Resmî
          Gazete&apos;yi esas alın.
        </div>
      </footer>
    </div>
  );
}
