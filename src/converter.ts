import path from 'path';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  hr: '---',
});

function extractMainContent(html: string): string {
  const $ = cheerio.load(html);
  const main = $('main, article, [role="main"]').first();
  if (main.length) {
    return main.html() ?? '';
  }
  return $('body').html() ?? html;
}

export function convertToMarkdown(html: string, pageUrl: string): string {
  const content = extractMainContent(html);
  const markdown = turndown.turndown(content);
  const frontmatter = `---\nurl: ${pageUrl}\ncrawledAt: ${new Date().toISOString()}\n---\n\n`;
  return frontmatter + markdown;
}

function pathnameToOutputRelative(pathname: string): string {
  // Trailing slash → directory index
  let p = pathname.endsWith('/') ? pathname + 'index' : pathname;
  // Root
  if (p === '') p = 'index';

  const ext = path.extname(p);
  if (ext === '.html' || ext === '.htm') {
    p = p.slice(0, -ext.length) + '.md';
  } else if (!ext) {
    p = p + '.md';
  }

  return p.replace(/^\//, '');
}

/**
 * Apply a rewrite function only to text outside fenced code blocks and inline code spans.
 * This prevents link-like patterns inside code examples from being rewritten.
 */
function rewriteOutsideCode(markdown: string, fn: (chunk: string) => string): string {
  // Split on fenced blocks (``` ... ```) and inline code (`...`)
  const parts = markdown.split(/(```[\s\S]*?```|`[^`\n]+`)/g);
  return parts.map((part, i) => (i % 2 === 0 ? fn(part) : part)).join('');
}

export function rewriteInternalLinks(
  markdown: string,
  startHostname: string,
  currentOutputPath: string,
  baseUrl: string,
): string {
  // Regex created fresh each call — avoids stale lastIndex on the global flag across
  // multiple fn() invocations inside rewriteOutsideCode.
  // Matches [text](url) and [text](url "title") / [text](url 'title')
  const linkRe = /\[([^\]]*)\]\(([^)\s]+)((?:\s+"[^"]*"|\s+'[^']*')?)\)/g;

  return rewriteOutsideCode(markdown, (chunk) =>
    chunk.replace(linkRe, (match, text: string, url: string, title: string | undefined) => {
      try {
        if (url.startsWith(':')) return match;
        // Resolve relative URLs (e.g. /about, ../page) against the page's own URL
        const parsed = new URL(url, baseUrl);
        if (parsed.hostname !== startHostname) return match;

        const targetRelative = pathnameToOutputRelative(parsed.pathname);
        const currentDir = path.dirname(currentOutputPath);
        const rel = path.relative(currentDir, targetRelative).replace(/\\/g, '/');
        const linked = rel.startsWith('.') ? rel : './' + rel;

        // Preserve in-page fragments and any title attribute
        const fragment = parsed.hash;
        return `[${text}](${linked}${fragment}${title ?? ''})`;
      } catch {
        return match;
      }
    }),
  );
}
