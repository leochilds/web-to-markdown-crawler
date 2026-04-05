# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev <url> [options]   # run from source
bun run typecheck              # tsc --noEmit
bun run test                   # full test suite (77 tests, all 5 files)
bun run build                  # compile to dist/
```

**Running a single test file:**
```bash
~/.bun/bin/bun test tests/converter.test.ts
```

`bun` must be invoked as `~/.bun/bin/bun` (not on PATH in this environment). The `test` script runs each file as a separate process to avoid `mock.module()` pollution (see below).

## Architecture

The crawl pipeline is linear: **fetch → parse → convert → write**, orchestrated by `src/crawler.ts`.

```
src/
  index.ts      CLI (commander) — parses args, calls run()
  crawler.ts    Orchestrator — wave-based BFS queue, graph, nodemap
  fetcher.ts    HTTP (got) — returns { html, finalUrl }; throws FetchError
  parser.ts     Link extraction (cheerio) — returns absolute URLs, no fragments
  converter.ts  HTML → Markdown (turndown) + link rewriting
  writer.ts     Disk output — urlToOutputPath, writePage, writeNodemap
  graph.ts      Thin wrapper around graphjs
  types.ts      Shared interfaces (CrawlConfig, NodemapJson, etc.)
```

### Crawl loop (crawler.ts)

Wave-based BFS: `queue.splice(0)` takes the entire current wave as a batch, processes all items concurrently under `pLimit`, collects new URLs into `newItems`, then repeats. URLs are added to `visited` when **enqueued** (not when processed) to prevent same-wave duplicates.

The graph (`graphjs`) records directed edges for every discovered link, including external ones. `nodemap.json` is serialized from this graph plus the `meta` Map at the end of the crawl.

### Link rewriting (converter.ts)

`rewriteInternalLinks` rewrites `[text](url)` markdown links to relative `.md` paths. It only operates on text outside fenced code blocks and inline code spans (`rewriteOutsideCode`). The regex is created inside the function on each call — not at module level — to avoid stale `lastIndex` on the `g` flag.

URLs starting with `:` are explicitly rejected before `new URL()` because Bun's WHATWG URL parser treats `:::invalid:::` as a valid relative path rather than throwing.

### Test isolation

Bun 1.3.11's `mock.module()` modifies a shared module registry across all test files in a single `bun test` invocation. The `crawler.test.ts` file mocks `fetcher`, `parser`, `converter`, and `writer` — which would poison those modules' own test files. The fix is the `test` script running each file as a separate `bun test` process. Do not change this to `bun test tests/`.

### Module system

TypeScript is compiled with `module: NodeNext` / `moduleResolution: NodeNext`. All imports within `src/` use `.js` extensions (e.g. `import { run } from './crawler.js'`) even though the source files are `.ts` — this is required for NodeNext ESM resolution.

`graphjs` is a CJS package with named exports. It is imported as `import { Graph as GraphCtor } from 'graphjs'` with a local hand-written declaration at `src/graphjs.d.ts`.
