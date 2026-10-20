import assert from 'node:assert/strict';
import { request } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const manifestUrl = new URL('../packages/media/approved-media-v1.json', import.meta.url);
const mediaId = 'a426db98f35e4bc984275cc031467ac9';
const publicTestIp = '208.80.154.224';

function jpegFixture(width = 1, height = 1) {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

async function makeRelay(t, overrides = {}) {
  const relayModule = await import('../packages/media/relay-server.mjs');
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  const server = relayModule.createMediaRelayServer({
    manifest,
    resolveHost: async () => [{ address: publicTestIp, family: 4 }],
    requestUpstream: async () => ({ statusCode: 200, headers: { 'content-type': 'image/jpeg' }, body: jpegFixture() }),
    ...overrides,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  return { relayModule, server, origin: `http://127.0.0.1:${address.port}` };
}

function get(origin, path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const outgoing = request(`${origin}${path}`, { method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    outgoing.on('error', reject);
    outgoing.end();
  });
}

test('approved media endpoint relays bounded image bytes with ETag and memory caching', async (t) => {
  let upstreamRequests = 0;
  const fixture = jpegFixture();
  const { origin } = await makeRelay(t, {
    requestUpstream: async (_url, options) => {
      upstreamRequests += 1;
      assert.ok(options.maxBytes >= fixture.byteLength);
      return { statusCode: 200, headers: { 'content-type': 'image/jpeg', 'set-cookie': ['source=secret'] }, body: fixture };
    },
  });

  const first = await get(origin, `/media/${mediaId}/profile`);
  assert.equal(first.status, 200);
  assert.equal(first.headers['content-type'], 'image/jpeg');
  assert.equal(first.headers['x-content-type-options'], 'nosniff');
  assert.match(first.headers['cache-control'], /max-age=/);
  assert.match(first.headers.etag, /^"[a-f0-9]+"$/);
  assert.equal(first.headers['set-cookie'], undefined);
  assert.deepEqual(first.body, fixture);

  const cached = await get(origin, `/media/${mediaId}/profile`);
  assert.equal(cached.status, 200);
  assert.deepEqual(cached.body, fixture);
  assert.equal(upstreamRequests, 1);

  const notModified = await get(origin, `/media/${mediaId}/profile`, { 'if-none-match': first.headers.etag });
  assert.equal(notModified.status, 304);
  assert.equal(notModified.body.byteLength, 0);
  assert.equal(upstreamRequests, 1);
});

test('pinned DNS lookup supports Node net single and all-address callback signatures', async () => {
  const { createPinnedLookup } = await import('../packages/media/relay-server.mjs');
  const lookup = createPinnedLookup(publicTestIp, 4);
  await new Promise((resolve, reject) => {
    lookup('thumb.wikimedia.org', { all: true }, (error, addresses) => {
      try {
        assert.ifError(error);
        assert.deepEqual(addresses, [{ address: publicTestIp, family: 4 }]);
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });
  });
  await new Promise((resolve, reject) => {
    lookup('thumb.wikimedia.org', (error, address, family) => {
      try {
        assert.ifError(error);
        assert.equal(address, publicTestIp);
        assert.equal(family, 4);
        resolve();
      } catch (assertionError) {
        reject(assertionError);
      }
    });
  });
});

test('bogus IDs, query URLs, and unsupported methods cannot select upstream resources', async (t) => {
  let upstreamRequests = 0;
  const { origin } = await makeRelay(t, { requestUpstream: async () => { upstreamRequests += 1; throw new Error('unexpected upstream request'); } });
  assert.equal((await get(origin, `/media/${'b'.repeat(32)}/profile`)).status, 404);
  assert.equal((await get(origin, `/media/${mediaId}/profile?url=https://127.0.0.1/`)).status, 404);
  assert.equal((await get(origin, `/media/${mediaId}/profile`, {}, 'POST')).status, 405);
  assert.equal(upstreamRequests, 0);
});

test('manifest hosts and resolved addresses reject SSRF destinations', async (t) => {
  const relayModule = await import('../packages/media/relay-server.mjs');
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
  const changed = structuredClone(manifest);
  changed.items[0].variants.thumb.url = 'https://127.0.0.1/private.jpg';
  assert.throws(() => relayModule.validateApprovedMediaManifest(changed), /host|URL/i);

  let upstreamRequests = 0;
  const { origin } = await makeRelay(t, {
    resolveHost: async () => [{ address: '127.0.0.1', family: 4 }],
    requestUpstream: async () => { upstreamRequests += 1; throw new Error('private address must not be requested'); },
  });
  assert.equal((await get(origin, `/media/${mediaId}/thumb`)).status, 502);
  assert.equal(upstreamRequests, 0);
  assert.equal(relayModule.isPublicIpAddress('8.8.8.8'), true);
  assert.equal(relayModule.isPublicIpAddress('10.0.0.1'), false);
  assert.equal(relayModule.isPublicIpAddress('169.254.169.254'), false);
  assert.equal(relayModule.isPublicIpAddress('::1'), false);
  assert.equal(relayModule.isPublicIpAddress('fc00::1'), false);
  assert.equal(relayModule.isPublicIpAddress('192.0.2.10'), false);
  assert.equal(relayModule.isPublicIpAddress('2001:db8::1'), false);

  const mixedAnswers = await makeRelay(t, {
    resolveHost: async () => [
      { address: publicTestIp, family: 4 },
      { address: '169.254.169.254', family: 4 },
    ],
    requestUpstream: async () => { upstreamRequests += 1; throw new Error('mixed public/private DNS must not be requested'); },
  });
  assert.equal((await get(mixedAnswers.origin, `/media/${mediaId}/thumb`)).status, 502);
  assert.equal(upstreamRequests, 0);
});

test('stalled DNS resolution returns a bounded timeout response', async (t) => {
  let upstreamRequests = 0;
  const { origin } = await makeRelay(t, {
    totalTimeoutMs: 20,
    resolveHost: async () => new Promise(() => {}),
    requestUpstream: async () => { upstreamRequests += 1; throw new Error('upstream must not start after DNS timeout'); },
  });
  assert.equal((await get(origin, `/media/${mediaId}/thumb`)).status, 504);
  assert.equal(upstreamRequests, 0);
});

test('redirects are limited and each destination is revalidated before another request', async (t) => {
  let upstreamRequests = 0;
  const { origin } = await makeRelay(t, {
    requestUpstream: async () => {
      upstreamRequests += 1;
      return { statusCode: 302, headers: { location: 'https://thumb.wikimedia.org.evil.example/image.jpg' }, body: Buffer.alloc(0) };
    },
  });
  assert.equal((await get(origin, `/media/${mediaId}/thumb`)).status, 502);
  assert.equal(upstreamRequests, 1);

  const privateRedirect = await makeRelay(t, {
    requestUpstream: async () => ({ statusCode: 302, headers: { location: 'https://127.0.0.1/private.jpg' }, body: Buffer.alloc(0) }),
  });
  assert.equal((await get(privateRedirect.origin, `/media/${mediaId}/thumb`)).status, 502);
});

test('oversize, invalid MIME, bad magic bytes, and excessive dimensions are rejected', async (t) => {
  const fixture = jpegFixture();
  const oversized = await makeRelay(t, {
    requestUpstream: async () => ({ statusCode: 200, headers: { 'content-type': 'image/jpeg' }, body: Buffer.alloc(65537, 0xff) }),
  });
  assert.equal((await get(oversized.origin, `/media/${mediaId}/thumb`)).status, 413);

  const wrongMime = await makeRelay(t, {
    requestUpstream: async () => ({ statusCode: 200, headers: { 'content-type': 'text/html' }, body: fixture }),
  });
  assert.equal((await get(wrongMime.origin, `/media/${mediaId}/thumb`)).status, 502);

  const badMagic = await makeRelay(t, {
    requestUpstream: async () => ({ statusCode: 200, headers: { 'content-type': 'image/jpeg' }, body: Buffer.from('<html>blocked</html>') }),
  });
  assert.equal((await get(badMagic.origin, `/media/${mediaId}/thumb`)).status, 502);

  const tooWide = await makeRelay(t, {
    requestUpstream: async () => ({ statusCode: 200, headers: { 'content-type': 'image/jpeg' }, body: jpegFixture(331, 220) }),
  });
  assert.equal((await get(tooWide.origin, `/media/${mediaId}/thumb`)).status, 502);
});

test('per-client rate limits return a bounded retry response', async (t) => {
  const { origin } = await makeRelay(t, { maxRequestsPerMinute: 1 });
  assert.equal((await get(origin, `/media/${mediaId}/thumb`)).status, 200);
  const limited = await get(origin, `/media/${mediaId}/thumb`);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers['retry-after']) >= 1);
});

test('rate-limit state has a hard bucket cap and aggregates overflow clients', async (t) => {
  const { origin } = await makeRelay(t, { maxRequestsPerMinute: 1, maxRateBuckets: 3 });
  const requestAs = (address) => get(origin, `/media/${mediaId}/thumb`, { 'x-real-ip': address });

  assert.equal((await requestAs('198.51.100.1')).status, 200);
  assert.equal((await requestAs('198.51.100.2')).status, 200);
  assert.equal((await requestAs('198.51.100.3')).status, 200, 'the last table slot is shared by overflow clients');
  assert.equal((await requestAs('198.51.100.4')).status, 429, 'new clients share the overflow rate bucket');
  assert.equal((await requestAs('198.51.100.5')).status, 429, 'additional unique addresses cannot grow the table');
  assert.equal((await requestAs('198.51.100.1')).status, 429, 'known clients retain their own rate bucket');
});
