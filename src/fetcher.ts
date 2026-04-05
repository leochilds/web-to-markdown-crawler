import got, { Got, HTTPError, RequestError } from 'got';

export class FetchError extends Error {
  constructor(
    public readonly url: string,
    public readonly statusCode: number | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

const client: Got = got.extend({
  timeout: { request: 10_000 },
  followRedirect: true,
  headers: { 'User-Agent': 'web-to-markdown-crawler/1.0' },
  retry: {
    limit: 3,
    statusCodes: [429, 500, 502, 503, 504],
  },
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchPage(
  url: string,
  delayMs?: number,
): Promise<{ html: string; finalUrl: string }> {
  if (delayMs) await sleep(delayMs);

  try {
    const response = await client.get(url, { responseType: 'text' });

    const contentType = response.headers['content-type'] ?? '';
    if (!contentType.includes('text/html')) {
      throw new FetchError(
        url,
        response.statusCode,
        `Non-HTML content type: ${contentType}`,
      );
    }

    return {
      html: response.body as string,
      finalUrl: response.url,
    };
  } catch (err) {
    if (err instanceof FetchError) throw err;
    if (err instanceof HTTPError) {
      throw new FetchError(url, err.response.statusCode, err.message);
    }
    if (err instanceof RequestError) {
      throw new FetchError(url, undefined, err.message);
    }
    throw new FetchError(url, undefined, String(err));
  }
}
