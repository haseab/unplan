// Development adapter contract v1. No production deployment configuration lives here.
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export function sessionEnvironment(env = process.env) {
  const id = env.DEV_SESSION_ID;
  const port = Number(env.PORT);
  if (!id || !/^[a-z][a-z0-9-]{0,63}$/.test(id) || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('Launch through bb dev-session with an assigned PORT and DEV_SESSION_ID.');
  }
  const origin = new URL(env.SITE_URL ?? '');
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) {
    throw new Error('SITE_URL must be the exact HTTPS preview origin.');
  }
  return { ...env, PORT: String(port), DEV_SESSION_ID: id,
    APP_ORIGIN: origin.origin, NEXTAUTH_URL: origin.origin, AUTH_URL: origin.origin,
    SITE_URL: origin.origin, NEXT_PUBLIC_SITE_URL: origin.origin,
    DEV_DIST_DIR: `.next-sessions/${id}`, DEV_TSCONFIG_PATH: `.debug/dev-sessions/${id}/tsconfig.json`,
    NEXT_DEV_ALLOWED_ORIGINS: origin.hostname,
  };
}

const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];
export function forwardingHeaders(headers) {
  const result = { ...headers };
  for (const key of hopHeaders) delete result[key];
  return result;
}

/** All application traffic reaches the one real app server. This is not a mock backend. */
export function createFrontendProxy(target) {
  const origin = new URL(target);
  if (origin.hostname !== '127.0.0.1' || origin.protocol !== 'http:') throw new Error('App upstream must be loopback HTTP.');
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    const upstream = http.request({ hostname: origin.hostname, port: origin.port,
      path: request.url, method: request.method, headers: forwardingHeaders(request.headers) }, result => {
      response.writeHead(result.statusCode ?? 502, forwardingHeaders(result.headers));
      result.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end('Application server unavailable.'); });
    upstream.setTimeout(120000, () => upstream.destroy());
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => { if (!response.writableEnded) upstream.destroy(); });
    request.pipe(upstream);
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('upgrade', (request, socket, head) => {
    const upstream = net.connect(Number(origin.port), origin.hostname, () => {
      const headers = { ...forwardingHeaders(request.headers), connection: 'Upgrade', upgrade: request.headers.upgrade };
      upstream.write(`${request.method} ${request.url} HTTP/1.1\r\n${Object.entries(headers).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`).join('\r\n')}\r\n\r\n`);
      upstream.write(head); upstream.pipe(socket); socket.pipe(upstream);
    });
    upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy()); socket.on('close', () => upstream.destroy());
  });
  return { server, close: () => { for (const socket of sockets) socket.destroy(); server.close(); } };
}

async function main() {
  const env = sessionEnvironment();
  const config = JSON.parse(await readFile(new URL('./dev-session-app.json', import.meta.url), 'utf8'));
  if (process.argv[2] === 'proxy') {
    const proxy = createFrontendProxy(env.API_INTERNAL_URL);
    proxy.server.listen(Number(env.PORT), '127.0.0.1');
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, proxy.close);
    return;
  }
  if (process.argv[2] !== 'app') throw new Error('Expected app or proxy role.');
  const require = createRequire(import.meta.url);
  if (config.framework === 'service') {
    const { config: loadEnv } = require('dotenv');
    for (const file of ['.env.local', '.env']) loadEnv({ path: file, processEnv: env });
  } else if (config.framework === 'next' && config.requiredEnv?.length) {
    const { combinedEnv } = createRequire(require.resolve('next/package.json'))('@next/env').loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
    for (const [key, value] of Object.entries(combinedEnv)) if (env[key] === undefined) env[key] = value;
  }
  const missing = (config.requiredEnv ?? []).filter(key => !env[key]);
  if (missing.length) throw new Error(`Missing private development settings: ${missing.join(', ')}. Configure ignored local environment files; no application was started.`);
  let args;
  if (config.framework === 'next') {
    await mkdir(path.dirname(env.DEV_TSCONFIG_PATH), { recursive: true });
    await writeFile(env.DEV_TSCONFIG_PATH, JSON.stringify({ extends: '../../../tsconfig.json',
      include: ['../../../next-env.d.ts', '../../../**/*.ts', '../../../**/*.tsx', `../../../${env.DEV_DIST_DIR}/**/*.ts`],
      exclude: ['../../../node_modules', '../../../.next', '../../../.debug', '../../../.next-sessions'],
    }, null, 2));
    args = ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', env.PORT];
  } else if (config.framework === 'vite') {
    args = ['node_modules/vite/bin/vite.js', '--config', 'vite.dev-session.config.ts', '--host', '127.0.0.1', '--port', env.PORT, '--strictPort'];
  } else {
    if (config.worker && env.DEV_SESSION_ALLOW_WORKERS !== '1') throw new Error('Worker preview requires an isolated backend and explicit DEV_SESSION_ALLOW_WORKERS=1. No queues were started.');
    env.API_PORT = env.PORT; env.API_HOST = '127.0.0.1';
    args = ['--import', 'tsx', config.entrypoint];
  }
  const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
  child.on('error', () => { console.error('[DEV_SESSION:START] Application process could not start.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
