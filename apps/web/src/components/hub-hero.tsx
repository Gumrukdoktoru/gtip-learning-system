import type { SiteConfig } from '@gtip/shared';

export interface HubHeroProps {
  site: SiteConfig;
}

export function HubHero({ site }: HubHeroProps): JSX.Element {
  return (
    <section className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-6 py-10 text-white sm:px-10">
      <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
        {site.title}
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-brand-50 sm:text-base">
        {site.tagline}
      </p>

      {site.youtubeChannelUrl || site.instagramProfileUrl ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {site.youtubeChannelUrl ? (
            <a
              href={site.youtubeChannelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn bg-white text-brand-800 hover:bg-brand-50"
            >
              YouTube kanalı
            </a>
          ) : null}
          {site.instagramProfileUrl ? (
            <a
              href={site.instagramProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn border border-white/40 text-white hover:bg-white/10"
            >
              Instagram profili
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
