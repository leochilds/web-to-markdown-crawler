import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ─── Mock `got` before fetcher.ts is imported ────────────────────────────────
// fetcher.ts calls got.extend() at module evaluation time, so the mock must
// be registered before the dynamic import below.

const mockGet = mock(async () => ({
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: '<html><body>Hello</body></html>',
  url: 'https://example.com/',
  statusCode: 200,
}));

class MockHTTPError extends Error {
  response: { statusCode: number };
  constructor(statusCode: number, message = 'HTTP Error') {
    super(message);
    this.name = 'HTTPError';
    this.response = { statusCode };
  }
}

class MockRequestError extends Error {
  constructor(message = 'Request Error') {
    super(message);
    this.name = 'RequestError';
  }
}

mock.module('got', () => ({
  default: {
    extend: () => ({ get: mockGet }),
  },
  HTTPError: MockHTTPError,
  RequestError: MockRequestError,
}));

const { fetchPage, FetchError } = await import('../src/fetcher.js');

// ─── FetchError ───────────────────────────────────────────────────────────────

describe('FetchError', () => {
  test('is an instance of Error', () => {
    const err = new FetchError('https://example.com/', 404, 'Not Found');
    expect(err).toBeInstanceOf(Error);
  });

  test('has name set to FetchError', () => {
    const err = new FetchError('https://example.com/', 500, 'Server Error');
    expect(err.name).toBe('FetchError');
  });

  test('exposes url and statusCode as readonly properties', () => {
    const err = new FetchError('https://example.com/page', 403, 'Forbidden');
    expect(err.url).toBe('https://example.com/page');
    expect(err.statusCode).toBe(403);
  });

  test('statusCode can be undefined for network errors', () => {
    const err = new FetchError('https://example.com/', undefined, 'ECONNRESET');
    expect(err.statusCode).toBeUndefined();
  });
});

// ─── fetchPage ────────────────────────────────────────────────────────────────

describe('fetchPage', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockImplementation(async () => ({
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: '<html><body>Hello</body></html>',
      url: 'https://example.com/',
      statusCode: 200,
    }));
  });

  test('returns html and finalUrl on a successful response', async () => {
    const result = await fetchPage('https://example.com/');
    expect(result.html).toContain('<html>');
    expect(result.finalUrl).toBe('https://example.com/');
  });

  test('uses response.url as finalUrl (reflecting post-redirect URL)', async () => {
    mockGet.mockImplementationOnce(async () => ({
      headers: { 'content-type': 'text/html' },
      body: '<html></html>',
      url: 'https://example.com/redirected',
      statusCode: 200,
    }));
    const result = await fetchPage('https://example.com/original');
    expect(result.finalUrl).toBe('https://example.com/redirected');
  });

  test('throws FetchError for a non-text/html content-type', async () => {
    mockGet.mockImplementationOnce(async () => ({
      headers: { 'content-type': 'application/pdf' },
      body: '%PDF...',
      url: 'https://example.com/file.pdf',
      statusCode: 200,
    }));
    await expect(fetchPage('https://example.com/file.pdf')).rejects.toBeInstanceOf(FetchError);
  });

  test('FetchError from non-HTML response includes the url', async () => {
    mockGet.mockImplementationOnce(async () => ({
      headers: { 'content-type': 'application/json' },
      body: '{}',
      url: 'https://example.com/api',
      statusCode: 200,
    }));
    let caught: unknown;
    try {
      await fetchPage('https://example.com/api');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FetchError);
    expect((caught as InstanceType<typeof FetchError>).url).toBe('https://example.com/api');
  });

  test('throws FetchError with statusCode when got throws an HTTPError', async () => {
    mockGet.mockImplementationOnce(async () => { throw new MockHTTPError(404); });
    let caught: unknown;
    try {
      await fetchPage('https://example.com/missing');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FetchError);
    expect((caught as InstanceType<typeof FetchError>).statusCode).toBe(404);
  });

  test('throws FetchError without statusCode when got throws a RequestError', async () => {
    mockGet.mockImplementationOnce(async () => { throw new MockRequestError('ECONNREFUSED'); });
    let caught: unknown;
    try {
      await fetchPage('https://example.com/');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(FetchError);
    expect((caught as InstanceType<typeof FetchError>).statusCode).toBeUndefined();
  });

  test('does not call sleep when delayMs is not provided', async () => {
    const setTimeoutSpy = mock((_fn: () => void, _ms: number) => 0 as unknown as ReturnType<typeof setTimeout>);
    const original = globalThis.setTimeout;
    globalThis.setTimeout = setTimeoutSpy as unknown as typeof setTimeout;
    try {
      await fetchPage('https://example.com/');
      expect(setTimeoutSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.setTimeout = original;
    }
  });

  test('calls sleep with the correct duration when delayMs is provided', async () => {
    let capturedMs: number | undefined;
    const original = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      capturedMs = ms;
      fn(); // resolve immediately so test doesn't hang
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    try {
      await fetchPage('https://example.com/', 250);
      expect(capturedMs).toBe(250);
    } finally {
      globalThis.setTimeout = original;
    }
  });
});
