import * as cheerio from 'cheerio';

function resolveUrl(href: string, base: string): string | null {
  try {
    if (href.startsWith(':')) return null;
    const resolved = new URL(href, base);
    // Strip fragments — two URLs differing only by fragment are the same page
    resolved.hash = '';
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.href;
  } catch {
    return null;
  }
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const resolved = resolveUrl(href, baseUrl);
    if (resolved) seen.add(resolved);
  });

  return Array.from(seen);
}
