/**
 * Request Hasher
 * 
 * Deterministic hash generation for idempotency.
 * Same input → same hash (stable canonicalization).
 */

/**
 * Generate deterministic hash for request.
 * Uses stable JSON canonicalization.
 */
export function generateRequestHash(request: Record<string, unknown>): string {
  const canonical = canonicalize(request);
  return hashString(canonical);
}

/**
 * Canonicalize object for hashing.
 * - Sorts keys alphabetically
 * - Removes undefined values
 * - Handles nested objects
 */
function canonicalize(obj: unknown): string {
  if (obj === null) return 'null';
  if (obj === undefined) return '';
  
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'boolean') return String(obj);
  
  if (Array.isArray(obj)) {
    const items = obj.map(item => canonicalize(item));
    return `[${items.join(',')}]`;
  }
  
  if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>)
      .filter(([, v]) => v !== undefined) // Remove undefined
      .sort(([a], [b]) => a.localeCompare(b)) // Sort keys
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`);
    return `{${entries.join(',')}}`;
  }
  
  return String(obj);
}

/**
 * Simple hash function (djb2).
 * Returns hex string.
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  // Convert to unsigned 32-bit and then to hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Validate that hash is deterministic.
 * Same input should always produce same output.
 */
export function validateHashDeterminism(request: Record<string, unknown>): boolean {
  const hash1 = generateRequestHash(request);
  const hash2 = generateRequestHash(request);
  const hash3 = generateRequestHash({ ...request }); // Shallow copy
  
  return hash1 === hash2 && hash2 === hash3;
}
