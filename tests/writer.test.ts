import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { urlToOutputPath, writePage, writeNodemap } from '../src/writer.js';
import type { NodemapJson } from '../src/types.js';

// ─── urlToOutputPath ─────────────────────────────────────────────────────────

describe('urlToOutputPath', () => {
  const OUT = '/output';

  test('root URL maps to index.md', () => {
    expect(urlToOutputPath('https://example.com/', OUT)).toBe(`${OUT}/index.md`);
  });

  test('trailing-slash URL maps to <path>/index.md', () => {
    expect(urlToOutputPath('https://example.com/docs/', OUT)).toBe(`${OUT}/docs/index.md`);
  });

  test('extensionless path maps to <path>.md', () => {
    expect(urlToOutputPath('https://example.com/docs/intro', OUT)).toBe(`${OUT}/docs/intro.md`);
  });

  test('.html extension is replaced with .md', () => {
    expect(urlToOutputPath('https://example.com/page.html', OUT)).toBe(`${OUT}/page.md`);
  });

  test('.htm extension is replaced with .md', () => {
    expect(urlToOutputPath('https://example.com/page.htm', OUT)).toBe(`${OUT}/page.md`);
  });

  test('query string produces a sanitized suffix before .md', () => {
    expect(urlToOutputPath('https://example.com/search?q=foo', OUT)).toBe(`${OUT}/search-q-foo.md`);
  });

  test('multi-parameter query string is fully included in suffix', () => {
    expect(urlToOutputPath('https://example.com/search?a=1&b=2', OUT)).toBe(`${OUT}/search-a-1-b-2.md`);
  });

  test('special characters in query string are replaced with dashes', () => {
    const result = urlToOutputPath('https://example.com/search?q=hello+world', OUT);
    expect(result).not.toContain('+');
    expect(result).not.toContain(' ');
    expect(result.endsWith('.md')).toBe(true);
  });

  test('URL without a query string produces no trailing dash', () => {
    const result = urlToOutputPath('https://example.com/page', OUT);
    expect(result).toBe(`${OUT}/page.md`);
    expect(result).not.toMatch(/-\.md$/);
  });

  test('nested path preserves directory structure', () => {
    expect(urlToOutputPath('https://example.com/a/b/c', OUT)).toBe(`${OUT}/a/b/c.md`);
  });
});

// ─── writePage ───────────────────────────────────────────────────────────────

describe('writePage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'crawl-writer-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test('creates parent directories and writes the file', async () => {
    const outputPath = join(dir, 'docs', 'intro.md');
    await writePage(outputPath, '# Intro');
    const content = await readFile(outputPath, 'utf-8');
    expect(content).toBe('# Intro');
  });

  test('writes to <path>/index.md when outputPath is an existing directory', async () => {
    const dirPath = join(dir, 'existing-dir');
    await mkdir(dirPath);
    await writePage(dirPath, '# Index');
    const content = await readFile(join(dirPath, 'index.md'), 'utf-8');
    expect(content).toBe('# Index');
  });
});

// ─── writeNodemap ─────────────────────────────────────────────────────────────

describe('writeNodemap', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'crawl-nodemap-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const sampleNodemap: NodemapJson = {
    startUrl: 'https://example.com/',
    crawledAt: '2026-01-01T00:00:00.000Z',
    totalPages: 1,
    nodes: {
      'https://example.com/': {
        depth: 0,
        status: 'success',
        outputPath: 'index.md',
        outLinks: ['https://example.com/about'],
      },
      'https://example.com/about': {
        depth: 1,
        status: 'skipped',
        outLinks: [],
      },
    },
  };

  test('writes nodemap.json with pretty-printed JSON', async () => {
    await writeNodemap(sampleNodemap, dir);
    const raw = await readFile(join(dir, 'nodemap.json'), 'utf-8');
    expect(raw).toContain('\n  '); // pretty-printed (2-space indent)
  });

  test('creates the output directory if it does not exist', async () => {
    const nested = join(dir, 'new-dir');
    await writeNodemap(sampleNodemap, nested);
    const raw = await readFile(join(nested, 'nodemap.json'), 'utf-8');
    expect(raw).toBeTruthy();
  });

  test('written file parses back to a valid NodemapJson shape', async () => {
    await writeNodemap(sampleNodemap, dir);
    const raw = await readFile(join(dir, 'nodemap.json'), 'utf-8');
    const parsed = JSON.parse(raw) as NodemapJson;
    expect(parsed.startUrl).toBe(sampleNodemap.startUrl);
    expect(parsed.totalPages).toBe(1);
    expect(parsed.nodes['https://example.com/'].status).toBe('success');
    expect(parsed.nodes['https://example.com/about'].status).toBe('skipped');
  });
});
