import crypto from 'node:crypto';

function normalize(value, { inArray = false } = {}) {
  if (value === undefined) return inArray ? null : undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical JSON cannot encode non-finite numbers');
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');

  if (Array.isArray(value)) {
    return value.map(item => normalize(item, { inArray: true }));
  }

  if (value instanceof Map) {
    value = Object.fromEntries(value.entries());
  }

  if (typeof value?.toHexString === 'function') {
    return value.toHexString();
  }

  if (typeof value === 'object') {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      const child = normalize(value[key]);
      if (child !== undefined) normalized[key] = child;
    }
    return normalized;
  }

  throw new TypeError(`Canonical JSON cannot encode values of type ${typeof value}`);
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

export function canonicalSha256(value) {
  return crypto.createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

