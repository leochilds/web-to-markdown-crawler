import pLimit from 'p-limit';
import type { CrawlConfig, CrawlState, NodeMeta, NodeStatus, NodemapJson, NodemapJsonEntry, QueueItem } from './types.js';
import { FetchError, fetchPage } from './fetcher.js';
import { extractLinks } from './parser.js';
import { convertToMarkdown, rewriteInternalLinks } from './converter.js';
import { urlToOutputPath, writePage, writeNodemap } from './writer.js';
import { createGraph, type GraphInstance } from './graph.js';
import path from 'path';

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

function serializeGraph(
  graph: GraphInstance,
  meta: Map<string, NodeMeta>,
  startUrl: string,
  totalPages: number,
  crawledAt: string,
): NodemapJson {
  const nodes: Record<string, NodemapJsonEntry> = {};

  // Include all nodes known to the graph
  graph.each((vertex) => {
    const m = meta.get(vertex) ?? { depth: 0, status: 'skipped' as NodeStatus };
    const outLinks = Object.keys(graph.adj(vertex));
    nodes[vertex] = { ...m, outLinks };
  });

  // Also include any nodes in meta that have no edges (e.g. the start URL on a site with no links)
  for (const [url, m] of meta) {
    if (!nodes[url]) {
      nodes[url] = { ...m, outLinks: [] };
    }
  }

  return { startUrl, crawledAt, totalPages, nodes };
}

async function processPage(
  item: QueueItem,
  config: CrawlConfig,
  visited: Set<string>,
  graph: GraphInstance,
  meta: Map<string, NodeMeta>,
  newItems: QueueItem[],
  state: CrawlState,
): Promise<void> {
  const { url, depth } = item;

  // Soft maxPages check — may overshoot by at most concurrency-1 pages
  if (config.maxPages !== undefined && state.totalPages >= config.maxPages) {
    const node = meta.get(url);
    if (node) node.status = 'skipped';
    return;
  }

  console.log(`[info] Crawling: ${url} (depth ${depth})`);

  try {
    const { html, finalUrl } = await fetchPage(url, config.delayMs);

    // If redirected to a different URL, record the redirect edge and deduplicate
    const effectiveUrl = normalizeUrl(finalUrl);
    if (effectiveUrl !== url) {
      graph.dir(url, effectiveUrl);
      // Prevent the redirect target from being enqueued separately
      visited.add(effectiveUrl);
      if (!meta.has(effectiveUrl)) {
        meta.set(effectiveUrl, { depth, status: 'pending' });
      }
    }

    // The canonical hostname is always the effective (post-redirect) hostname of
    // the start page. Update on every depth-0 page so that when example.com
    // redirects to www.example.com the canonical scope reflects the true destination.
    // Both the original and redirected hostnames are kept as internal aliases so
    // that links pointing to either form are still crawled.
    if (depth === 0) {
      const effectiveHostname = new URL(effectiveUrl).hostname;
      state.startHostname = effectiveHostname;
      state.internalHostnames.add(effectiveHostname);
    }

    const links = extractLinks(html, effectiveUrl);

    for (const rawLink of links) {
      const link = normalizeUrl(rawLink);
      const parsedLink = new URL(link);
      const isInternal = state.internalHostnames.has(parsedLink.hostname);
      const isExcluded = config.exclude?.some(pattern => parsedLink.pathname.startsWith(pattern)) ?? false;

      // Record edge in graph regardless of whether we'll crawl it
      graph.dir(url, link);

      // Initialise metadata for newly seen URLs
      if (!meta.has(link)) {
        meta.set(link, {
          depth: depth + 1,
          status: isInternal && !isExcluded ? 'pending' : 'skipped',
        });
      }

      // Enqueue only internal, unvisited, non-excluded links within depth limit
      if (
        isInternal &&
        !isExcluded &&
        !visited.has(link) &&
        (config.maxDepth === undefined || depth + 1 <= config.maxDepth)
      ) {
        visited.add(link);
        newItems.push({ url: link, depth: depth + 1 });
      }
    }

    const outputPath = urlToOutputPath(effectiveUrl, config.outputDir);
    const relativeOutputPath = path.relative(path.resolve(config.outputDir), outputPath);

    const markdown = convertToMarkdown(html, effectiveUrl);
    const rewritten = rewriteInternalLinks(markdown, state.startHostname, relativeOutputPath, effectiveUrl);

    await writePage(outputPath, rewritten);

    const node = meta.get(url)!;
    node.status = 'success';
    node.outputPath = relativeOutputPath;
    state.totalPages++;

    console.log(`[ok]   Written: ${relativeOutputPath}`);
  } catch (err) {
    const node = meta.get(url)!;
    node.status = 'error';
    node.error =
      err instanceof FetchError
        ? `HTTP ${err.statusCode ?? 'network'}: ${err.message}`
        : String(err);
    console.error(`[error] ${url}: ${node.error}`);
  }
}

export async function run(config: CrawlConfig): Promise<void> {
  const startUrl = normalizeUrl(config.startUrl);
  const crawledAt = new Date().toISOString();

  const visited = new Set<string>([startUrl]);
  const graph = createGraph();
  const meta = new Map<string, NodeMeta>();
  const initialHostname = new URL(startUrl).hostname;
  const state: CrawlState = {
    totalPages: 0,
    startHostname: initialHostname,
    internalHostnames: new Set([initialHostname]),
  };

  // Seed metadata for the start URL (graph nodes are created lazily when edges are added)
  meta.set(startUrl, { depth: 0, status: 'pending' });

  const limit = pLimit(config.concurrency);
  let queue: QueueItem[] = [{ url: startUrl, depth: 0 }];

  while (queue.length > 0) {
    if (config.maxPages !== undefined && state.totalPages >= config.maxPages) break;

    const batch = queue.splice(0);
    const newItems: QueueItem[] = [];

    const tasks = batch.map(item =>
      limit(() =>
        processPage(item, config, visited, graph, meta, newItems, state),
      ),
    );

    await Promise.allSettled(tasks);

    queue = newItems;
  }

  const nodemap = serializeGraph(graph, meta, startUrl, state.totalPages, crawledAt);
  await writeNodemap(nodemap, config.outputDir);

  const errors = Object.values(nodemap.nodes).filter(n => n.status === 'error').length;
  console.log(
    `\nCrawl complete. ${state.totalPages} page(s) written.${errors > 0 ? ` ${errors} error(s).` : ''}`,
  );
}
