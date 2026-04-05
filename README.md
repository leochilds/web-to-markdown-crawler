# web-to-markdown-crawler

[![npm version](https://img.shields.io/npm/v/web-to-markdown-crawler)](https://www.npmjs.com/package/web-to-markdown-crawler)
[![CI](https://github.com/leochilds/web-to-markdown-crawler/actions/workflows/ci.yml/badge.svg)](https://github.com/leochilds/web-to-markdown-crawler/actions/workflows/ci.yml)

A CLI tool that crawls a website and converts every page to Markdown, mirroring the site's URL structure as a local directory tree. Internal links are rewritten to relative `.md` paths so the output works as a self-contained document collection.

## Features

- Mirrors URL structure on disk (`/docs/intro` → `docs/intro.md`)
- Rewrites internal links to relative `.md` paths
- Extracts `<main>` / `<article>` / `[role="main"]` content before converting
- Prepends YAML frontmatter (`url`, `crawledAt`) to every file
- Handles redirects — the final URL is used as the canonical path
- Query-string URLs are disambiguated (`/search?q=foo` → `search-q-foo.md`)
- Produces a `nodemap.json` graph of every discovered URL and its status
- Graceful error handling — one bad page never aborts the crawl

## Requirements

- [Bun](https://bun.sh) 1.x

## Installation

```bash
git clone https://github.com/leochilds/web-to-markdown-crawler.git
cd web-to-markdown-crawler
bun install
```

## Usage

```
crawl <url> [options]
```

### Options

| Flag | Default | Description |
|---|---|---|
| `-o, --output <dir>` | `./output` | Output directory |
| `-c, --concurrency <n>` | `5` | Parallel fetch limit |
| `--max-depth <n>` | unlimited | Stop following links beyond this depth (0 = start page only) |
| `--max-pages <n>` | unlimited | Stop after writing this many pages |
| `--delay <ms>` | none | Delay between requests (polite crawling) |

### Examples

```bash
# Crawl a docs site into ./output
bun run dev https://docs.example.com

# Limit depth and add a polite delay
bun run dev https://docs.example.com --max-depth 3 --delay 500

# Custom output directory with a concurrency limit
bun run dev https://docs.example.com -o ./docs-mirror -c 3 --max-pages 100
```

## Output

```
output/
  index.md          ← https://example.com/
  about.md          ← https://example.com/about
  docs/
    index.md        ← https://example.com/docs/
    intro.md        ← https://example.com/docs/intro
  nodemap.json      ← full link graph with per-URL status
```

Each `.md` file begins with YAML frontmatter:

```yaml
---
url: https://example.com/docs/intro
crawledAt: 2026-04-05T09:00:00.000Z
---
```

`nodemap.json` records every URL the crawler encountered (including skipped external links and errors):

```json
{
  "startUrl": "https://example.com/",
  "crawledAt": "2026-04-05T09:00:00.000Z",
  "totalPages": 42,
  "nodes": {
    "https://example.com/": { "status": "success", "outputPath": "output/index.md", "outLinks": [...] },
    "https://external.com/": { "status": "skipped", "outLinks": [] }
  }
}
```

## Development

```bash
bun run dev <url>      # run from source
bun run typecheck      # TypeScript type check
bun run test           # run the test suite (77 tests)
bun run build          # compile to dist/
```

## Built with

- [got](https://github.com/sindresorhus/got) — HTTP requests with retries and redirect handling
- [cheerio](https://github.com/cheeriojs/cheerio) — HTML parsing and link extraction
- [turndown](https://github.com/mixmark-io/turndown) — HTML → Markdown conversion
- [graphjs](https://github.com/tantalor/graphjs) — directed graph for the link nodemap
- [p-limit](https://github.com/sindresorhus/p-limit) — concurrency control

---

*Built with [Claude Code](https://claude.com/claude-code)*
