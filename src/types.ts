export interface CrawlConfig {
  startUrl: string;
  outputDir: string;
  concurrency: number;
  maxDepth?: number;
  maxPages?: number;
  delayMs?: number;
}

export interface QueueItem {
  url: string;
  depth: number;
}

export type NodeStatus = 'pending' | 'success' | 'error' | 'skipped';

export interface NodeMeta {
  depth: number;
  status: NodeStatus;
  error?: string;
  outputPath?: string;
}

export interface NodemapJsonEntry extends NodeMeta {
  outLinks: string[];
}

export interface NodemapJson {
  startUrl: string;
  crawledAt: string;
  totalPages: number;
  nodes: Record<string, NodemapJsonEntry>;
}
