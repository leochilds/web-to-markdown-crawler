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

export function rewriteInternalLinks(
  markdown: string,
  startHostname: string,
  currentOutputPath: string,
): string {
  return markdown.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (match, text: string, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname !== startHostname) return match;

      const targetRelative = pathnameToOutputRelative(parsed.pathname);
      const currentDir = path.dirname(currentOutputPath);
      const rel = path.relative(currentDir, targetRelative).replace(/\\/g, '/');
      // Ensure relative links start with ./ if in same dir
      const linked = rel.startsWith('.') ? rel : './' + rel;
      return `[${text}](${linked})`;
    } catch {
      return match;
    }
  });
}
