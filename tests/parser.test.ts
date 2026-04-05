import { describe, test, expect } from 'bun:test';
import { extractLinks } from '../src/parser.js';

const BASE = 'https://example.com/docs/page';

describe('extractLinks', () => {
  test('returns empty array when there are no <a> tags', () => {
    expect(extractLinks('<html><body><p>No links</p></body></html>', BASE)).toEqual([]);
  });

  test('extracts absolute https links', () => {
    const html = '<a href="https://example.com/about">About</a>';
    expect(extractLinks(html, BASE)).toContain('https://example.com/about');
  });

  test('resolves root-relative hrefs against the base URL', () => {
    const html = '<a href="/about">About</a>';
    expect(extractLinks(html, BASE)).toContain('https://example.com/about');
  });

  test('resolves relative hrefs against the base URL', () => {
    const html = '<a href="../intro">Intro</a>';
    // BASE is /docs/page, ../intro resolves to /docs/../intro = /intro
    expect(extractLinks(html, BASE)).toContain('https://example.com/intro');
  });

  test('resolves ./ relative hrefs against the base URL', () => {
    const html = '<a href="./sibling">Sibling</a>';
    expect(extractLinks(html, BASE)).toContain('https://example.com/docs/sibling');
  });

  test('strips URL fragments — two links to the same page differ only by fragment become one entry', () => {
    const html = `
      <a href="https://example.com/page#intro">Intro</a>
      <a href="https://example.com/page#outro">Outro</a>
    `;
    const links = extractLinks(html, BASE);
    expect(links).toContain('https://example.com/page');
    expect(links.length).toBe(1);
  });

  test('deduplicates identical links', () => {
    const html = `
      <a href="https://example.com/about">About</a>
      <a href="https://example.com/about">About again</a>
    `;
    const links = extractLinks(html, BASE);
    expect(links.filter(l => l === 'https://example.com/about').length).toBe(1);
  });

  test('filters out mailto: links', () => {
    const html = '<a href="mailto:test@example.com">Email</a>';
    expect(extractLinks(html, BASE)).toEqual([]);
  });

  test('filters out javascript: links', () => {
    const html = '<a href="javascript:void(0)">Click</a>';
    expect(extractLinks(html, BASE)).toEqual([]);
  });

  test('filters out ftp: links', () => {
    const html = '<a href="ftp://files.example.com/file.zip">Download</a>';
    expect(extractLinks(html, BASE)).toEqual([]);
  });

  test('filters out data: links', () => {
    const html = '<a href="data:text/plain,hello">Data</a>';
    expect(extractLinks(html, BASE)).toEqual([]);
  });

  test('skips <a> tags with no href attribute', () => {
    const html = '<a name="anchor">Anchor</a>';
    expect(extractLinks(html, BASE)).toEqual([]);
  });

  test('skips empty string href', () => {
    const html = '<a href="">Empty</a>';
    // href="" resolves to the base URL itself
    const links = extractLinks(html, BASE);
    // Should be deduplicated to the base URL without fragment
    expect(links.every(l => l.startsWith('https://'))).toBe(true);
  });

  test('handles malformed href without throwing', () => {
    const html = '<a href=":::invalid:::">Bad link</a>';
    expect(() => extractLinks(html, BASE)).not.toThrow();
    expect(extractLinks(html, BASE)).toEqual([]);
  });

  test('extracts multiple links from a page', () => {
    const html = `
      <a href="/page-a">A</a>
      <a href="/page-b">B</a>
      <a href="https://external.com/">External</a>
    `;
    const links = extractLinks(html, BASE);
    expect(links).toContain('https://example.com/page-a');
    expect(links).toContain('https://example.com/page-b');
    expect(links).toContain('https://external.com/');
  });
});
