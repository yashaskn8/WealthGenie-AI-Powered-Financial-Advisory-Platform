/**
 * WealthGenie — Key Case Converter Utility (WG-012)
 * ──────────────────────────────────────────────────
 * Canonical single source of truth for recursively converting object keys
 * between snake_case and camelCase across API boundaries.
 */

function camelCaseString(str) {
  return str.replace(/_([a-z0-9])/gi, (_, letter) => letter.toUpperCase());
}

function snakeCaseString(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function toCamelCase(obj) {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date || obj instanceof RegExp) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(toCamelCase);
  }
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = camelCaseString(key);
    result[camelKey] = toCamelCase(value);
  }
  return result;
}

export function toSnakeCase(obj) {
  if (obj === null || typeof obj !== 'object' || obj instanceof Date || obj instanceof RegExp) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase);
  }
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = snakeCaseString(key);
    result[snakeKey] = toSnakeCase(value);
  }
  return result;
}
