import { describe, test, expect } from 'bun:test';
import { convertToMarkdown, rewriteInternalLinks } from '../src/converter.js';

// ─── rewriteInternalLinks ────────────────────────────────────────────────────

describe('rewriteInternalLinks', () => {
  const HOST = 'example.com';
  const BASE = 'https://example.com/docs/page';

  test('rewrites an absolute internal link to a relative .md path', () => {
    const md = '[About](https://example.com/about)';
    const result = rewriteInternalLinks(md, HOST, 'docs/page.md', BASE);
    expect(result).toBe('[About](../about.md)');
  });

  test('leaves external links unchanged', () => {
    const md = '[GitHub](https://github.com/user/repo)';
    const result = rewriteInternalLinks(md, HOST, 'index.md', BASE);
    expect(result).toBe(md);
  });

  test('resolves a root-relative link using the base URL', () => {
    // /about is root-relative; with base https://example.com/docs/page → https://example.com/about
    const md = '[About](/about)';
    const result = rewriteInternalLinks(md, HOST, 'docs/page.md', BASE);
    expect(result).toBe('[About](../about.md)');
  });

  test('preserves URL fragment in rewritten link', () => {
    const md = '[Intro](https://example.com/docs/intro#section)';
    const result = rewriteInternalLinks(md, HOST, 'docs/page.md', BASE);
    expect(result).toBe('[Intro](./intro.md#section)');
  });

  test('preserves double-quoted title attribute in rewritten link', () => {
    const md = '[About](https://example.com/about "About page")';
    const result = rewriteInternalLinks(md, HOST, 'index.md', BASE);
    expect(result).toBe('[About](./about.md "About page")');
  });

  test('preserves single-quoted title attribute in rewritten link', () => {
    const md = "[About](https://example.com/about 'About page')";
    const result = rewriteInternalLinks(md, HOST, 'index.md', BASE);
    expect(result).toBe("[About](./about.md 'About page')");
  });

  test('does NOT rewrite links inside fenced code blocks', () => {
    const md = '```\n[About](https://example.com/about)\n```';
    const result = rewriteInternalLinks(md, HOST, 'index.md', BASE);
    expect(result).toBe(md);
  });

  test('does NOT rewrite links inside inline code spans', () => {
    const md = 'Use `[About](https://example.com/about)` syntax';
    const result = rewriteInternalLinks(md, HOST, 'index.md', BASE);
    expect(result).toBe(md);
  });

  test('handles a malformed URL without throwing (returns match unchanged)', () => {
    const md = '[Bad](:::invalid:::)';
    expect(() => rewriteInternalLinks(md, HOST, 'index.md', BASE)).not.toThrow();
    expect(rewriteInternalLinks(md, HOST, 'index.md', BASE)).toBe(md);
  });

  test('calculates correct ../ depth when current file is in a subdirectory', () => {
    // current: docs/guide/page.md, target: /about → should be ../../about.md
    const md = '[About](https://example.com/about)';
    const result = rewriteInternalLinks(md, HOST, 'docs/guide/page.md', BASE);
    expect(result).toBe('[About](../../about.md)');
  });

  test('uses ./ prefix for links within the same directory', () => {
    // current: docs/page.md, target: /docs/other
    const md = '[Other](https://example.com/docs/other)';
    const result = rewriteInternalLinks(md, HOST, 'docs/page.md', BASE);
    expect(result).toBe('[Other](./other.md)');
  });

  test('rewrites multiple links in a single markdown string', () => {
    const md = '[A](https://example.com/a) and [B](https://example.com/b)';
    const result = rewriteInternalLinks(md, HOST, 'index.md', BASE);
    expect(result).toBe('[A](./a.md) and [B](./b.md)');
  });
});

// ─── convertToMarkdown ───────────────────────────────────────────────────────

describe('convertToMarkdown', () => {
  test('output begins with a YAML frontmatter block', () => {
    const result = convertToMarkdown('<html><body>Hi</body></html>', 'https://example.com/');
    expect(result.startsWith('---\n')).toBe(true);
  });

  test('frontmatter contains the correct url field', () => {
    const result = convertToMarkdown('<html><body>Hi</body></html>', 'https://example.com/page');
    expect(result).toContain('url: https://example.com/page');
  });

  test('frontmatter contains a crawledAt ISO timestamp', () => {
    const result = convertToMarkdown('<html><body>Hi</body></html>', 'https://example.com/');
    expect(result).toMatch(/crawledAt: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test('extracts content from a <main> tag when present', () => {
    const html = '<html><body><nav>Nav</nav><main><h1>Main Content</h1></main></body></html>';
    const result = convertToMarkdown(html, 'https://example.com/');
    expect(result).toContain('Main Content');
    expect(result).not.toContain('Nav');
  });

  test('extracts content from an <article> tag when present', () => {
    const html = '<html><body><aside>Aside</aside><article><h1>Article</h1></article></body></html>';
    const result = convertToMarkdown(html, 'https://example.com/');
    expect(result).toContain('Article');
    expect(result).not.toContain('Aside');
  });

  test('extracts content from a [role="main"] element when present', () => {
    const html = '<html><body><div role="main"><h1>Role Content</h1></div><footer>Footer</footer></body></html>';
    const result = convertToMarkdown(html, 'https://example.com/');
    expect(result).toContain('Role Content');
    expect(result).not.toContain('Footer');
  });

  test('falls back to <body> when no semantic container is present', () => {
    const html = '<html><body><h1>Body Content</h1></body></html>';
    const result = convertToMarkdown(html, 'https://example.com/');
    expect(result).toContain('Body Content');
  });

  test('renders headings in ATX style (# H1)', () => {
    const html = '<html><body><h1>Title</h1></body></html>';
    const result = convertToMarkdown(html, 'https://example.com/');
    expect(result).toContain('# Title');
  });

  test('renders fenced code blocks', () => {
    const html = '<html><body><pre><code>const x = 1;</code></pre></body></html>';
    const result = convertToMarkdown(html, 'https://example.com/');
    expect(result).toContain('```');
  });
});
