import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { realpathSync } from 'node:fs';
import { createServer } from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const ALLOWED_SOURCE_HOSTS = new Set(['thumb.wikimedia.org']);
export const RELAY_PORT = 4175;
export const RELAY_HOST = '127.0.0.1';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 32;
const CACHE_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_MAX_REDIRECTS = 2;
const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_MAX_RATE_BUCKETS = 4096;
const RATE_LIMIT_OVERFLOW_KEY = Symbol('overflow rate bucket');
const DEFAULT_MAX_CONCURRENT = 12;
const TOTAL_MAX_BYTES = 393_216;
const PUBLIC_MEDIA_FORMAT = 'animal-lineage-atlas-approved-media-v1';
const ALLOWED_LICENSES = new Map([
  ['cc0', { name: 'CC0 1.0', version: '1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' }],
  ['cc-by-4.0', { name: 'CC BY 4.0', version: '4.0', url: 'https://creativecommons.org/licenses/by/4.0/' }],
  ['cc-by-sa-3.0', { name: 'CC BY-SA 3.0', version: '3.0', url: 'https://creativecommons.org/licenses/by-sa/3.0/' }],
  ['cc-by-sa-4.0', { name: 'CC BY-SA 4.0', version: '4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' }],
]);
const ID_PATTERN = /^[a-f0-9]{32}$/;
const VARIANT_PATTERN = /^(thumb|profile)$/;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const COMMONS_THUMBNAIL_STEPS = new Set([20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840]);

export class RelayError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'RelayError';
    this.statusCode = statusCode;
  }
}

function ipv4ToBigInt(address) {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return parts.reduce((value, part) => (value << 8n) | BigInt(Number(part)), 0n);
}

function ipv6ToBigInt(address) {
  if (address.includes('%')) return null;
  let source = address.toLowerCase();
  const dottedIndex = source.lastIndexOf(':');
  if (source.includes('.') && dottedIndex >= 0) {
    const v4 = ipv4ToBigInt(source.slice(dottedIndex + 1));
    if (v4 === null) return null;
    source = `${source.slice(0, dottedIndex)}:${((v4 >> 16n) & 0xffffn).toString(16)}:${(v4 & 0xffffn).toString(16)}`;
  }
  const halves = source.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const fillCount = 8 - left.length - right.length;
  if (fillCount < 0 || (halves.length === 2 && fillCount < 1)) return null;
  const groups = [...left, ...Array(fillCount).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((value, group) => (value << 16n) | BigInt(parseInt(group, 16)), 0n);
}

function insideCidr(value, base, prefixBits, addressBits) {
  const shift = BigInt(addressBits - prefixBits);
  return (value >> shift) === (base >> shift);
}

export function isPublicIpAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4ToBigInt(address);
    if (value === null) return false;
    const blocked = [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
      ['192.31.196.0', 24], ['192.52.193.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
      ['192.175.48.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['224.0.0.0', 4], ['240.0.0.0', 4],
    ];
    return !blocked.some(([base, prefix]) => insideCidr(value, ipv4ToBigInt(base), prefix, 32));
  }
  if (family === 6) {
    const value = ipv6ToBigInt(address);
    if (value === null) return false;
    // Only global-unicast space is eligible; mapped, local, multicast and special-use ranges fail closed.
    if (!insideCidr(value, 0x20000000000000000000000000000000n, 3, 128)) return false;
    const blocked = [
      [0x20010000000000000000000000000000n, 23], // protocol assignments and transition mechanisms
      [0x20010db8000000000000000000000000n, 32], // documentation
      [0x20020000000000000000000000000000n, 16], // 6to4
      [0x20010010000000000000000000000000n, 28], // ORCHID
      [0x20010020000000000000000000000000n, 28], // ORCHIDv2
      [0x3fff0000000000000000000000000000n, 20], // documentation
    ];
    return !blocked.some(([base, prefix]) => insideCidr(value, base, prefix, 128));
  }
  return false;
}

export function validateUpstreamUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new RelayError(502, 'Invalid approved source URL');
  }
  if (url.protocol !== 'https:' || !ALLOWED_SOURCE_HOSTS.has(url.hostname.toLowerCase())
    || (url.port && url.port !== '443') || url.username || url.password || url.search || url.hash) {
    throw new RelayError(502, 'Approved source URL is outside the relay allowlist');
  }
  return url;
}

function validateOriginalUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Approved original URL is invalid');
  }
  if (url.protocol !== 'https:' || url.hostname !== 'upload.wikimedia.org' || !url.pathname.startsWith('/wikipedia/commons/')
    || url.port || url.username || url.password || url.search || url.hash) {
    throw new Error('Approved original URL is outside the Wikimedia Commons allowlist');
  }
  return url;
}

function validateCommonsThumbnailUrl(value, originalUrl, maxWidth) {
  const url = validateUpstreamUrl(value);
  const original = originalUrl instanceof URL ? originalUrl : validateOriginalUrl(originalUrl);
  const originalPrefix = '/wikipedia/commons/';
  const originalPath = original.pathname.slice(originalPrefix.length);
  const expectedPrefix = `/wikipedia/commons/thumb/${originalPath}/`;
  if (!originalPath || !url.pathname.startsWith(expectedPrefix)) {
    throw new Error('Approved Commons thumbnail URL does not match its original file');
  }
  const suffix = url.pathname.slice(expectedPrefix.length);
  const match = /^(\d+)px-([^/]+)$/.exec(suffix);
  const width = Number(match?.[1]);
  let thumbnailFilename;
  let originalFilename;
  try {
    thumbnailFilename = decodeURIComponent(match?.[2] ?? '');
    originalFilename = decodeURIComponent(originalPath.slice(originalPath.lastIndexOf('/') + 1));
  } catch {
    throw new Error('Approved Commons thumbnail URL has an invalid filename');
  }
  if (!match || !COMMONS_THUMBNAIL_STEPS.has(width) || thumbnailFilename !== originalFilename
    || (Number.isInteger(maxWidth) && width > maxWidth)) {
    throw new Error('Approved Commons thumbnail URL must match its original file and use a supported bounded width');
  }
  return { url, width };
}

export function validateApprovedMediaManifest(manifest) {
  if (!manifest || manifest.format !== PUBLIC_MEDIA_FORMAT || manifest.version !== 1 || !Array.isArray(manifest.items)) {
    throw new Error('Unsupported approved media manifest format');
  }
  const ids = new Set();
  for (const item of manifest.items) {
    if (!item || typeof item !== 'object' || !ID_PATTERN.test(item.id ?? '') || ids.has(item.id)) {
      throw new Error('Approved media IDs must be unique opaque 32-character hexadecimal values');
    }
    ids.add(item.id);
    if (typeof item.animal_id !== 'string' || item.identity_confidence !== 'confirmed'
      || item.embedding_status !== 'allowed' || !ALLOWED_LICENSES.has(item.rights_status)) {
      throw new Error(`Approved media ${item.id} is missing verified identity or reuse rights`);
    }
    if (typeof item.source_page_url !== 'string' || !item.source_page_url.startsWith('https://commons.wikimedia.org/wiki/File:')
      || typeof item.creator !== 'string' || !item.creator.trim()
      || typeof item.credit !== 'string' || !item.credit.trim()
      || typeof item.checked_date !== 'string') {
      throw new Error(`Approved media ${item.id} is missing source or attribution metadata`);
    }
    const originalUrl = validateOriginalUrl(item.original_url);
    item.original_url = originalUrl.href;
    item.direct_thumbnail_url = validateCommonsThumbnailUrl(item.direct_thumbnail_url, originalUrl).url.href;
    const license = item.license;
    const expectedLicense = ALLOWED_LICENSES.get(item.rights_status);
    if (!license || license.name !== expectedLicense.name || license.version !== expectedLicense.version
      || license.url !== expectedLicense.url
      || typeof license.terms !== 'string' || !license.terms.trim()) {
      throw new Error(`Approved media ${item.id} has an unsupported license record`);
    }
    if (item.mime_type !== 'image/jpeg' || !item.variants || typeof item.variants !== 'object'
      || Object.keys(item.variants).sort().join(',') !== 'profile,thumb') {
      throw new Error(`Approved media ${item.id} must define only fixed JPEG profile and thumb variants`);
    }
    for (const variantName of ['thumb', 'profile']) {
      const variant = item.variants[variantName];
      const source = validateCommonsThumbnailUrl(variant?.url, originalUrl, variant?.max_width);
      const sourceUrl = source.url;
      if (variant.mime_type !== item.mime_type || !Number.isInteger(variant.max_bytes)
        || variant.max_bytes < 1 || variant.max_bytes > TOTAL_MAX_BYTES
        || !Number.isInteger(variant.max_width) || variant.max_width < 1 || variant.max_width > 960
        || !Number.isInteger(variant.max_height) || variant.max_height < 1 || variant.max_height > 640) {
        throw new Error(`Approved media ${item.id} has invalid ${variantName} type or size limits`);
      }
      if (variantName === 'thumb' && (variant.max_bytes > 65_536 || variant.max_width > 330 || variant.max_height > 220)) {
        throw new Error(`Approved media ${item.id} thumbnail limits exceed the small-card cap`);
      }
      if (variantName === 'profile' && (variant.max_bytes > 393_216 || variant.max_width > 960 || variant.max_height > 640)) {
        throw new Error(`Approved media ${item.id} profile limits exceed the profile cap`);
      }
      variant.url = sourceUrl.href;
    }
  }
  return new Map(manifest.items.map((item) => [item.id, item]));
}

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (segmentLength < 7) return null;
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += segmentLength;
  }
  return null;
}

function imageDimensions(bytes, mimeType) {
  if (mimeType === 'image/jpeg') return jpegDimensions(bytes);
  if (mimeType === 'image/png') {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mimeType === 'image/webp') {
    if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
    const chunk = bytes.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return {
        width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
        height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
      };
    }
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      return {
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
      };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
  }
  return null;
}

function normalizeHeader(headers, name) {
  const wanted = name.toLowerCase();
  const entry = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === wanted);
  return entry?.[1];
}

export function createPinnedLookup(address, family) {
  const actualFamily = isIP(address);
  if (!actualFamily || family !== actualFamily) throw new TypeError('Pinned media source address must be a valid IP address and family');
  return (_hostname, optionsOrCallback, callback) => {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const done = typeof optionsOrCallback === 'function' ? optionsOrCallback : callback;
    if (typeof done !== 'function') throw new TypeError('Pinned media source lookup requires a callback');
    if (options?.all) done(null, [{ address, family: actualFamily }]);
    else done(null, address, actualFamily);
  };
}

function requestHttpsImage(url, { address, family, maxBytes, timeoutMs, mimeType }) {
  return new Promise((resolveResult, rejectResult) => {
    let settled = false;
    let wallTimer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(wallTimer);
      resolveResult(result);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(wallTimer);
      rejectResult(error);
    };
    const req = https.request({
      protocol: 'https:',
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'GET',
      servername: url.hostname,
      lookup: createPinnedLookup(address, family),
      headers: {
        'user-agent': 'AnimalLineageAtlas/Phase4 (+https://github.com/vvyatkin-afk/Animal-Lineage-Atlas)',
        accept: mimeType,
        'accept-encoding': 'identity',
      },
    }, (response) => {
      const headers = response.headers;
      const statusCode = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(statusCode)) {
        response.resume();
        finish({ statusCode, headers, body: Buffer.alloc(0) });
        return;
      }
      if (statusCode !== 200) {
        response.resume();
        finish({ statusCode, headers, body: Buffer.alloc(0) });
        return;
      }
      const declaredLength = Number(headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        response.destroy();
        fail(new RelayError(413, 'Approved image exceeded its byte limit'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy();
          fail(new RelayError(413, 'Approved image exceeded its byte limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
        finish({ statusCode, headers, body: Buffer.concat(chunks, size) });
      });
      response.on('error', (error) => fail(error));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new RelayError(504, 'Image source timed out')));
    req.on('error', (error) => fail(error));
    wallTimer = setTimeout(() => req.destroy(new RelayError(504, 'Image source timed out')), timeoutMs);
    req.end();
  });
}

async function awaitWithTimeout(promise, timeoutMs, message) {
  if (timeoutMs <= 0) throw new RelayError(504, message);
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new RelayError(504, message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchApprovedImage(item, variantName, dependencies) {
  const variant = item.variants[variantName];
  const initialUrl = validateCommonsThumbnailUrl(variant.url, item.original_url, variant.max_width).url;
  let currentUrl = initialUrl;
  const deadline = Date.now() + dependencies.totalTimeoutMs;
  for (let redirectCount = 0; redirectCount <= dependencies.maxRedirects; redirectCount += 1) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw new RelayError(504, 'Image source timed out');
    currentUrl = validateCommonsThumbnailUrl(currentUrl.href, item.original_url, variant.max_width).url;
    if (currentUrl.hostname !== initialUrl.hostname) throw new RelayError(502, 'Image redirect left the approved host');
    let records;
    try {
      records = await awaitWithTimeout(
        dependencies.resolveHost(currentUrl.hostname),
        remainingMs,
        'Approved image host resolution timed out',
      );
    } catch (error) {
      if (error instanceof RelayError && error.statusCode === 504) throw error;
      throw new RelayError(502, 'Approved image host could not be resolved');
    }
    if (!Array.isArray(records) || records.length === 0 || records.some((record) => !record || !isPublicIpAddress(record.address))) {
      throw new RelayError(502, 'Approved image host resolved to a blocked address');
    }
    let response;
    try {
      response = await dependencies.requestUpstream(currentUrl, {
        address: records[0].address,
        family: records[0].family,
        maxBytes: variant.max_bytes,
        timeoutMs: Math.min(dependencies.timeoutMs, deadline - Date.now()),
        mimeType: variant.mime_type,
      });
    } catch (error) {
      if (error instanceof RelayError) throw error;
      throw new RelayError(502, 'Approved image source could not be reached');
    }
    if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
      if (redirectCount >= dependencies.maxRedirects) throw new RelayError(502, 'Approved image source redirected too many times');
      const location = normalizeHeader(response.headers, 'location');
      if (typeof location !== 'string' || !location) throw new RelayError(502, 'Approved image redirect has no destination');
      let next;
      try {
        next = new URL(location, currentUrl);
      } catch {
        throw new RelayError(502, 'Approved image redirect is invalid');
      }
      currentUrl = validateCommonsThumbnailUrl(next.href, item.original_url, variant.max_width).url;
      if (currentUrl.hostname !== initialUrl.hostname) throw new RelayError(502, 'Image redirect left the approved host');
      continue;
    }
    if (response.statusCode !== 200) throw new RelayError(502, 'Approved image source returned an error');
    const responseType = String(normalizeHeader(response.headers, 'content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (responseType !== variant.mime_type || !ALLOWED_MIME_TYPES.has(responseType)) {
      throw new RelayError(502, 'Approved image source returned an unsupported media type');
    }
    const contentEncoding = normalizeHeader(response.headers, 'content-encoding');
    if (contentEncoding && contentEncoding !== 'identity') throw new RelayError(502, 'Encoded image responses are not accepted');
    if (!Buffer.isBuffer(response.body) || response.body.byteLength === 0) throw new RelayError(502, 'Approved image source returned no image bytes');
    if (response.body.byteLength > variant.max_bytes) throw new RelayError(413, 'Approved image exceeded its byte limit');
    const dimensions = imageDimensions(response.body, responseType);
    if (!dimensions || dimensions.width < 1 || dimensions.height < 1
      || dimensions.width > variant.max_width || dimensions.height > variant.max_height
      || dimensions.width * dimensions.height > variant.max_width * variant.max_height) {
      throw new RelayError(502, 'Approved image dimensions are invalid');
    }
    return { body: response.body, contentType: responseType };
  }
  throw new RelayError(502, 'Approved image source could not be resolved');
}

function publicClientAddress(request) {
  const forwarded = request.headers['x-real-ip'];
  if (typeof forwarded === 'string' && isIP(forwarded)) return forwarded;
  return request.socket.remoteAddress ?? 'unknown';
}

export function createMediaRelayServer(options = {}) {
  const manifest = options.manifest;
  const mediaById = validateApprovedMediaManifest(manifest);
  const dependencies = {
    resolveHost: options.resolveHost ?? ((hostname) => dnsLookup(hostname, { all: true, order: 'verbatim' })),
    requestUpstream: options.requestUpstream ?? requestHttpsImage,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRedirects: options.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
    totalTimeoutMs: options.totalTimeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
  const now = options.now ?? Date.now;
  const rateLimit = options.maxRequestsPerMinute ?? DEFAULT_RATE_LIMIT;
  const rateWindowMs = options.rateWindowMs ?? DEFAULT_RATE_WINDOW_MS;
  const maxRateBuckets = Number.isInteger(options.maxRateBuckets)
    ? Math.max(2, options.maxRateBuckets)
    : DEFAULT_MAX_RATE_BUCKETS;
  const maxConcurrent = options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT;
  const cache = new Map();
  const rate = new Map();
  let cacheBytes = 0;
  let inFlight = 0;

  const removeCacheEntry = (key) => {
    const entry = cache.get(key);
    if (entry) cacheBytes -= entry.body.byteLength;
    cache.delete(key);
  };
  const getCached = (key) => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      removeCacheEntry(key);
      return null;
    }
    cache.delete(key);
    cache.set(key, entry);
    return entry;
  };
  const setCached = (key, value) => {
    if (value.body.byteLength > CACHE_MAX_BYTES) return;
    removeCacheEntry(key);
    cache.set(key, { ...value, expiresAt: now() + CACHE_TTL_MS });
    cacheBytes += value.body.byteLength;
    while (cache.size > CACHE_MAX_ENTRIES || cacheBytes > CACHE_MAX_BYTES) {
      removeCacheEntry(cache.keys().next().value);
    }
  };
  const rateLimited = (address) => {
    const timestamp = now();
    let key = address;
    let bucket = rate.get(key);
    if (!bucket && rate.size >= maxRateBuckets - 1) {
      const overflowBucket = rate.get(RATE_LIMIT_OVERFLOW_KEY);
      if (overflowBucket && overflowBucket.expiresAt > timestamp) {
        key = RATE_LIMIT_OVERFLOW_KEY;
        bucket = overflowBucket;
      } else {
        if (overflowBucket) rate.delete(RATE_LIMIT_OVERFLOW_KEY);
        for (const [existingKey, existingBucket] of rate) {
          if (existingBucket.expiresAt <= timestamp) rate.delete(existingKey);
        }
        if (rate.size >= maxRateBuckets - 1) key = RATE_LIMIT_OVERFLOW_KEY;
        bucket = rate.get(key);
      }
    }
    if (!bucket || bucket.expiresAt <= timestamp) {
      bucket = { count: 0, expiresAt: timestamp + rateWindowMs };
      rate.set(key, bucket);
    }
    bucket.count += 1;
    return bucket.count > rateLimit ? Math.max(1, Math.ceil((bucket.expiresAt - timestamp) / 1000)) : 0;
  };

  const server = createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    const method = request.method ?? '';
    if (method !== 'GET' && method !== 'HEAD') {
      response.setHeader('Allow', 'GET, HEAD');
      response.writeHead(405).end('Method not allowed\n');
      return;
    }
    const requestTarget = request.url ?? '';
    if (!requestTarget.startsWith('/') || requestTarget.startsWith('//')) {
      response.writeHead(404).end('Image not found\n');
      return;
    }
    const separator = requestTarget.indexOf('?');
    const pathname = separator >= 0 ? requestTarget.slice(0, separator) : requestTarget;
    if (separator >= 0 || requestTarget.includes('#')) {
      response.writeHead(404).end('Image not found\n');
      return;
    }
    const match = /^\/media\/([a-f0-9]{32})\/(thumb|profile)$/.exec(pathname);
    if (!match) {
      response.writeHead(404).end('Image not found\n');
      return;
    }
    const [, id, variantName] = match;
    if (!ID_PATTERN.test(id) || !VARIANT_PATTERN.test(variantName)) {
      response.writeHead(404).end('Image not found\n');
      return;
    }
    const item = mediaById.get(id);
    if (!item || !item.variants[variantName]) {
      response.writeHead(404).end('Image not found\n');
      return;
    }
    const retryAfter = rateLimited(publicClientAddress(request));
    if (retryAfter) {
      response.setHeader('Retry-After', String(retryAfter));
      response.writeHead(429).end('Image rate limit exceeded\n');
      return;
    }
    const key = `${id}:${variantName}`;
    const cached = getCached(key);
    const serve = (entry) => {
      if (response.destroyed || response.writableEnded) return;
      const etag = entry.etag;
      const ifNoneMatch = request.headers['if-none-match'];
      response.setHeader('Content-Type', entry.contentType);
      response.setHeader('Content-Length', String(entry.body.byteLength));
      response.setHeader('Cache-Control', 'public, max-age=60');
      response.setHeader('ETag', etag);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      if (ifNoneMatch === etag || ifNoneMatch === '*') {
        response.writeHead(304).end();
        return;
      }
      response.writeHead(200);
      if (method === 'HEAD') response.end();
      else response.end(entry.body);
    };
    if (cached) {
      serve(cached);
      return;
    }
    if (inFlight >= maxConcurrent) {
      response.writeHead(503, { 'Retry-After': '2' }).end('Image service is busy\n');
      return;
    }
    inFlight += 1;
    (async () => {
      try {
        const image = await fetchApprovedImage(item, variantName, dependencies);
        const entry = {
          body: image.body,
          contentType: image.contentType,
          etag: `"${createHash('sha256').update(image.body).digest('hex')}"`,
        };
        setCached(key, entry);
        serve(entry);
      } catch (error) {
        const statusCode = error instanceof RelayError && error.statusCode >= 400 && error.statusCode < 600
          ? error.statusCode
          : 502;
        if (response.destroyed || response.writableEnded) return;
        response.removeHeader('Cache-Control');
        response.setHeader('Cache-Control', 'no-store');
        response.writeHead(statusCode).end('Image unavailable\n');
      } finally {
        inFlight -= 1;
      }
    })();
  });
  server.keepAliveTimeout = 5000;
  server.headersTimeout = 8000;
  return server;
}

async function start() {
  const manifestPath = process.env.ATLAS_MEDIA_MANIFEST
    ?? new URL('./approved-media-v1.json', import.meta.url);
  const manifestText = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestText);
  validateApprovedMediaManifest(manifest);
  const host = process.env.ATLAS_MEDIA_HOST ?? RELAY_HOST;
  const port = Number(process.env.ATLAS_MEDIA_PORT ?? RELAY_PORT);
  if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Atlas media relay must bind to 127.0.0.1 and a valid TCP port');
  }
  const server = createMediaRelayServer({ manifest });
  server.listen(port, host, () => process.stdout.write(`Atlas media relay listening on ${host}:${port}\n`));
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

const invokedPath = process.argv[1] ? pathToFileURL(realpathSync(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  start().catch(() => {
    process.stderr.write('Atlas media relay could not start; check its allowlist and service configuration.\n');
    process.exitCode = 1;
  });
}
