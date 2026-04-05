import path from 'path';
import fs from 'fs/promises';
import type { NodemapJson } from './types.js';

/**
 * Converts query string parameters to a safe filename suffix.
 * e.g. ?q=hello&page=2 → -q-hello-page-2
 */
function queryToSuffix(search: string): string {
  if (!search || search === '?') return '';
  return '-' + search.slice(1).replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/-$/, '');
}

export function urlToOutputPath(url: string, outputDir: string): string {
  const parsed = new URL(url);
  let pathname = parsed.pathname;

  // Trailing slash → directory index (avoids dir/file conflicts)
  if (pathname.endsWith('/')) {
    pathname = pathname + 'index';
  }

  // Include sanitized query string in the filename to avoid collisions
  // e.g. /search?q=foo → search-q-foo.md
  const querySuffix = queryToSuffix(parsed.search);

  const ext = path.extname(pathname);
  if (ext === '.html' || ext === '.htm') {
    pathname = pathname.slice(0, -ext.length) + querySuffix + '.md';
  } else if (!ext) {
    pathname = pathname + querySuffix + '.md';
  } else {
    pathname = pathname + querySuffix + '.md';
  }

  const relative = pathname.replace(/^\//, '');
  return path.join(path.resolve(outputDir), relative);
}

export async function writePage(outputPath: string, content: string): Promise<void> {
  let targetPath = outputPath;

  // If something already exists at this path as a directory, write index.md inside it
  try {
    const stat = await fs.stat(outputPath);
    if (stat.isDirectory()) {
      targetPath = path.join(outputPath, 'index.md');
    }
  } catch {
    // Path doesn't exist yet — that's fine
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content, 'utf-8');
}

export async function writeNodemap(
  nodemap: NodemapJson,
  outputDir: string,
): Promise<void> {
  await fs.mkdir(path.resolve(outputDir), { recursive: true });
  const nodemapPath = path.join(path.resolve(outputDir), 'nodemap.json');
  await fs.writeFile(nodemapPath, JSON.stringify(nodemap, null, 2), 'utf-8');
}
