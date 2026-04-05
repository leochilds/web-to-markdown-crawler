import { describe, test, expect, mock, beforeEach, afterAll } from 'bun:test';
import path from 'path';
import type { NodemapJson } from '../src/types.js';

// ─── Mock all I/O dependencies before crawler.ts is imported ─────────────────

const mockFetchPage = mock(async (_url: string) => ({
  html: '<html><body>Test page</body></html>',
  finalUrl: _url,
}));

const mockExtractLinks = mock((_html: string, _base: string): string[] => []);

const mockConvertToMarkdown = mock((_html: string, _url: string) => '# Test page\n');

const mockRewriteInternalLinks = mock((markdown: string, ..._rest: unknown[]) => markdown);

const mockWritePage = mock(async (_path: string, _content: string) => {});

const mockWriteNodemap = mock(async (_nodemap: NodemapJson, _dir: string) => {});

// urlToOutputPath must return a real absolute path so path.relative() works correctly
const mockUrlToOutputPath = mock((url: string, outputDir: string) => {
  const u = new URL(url);
  const rel = u.pathname === '/' ? 'index.md' : `${u.pathname.slice(1)}.md`;
  return path.join(path.resolve(outputDir), rel);
});

class MockFetchError extends Error {
  constructor(
    public readonly url: string,
    public readonly statusCode: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

mock.module('../src/fetcher.js', () => ({
  fetchPage: mockFetchPage,
  FetchError: MockFetchError,
}));

mock.module('../src/parser.js', () => ({
  extractLinks: mockExtractLinks,
}));

mock.module('../src/converter.js', () => ({
  convertToMarkdown: mockConvertToMarkdown,
  rewriteInternalLinks: mockRewriteInternalLinks,
}));

mock.module('../src/writer.js', () => ({
  urlToOutputPath: mockUrlToOutputPath,
  writePage: mockWritePage,
  writeNodemap: mockWriteNodemap,
}));

const { run } = await import('../src/crawler.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseConfig = {
  startUrl: 'https://example.com/',
  outputDir: './output',
  concurrency: 1,
};

function capturedNodemap(): NodemapJson {
  const calls = mockWriteNodemap.mock.calls;
  if (!calls.length) throw new Error('writeNodemap was not called');
  return calls[calls.length - 1][0] as NodemapJson;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('run', () => {
  beforeEach(() => {
    mockFetchPage.mockReset();
    mockExtractLinks.mockReset();
    mockConvertToMarkdown.mockReset();
    mockRewriteInternalLinks.mockReset();
    mockWritePage.mockReset();
    mockWriteNodemap.mockReset();
    mockUrlToOutputPath.mockReset();

    // Default implementations
    mockFetchPage.mockImplementation(async (url: string) => ({
      html: '<html><body>Page</body></html>',
      finalUrl: url,
    }));
    mockExtractLinks.mockReturnValue([]);
    mockConvertToMarkdown.mockReturnValue('# Page\n');
    mockRewriteInternalLinks.mockImplementation((md: string) => md);
    mockWritePage.mockImplementation(async () => {});
    mockWriteNodemap.mockImplementation(async () => {});
    mockUrlToOutputPath.mockImplementation((url: string, outputDir: string) => {
      const u = new URL(url);
      const rel = u.pathname === '/' ? 'index.md' : `${u.pathname.slice(1)}.md`;
      return path.join(path.resolve(outputDir), rel);
    });
  });

  test('crawls the start URL and writes it to disk', async () => {
    await run(baseConfig);
    expect(mockFetchPage).toHaveBeenCalledWith('https://example.com/', undefined);
    expect(mockWritePage).toHaveBeenCalledTimes(1);
  });

  test('follows internal links discovered on the first page', async () => {
    mockExtractLinks
      .mockReturnValueOnce(['https://example.com/about'])
      .mockReturnValueOnce([]);
    await run(baseConfig);
    expect(mockFetchPage).toHaveBeenCalledTimes(2);
    expect(mockWritePage).toHaveBeenCalledTimes(2);
  });

  test('does not enqueue or fetch external links', async () => {
    mockExtractLinks.mockReturnValueOnce(['https://external.com/page']);
    await run(baseConfig);
    // Only the start URL is fetched; external.com/page is not
    expect(mockFetchPage).toHaveBeenCalledTimes(1);
  });

  test('external links appear in the nodemap with status skipped', async () => {
    mockExtractLinks.mockReturnValueOnce(['https://external.com/page']);
    await run(baseConfig);
    const nodemap = capturedNodemap();
    expect(nodemap.nodes['https://external.com/page']?.status).toBe('skipped');
  });

  test('respects maxPages — stops after N pages have been written', async () => {
    mockExtractLinks
      .mockReturnValueOnce(['https://example.com/a', 'https://example.com/b'])
      .mockReturnValue([]);
    await run({ ...baseConfig, maxPages: 2 });
    expect(mockWritePage).toHaveBeenCalledTimes(2);
  });

  test('respects maxDepth — does not enqueue links beyond the depth limit', async () => {
    // depth 0 → start page, extracts /a
    // depth 1 → /a, extracts /b — should NOT be enqueued because maxDepth = 1
    mockExtractLinks
      .mockReturnValueOnce(['https://example.com/a'])  // depth 0 page
      .mockReturnValueOnce(['https://example.com/b'])  // depth 1 page
      .mockReturnValue([]);
    await run({ ...baseConfig, maxDepth: 1 });
    // Only start + /a should be fetched (/b is depth 2, over limit)
    expect(mockFetchPage).toHaveBeenCalledTimes(2);
  });

  test('handles a fetchPage error gracefully — crawl continues and nodemap records the error', async () => {
    mockFetchPage.mockImplementationOnce(async () => { throw new Error('Connection refused'); });
    await run(baseConfig);
    // writePage should NOT have been called since fetch failed
    expect(mockWritePage).not.toHaveBeenCalled();
    const nodemap = capturedNodemap();
    expect(nodemap.nodes['https://example.com/'].status).toBe('error');
    expect(nodemap.nodes['https://example.com/'].error).toContain('Connection refused');
  });

  test('deduplicates URLs — a URL linked from multiple pages is only crawled once', async () => {
    // Both /a and /b link to /shared — should only be crawled once
    mockExtractLinks
      .mockReturnValueOnce(['https://example.com/a', 'https://example.com/b'])
      .mockReturnValueOnce(['https://example.com/shared'])
      .mockReturnValueOnce(['https://example.com/shared'])
      .mockReturnValue([]);
    await run(baseConfig);
    const fetchedUrls = mockFetchPage.mock.calls.map(c => c[0]);
    expect(fetchedUrls.filter((u: string) => u === 'https://example.com/shared').length).toBe(1);
  });

  test('handles circular links without looping infinitely', async () => {
    // A → B → A  (circular)
    mockExtractLinks
      .mockReturnValueOnce(['https://example.com/b'])  // A links to B
      .mockReturnValueOnce(['https://example.com/'])   // B links back to A
      .mockReturnValue([]);
    await run(baseConfig);
    // Each URL fetched exactly once
    const fetchedUrls = mockFetchPage.mock.calls.map(c => c[0]);
    const unique = new Set(fetchedUrls);
    expect(unique.size).toBe(fetchedUrls.length);
  });

  test('marks the redirect target as visited so it is not re-crawled separately', async () => {
    // Start URL redirects to /canonical
    mockFetchPage.mockImplementationOnce(async () => ({
      html: '<html><body></body></html>',
      finalUrl: 'https://example.com/canonical',
    }));
    // Subsequent pages link to /canonical — should NOT be enqueued again
    mockExtractLinks
      .mockReturnValueOnce(['https://example.com/canonical'])
      .mockReturnValue([]);
    await run(baseConfig);
    const fetchedUrls = mockFetchPage.mock.calls.map(c => c[0]);
    expect(fetchedUrls.filter((u: string) => u === 'https://example.com/canonical').length).toBe(0);
  });

  test('calls writeNodemap exactly once when the crawl completes', async () => {
    await run(baseConfig);
    expect(mockWriteNodemap).toHaveBeenCalledTimes(1);
  });

  test('successfully crawled pages appear in the nodemap with status success and an outputPath', async () => {
    await run(baseConfig);
    const nodemap = capturedNodemap();
    const node = nodemap.nodes['https://example.com/'];
    expect(node.status).toBe('success');
    expect(node.outputPath).toBeTruthy();
  });

  test('errored pages appear in the nodemap with status error and an error message', async () => {
    mockFetchPage.mockImplementationOnce(async () => { throw new Error('Timeout'); });
    await run(baseConfig);
    const nodemap = capturedNodemap();
    expect(nodemap.nodes['https://example.com/'].status).toBe('error');
    expect(nodemap.nodes['https://example.com/'].error).toBeTruthy();
  });

  test('nodemap totalPages reflects the number of successfully written pages', async () => {
    mockExtractLinks
      .mockReturnValueOnce(['https://example.com/about'])
      .mockReturnValue([]);
    await run(baseConfig);
    const nodemap = capturedNodemap();
    expect(nodemap.totalPages).toBe(2);
  });

  afterAll(() => {
    mock.restore();
  });
});
