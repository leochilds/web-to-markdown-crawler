#!/usr/bin/env node
import { Command } from 'commander';
import { run } from './crawler.js';
import type { CrawlConfig } from './types.js';

function parseStartUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      console.error('Error: URL must use http or https protocol');
      process.exit(1);
    }
    return parsed.href;
  } catch {
    console.error(`Error: Invalid URL "${raw}"`);
    process.exit(1);
  }
}

const program = new Command();

program
  .name('crawl')
  .description('Crawl a website and convert pages to markdown')
  .argument('<url>', 'Starting URL to crawl')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-c, --concurrency <n>', 'Number of parallel fetches', '5')
  .option('--max-depth <n>', 'Maximum crawl depth (0 = start page only)')
  .option('--max-pages <n>', 'Maximum number of pages to crawl')
  .option('--delay <ms>', 'Delay in milliseconds between requests')
  .action(async (url: string, opts: Record<string, string | undefined>) => {
    // Validate URL
    const startUrl = parseStartUrl(url);

    const concurrency = parseInt(opts['concurrency'] ?? '5', 10);
    if (isNaN(concurrency) || concurrency < 1) {
      console.error('Error: --concurrency must be a positive integer');
      process.exit(1);
    }

    const maxDepth = opts['maxDepth'] != null ? parseInt(opts['maxDepth'], 10) : undefined;
    const maxPages = opts['maxPages'] != null ? parseInt(opts['maxPages'], 10) : undefined;
    const delayMs = opts['delay'] != null ? parseInt(opts['delay'], 10) : undefined;

    if (maxDepth !== undefined && isNaN(maxDepth)) {
      console.error('Error: --max-depth must be an integer');
      process.exit(1);
    }
    if (maxPages !== undefined && (isNaN(maxPages) || maxPages < 1)) {
      console.error('Error: --max-pages must be a positive integer');
      process.exit(1);
    }
    if (delayMs !== undefined && (isNaN(delayMs) || delayMs < 0)) {
      console.error('Error: --delay must be a non-negative integer');
      process.exit(1);
    }

    const config: CrawlConfig = {
      startUrl,
      outputDir: opts['output'] ?? './output',
      concurrency,
      maxDepth,
      maxPages,
      delayMs,
    };

    console.log(`Starting crawl of ${startUrl}`);
    console.log(`Output: ${config.outputDir} | Concurrency: ${config.concurrency}${maxDepth !== undefined ? ` | Max depth: ${maxDepth}` : ''}${maxPages !== undefined ? ` | Max pages: ${maxPages}` : ''}\n`);

    await run(config);
  });

program.parse();
