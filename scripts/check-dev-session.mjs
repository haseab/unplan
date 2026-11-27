import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const manifest = JSON.parse(await readFile('dev-session.json', 'utf8'));
const config = JSON.parse(await readFile('scripts/dev-session-app.json', 'utf8'));
assert.equal(manifest.version, 1);
assert.deepEqual(manifest.frontend.command, ['node', 'scripts/dev-session.mjs', 'proxy']);
assert.deepEqual(manifest.backend.command, ['node', 'scripts/dev-session.mjs', 'app']);
for (const role of ['frontend', 'backend']) assert.equal(manifest[role].cwd, '.');
await access('scripts/dev-session.test.mjs');
if (config.framework === 'next') {
 const text = await readFile(config.nextConfig, 'utf8');
 for (const name of ['DEV_SESSION_ID', 'DEV_DIST_DIR', 'DEV_TSCONFIG_PATH', 'NEXT_DEV_ALLOWED_ORIGINS']) assert.ok(text.includes(name), `Missing ${name}`);
 const route = await readFile(config.probe, 'utf8');
 assert.ok(route.includes('NODE_ENV') && route.includes('DEV_SESSION_ID') && route.includes('404'));
} else await access(config.entrypoint ?? 'vite.dev-session.config.ts');
const tests = spawnSync(process.execPath, ['--test', 'scripts/dev-session.test.mjs'], { stdio: 'inherit', timeout: 20000 });
assert.equal(tests.status, 0, 'Adapter contract tests failed.');
if (!process.argv.includes('--static')) {
 const require = createRequire(path.resolve('package.json'));
 require.resolve(`${config.framework === 'next' ? 'next' : config.framework === 'vite' ? 'vite' : 'tsx'}/package.json`);
 if (config.requiredEnv?.length) {
  if (config.framework === 'next') createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  else for (const file of ['.env.local', '.env']) require('dotenv').config({ path: file });
  const missing = config.requiredEnv.filter(key => !process.env[key]);
  assert.equal(missing.length, 0, `Missing private development settings: ${missing.join(', ')}. Configure ignored local environment files.`);
 }
}
console.log('[DEV_SESSION:CONTRACT] Application adapter contract v1 passed.');
