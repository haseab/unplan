import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : path.join(directory, entry.name)))).flat();
}
test('shared implementation has no website, plugin SDK, or private configuration imports', async () => {
  for (const file of await files(path.join(root, 'src'))) {
    if (!/\.[jt]sx?$/.test(file)) continue;
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /from\s+["'](?:next\/|@get-bb\/|@\/|node:)|process\.env/, file);
    for (const [, spec] of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      assert.ok(path.resolve(path.dirname(file), spec).startsWith(path.join(root, 'src') + path.sep), file + ': ' + spec);
    }
    if (source.includes('"use client";')) assert.ok(source.trimStart().startsWith('"use client";'), file);
  }
});
test('the distributable contains its assets, styles, and all relative imports', async () => {
  for (const file of await files(path.join(root, 'dist'))) {
    if (!file.endsWith('.js')) continue;
    const source = await readFile(file, 'utf8');
    for (const [, spec] of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) await access(path.resolve(path.dirname(file), spec));
  }
  const css = await readFile(path.join(root, 'dist/embedded.css'), 'utf8');
  assert.doesNotMatch(css, /url\(["']?\//);
  assert.match(css, /data:font\/woff2;base64,/);
  assert.match(await readFile(path.join(root, 'dist/asset-urls.js'), 'utf8'), /data:image\/png;base64,/);
});

test('website compatibility paths contain imports and re-exports, not copied implementations', async () => {
  const website = path.resolve(root, '../../src');
  for (const directory of ['components', 'hooks', 'lib']) {
    for (const shared of await files(path.join(root, 'src', directory))) {
      if (!/\.(?:ts|tsx)$/.test(shared)) continue;
      const relative = path.relative(path.join(root, 'src'), shared);
      const old = path.join(website, relative);
      let source;
      try { source = await readFile(old, 'utf8'); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      assert.match(source, /@unplan\/frontend/, relative);
      const statements = source.replace(/\/\/[^\n]*/g, '').replace(/"use client";/g, '').split(';').map(s => s.trim()).filter(Boolean);
      assert.ok(statements.every(s => /^(?:export\s+.*\s+from|import\s+["'])/.test(s)), relative);
    }
  }
});
