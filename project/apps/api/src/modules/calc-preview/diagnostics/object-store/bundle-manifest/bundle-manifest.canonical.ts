/**
 * Phase 9C Task 3 - Canonical JSON Serialization
 * 
 * Deterministic JSON serialization for manifest hash computation.
 * 
 * RULES:
 * 1. Object keys sorted alphabetically (lexicographic ASCII)
 * 2. No whitespace (minified)
 * 3. Arrays preserve order
 * 4. Recursive for nested objects
 * 5. UTF-8 encoding
 */

/**
 * Recursively sorts object keys alphabetically.
 * Arrays are preserved as-is (order matters for objects array).
 */
function sortObjectKeys(value: unknown): unknown {
  // Null
  if (value === null) {
    return null;
  }
  
  // Array - preserve order, but sort nested objects
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }
  
  // Object - sort keys
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    
    for (const key of keys) {
      sorted[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
    }
    
    return sorted;
  }
  
  // Primitives (string, number, boolean)
  return value;
}

/**
 * Serializes value to canonical JSON string.
 * 
 * - Object keys sorted alphabetically
 * - No whitespace
 * - Deterministic output
 * 
 * @param value - Value to serialize
 * @returns Canonical JSON string
 */
export function canonicalStringify(value: unknown): string {
  const sorted = sortObjectKeys(value);
  return JSON.stringify(sorted);
}

/**
 * Parses JSON and returns with sorted keys.
 * Useful for normalizing JSON before comparison.
 * 
 * @param json - JSON string to parse
 * @returns Parsed value with sorted keys
 */
export function parseAndSort(json: string): unknown {
  const parsed = JSON.parse(json);
  return sortObjectKeys(parsed);
}

/**
 * Compares two values for canonical equality.
 * 
 * @param a - First value
 * @param b - Second value
 * @returns true if canonically equal
 */
export function canonicalEquals(a: unknown, b: unknown): boolean {
  return canonicalStringify(a) === canonicalStringify(b);
}
