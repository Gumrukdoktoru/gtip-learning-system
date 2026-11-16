export type Route = { kind: 'article'; id: string } | { kind: 'topic'; id: number } | { kind: 'home' };

/** Adres çapasını çözer. `#m5` biçimi `#gk-5` için kısa yoldur. */
export function parseHash(hash: string): Route {
  const value = decodeURIComponent(hash.replace(/^#/, '')).trim().toLowerCase();
  if (!value) return { kind: 'home' };
  const topic = value.match(/^konu-(\d+)$/);
  if (topic) return { kind: 'topic', id: Number(topic[1]) };
  const short = value.match(/^m(\d+(?:-[a-z])?)$/);
  if (short) return { kind: 'article', id: `gk-${short[1]}` };
  return { kind: 'article', id: value };
}

export function articleHash(id: string): string {
  return `#${id}`;
}

export function topicHash(id: number): string {
  return `#konu-${id}`;
}
