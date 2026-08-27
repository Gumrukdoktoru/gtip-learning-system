import { Link } from 'react-router-dom';

export function NotFoundPage(): JSX.Element {
  return (
    <div className="card px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Sayfa bulunamadı</h1>
      <p className="mt-2 text-sm text-slate-600">
        Aradığınız sayfa taşınmış veya hiç var olmamış olabilir.
      </p>
      <Link to="/" className="btn-primary mt-6">
        Kaynaklara dön
      </Link>
    </div>
  );
}
