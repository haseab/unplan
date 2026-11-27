import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import { sessionEnvironment, forwardingHeaders, createFrontendProxy } from './dev-session.mjs';
const valid = { PORT: '41001', DEV_SESSION_ID: 'example-session', SITE_URL: 'https://preview.example.com', APP_ORIGIN: 'https://old.example.com' };
test('assigned session ports, callback origins and caches stay isolated', () => {
 const env = sessionEnvironment(valid);
 assert.equal(env.PORT, '41001'); assert.equal(env.APP_ORIGIN, valid.SITE_URL);
 assert.equal(env.NEXTAUTH_URL, valid.SITE_URL); assert.equal(env.AUTH_URL, valid.SITE_URL);
 assert.equal(env.DEV_DIST_DIR, '.next-sessions/example-session');
 assert.equal(env.DEV_TSCONFIG_PATH, '.debug/dev-sessions/example-session/tsconfig.json');
 assert.equal(sessionEnvironment({ ...valid, DEV_SESSION_ID: 'second' }).DEV_DIST_DIR, '.next-sessions/second');
 for (const patch of [{ PORT: '0' }, { PORT: '65536' }, { DEV_SESSION_ID: '../escape' }, { SITE_URL: 'http://preview.example.com' }, { SITE_URL: 'https://preview.example.com/path' }, { SITE_URL: 'https://user:secret@preview.example.com' }]) assert.throws(() => sessionEnvironment({ ...valid, ...patch }));
});
test('proxy preserves authentication and foreign/null origins', () => {
 for (const origin of ['https://foreign.example.com', 'null', undefined]) {
  const headers = forwardingHeaders({ origin, host: 'preview.example.com', authorization: 'Bearer example', cookie: 'session=example', connection: 'keep-alive' });
  assert.equal(headers.origin, origin); assert.equal(headers.authorization, 'Bearer example');
  assert.equal(headers.cookie, 'session=example'); assert.equal(headers.host, 'preview.example.com');
  assert.equal(headers.connection, undefined);
 }
 assert.throws(() => createFrontendProxy('https://external.example.com'));
});
test('frontend transport reaches the actual app server and preserves response cookies', async () => {
 const app = http.createServer((req,res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'session=example; HttpOnly' });
  res.end(JSON.stringify({ path: req.url, origin: req.headers.origin, authorization: req.headers.authorization }));
 });
 app.listen(0, '127.0.0.1'); await once(app, 'listening');
 const proxy = createFrontendProxy(`http://127.0.0.1:${app.address().port}`);
 proxy.server.listen(0, '127.0.0.1'); await once(proxy.server, 'listening');
 try {
  const result = await fetch(`http://127.0.0.1:${proxy.server.address().port}/api/example?query=1`, { headers: { origin: 'https://foreign.example.com', authorization: 'Bearer example' } });
  assert.equal(result.status, 200); assert.match(result.headers.get('set-cookie'), /HttpOnly/);
  assert.deepEqual(await result.json(), { path: '/api/example?query=1', origin: 'https://foreign.example.com', authorization: 'Bearer example' });
 } finally { proxy.close(); app.closeAllConnections(); app.close(); }
});

test('identity route is inaccessible in production and requires a session in development', async () => {
 const config = JSON.parse(await readFile('scripts/dev-session-app.json', 'utf8'));
 const source = await readFile(config.probe, 'utf8');
 const { GET } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
 const original = { mode: process.env.NODE_ENV, id: process.env.DEV_SESSION_ID };
 try {
  process.env.NODE_ENV = 'production'; process.env.DEV_SESSION_ID = 'example-session';
  const production = GET(); assert.equal(production.status, 404); assert.equal(production.headers.get('x-dev-session-id'), null);
  process.env.NODE_ENV = 'development'; delete process.env.DEV_SESSION_ID;
  assert.equal(GET().status, 404);
  process.env.DEV_SESSION_ID = 'example-session';
  const development = GET(); assert.equal(development.status, 200);
  assert.equal(development.headers.get('x-dev-session-id'), 'example-session');
  assert.deepEqual(await development.json(), { session: 'example-session' });
 } finally {
  if (original.mode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original.mode;
  if (original.id === undefined) delete process.env.DEV_SESSION_ID; else process.env.DEV_SESSION_ID = original.id;
 }
});
