/**
 * Cursor Pagination Utilities
 * 
 * Phase 10.2 - Task 1.3
 * 
 * Implements cursor-based pagination for admin API endpoints.
 * 
 * CURSOR CONTRACT:
 * - Cursor is based on stable ordering key: (created_at, id) tuple
 * - Encoded as base64url for URL safety
 * - Provides stable pagination even during concurrent modifications
 * 
 * BEHAVIOR DURING CONCURRENT MODIFICATIONS:
 * - Insertions: New records with created_at > cursor won't appear in current pagination
 * - Deletions: Deleted records simply won't appear; no gaps in results
 * - Updates: Status changes may cause records to appear/disappear from filtered results
 * 
 * @see .kiro/specs/phase-10-2-production-hardening/design.md
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Cursor data structure
 * Uses (created_at, id) tuple for stable ordering
 */
export interface CursorData {
  /** ISO timestamp of the record */
  createdAt: string;
  /** UUID of the record */
  id: string;
}

/**
 * Paginated query options with cursor support
 */
export interface CursorPaginationOptions {
  /** Cursor from previous page (null for first page) */
  cursor?: string | null;
  /** Maximum number of records to return */
  limit: number;
}

/**
 * Paginated query result with cursor
 */
export interface CursorPaginatedResult<T> {
  /** Records for this page */
  items: T[];
  /** Cursor for next page (null if no more pages) */
  nextCursor: string | null;
  /** Whether there are more pages */
  hasMore: boolean;
}

/**
 * Decoded cursor for SQL query
 */
export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

// ============================================================================
// Cursor Encoding/Decoding
// ============================================================================

/**
 * Encode cursor data to base64url string
 * 
 * @param data - Cursor data with createdAt and id
 * @returns Base64url encoded cursor string
 */
export function encodeCursor(data: CursorData): string {
  const json = JSON.stringify(data);
  return Buffer.from(json, 'utf-8').toString('base64url');
}

/**
 * Decode cursor string to cursor data
 * 
 * Validates:
 * - Base64url format
 * - JSON structure
 * - Required fields: createdAt, id
 * - Date parsability
 * - Non-empty id
 * 
 * @param cursor - Base64url encoded cursor string
 * @returns Decoded cursor data
 * @throws CursorValidationError if cursor is invalid (400 INVALID_CURSOR)
 */
export function decodeCursor(cursor: string): DecodedCursor {
  // Basic format check first
  if (!cursor || typeof cursor !== 'string') {
    throw new CursorValidationError('Cursor is required');
  }
  
  // Base64url format validation
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;
  if (!base64urlRegex.test(cursor)) {
    throw new CursorValidationError('Invalid cursor encoding');
  }
  
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    
    // Parse JSON
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch {
      throw new CursorValidationError('Invalid cursor JSON');
    }
    
    // Type guard
    if (!data || typeof data !== 'object') {
      throw new CursorValidationError('Invalid cursor structure');
    }
    
    const cursorData = data as Record<string, unknown>;
    
    // Validate required fields
    if (!cursorData.createdAt || typeof cursorData.createdAt !== 'string') {
      throw new CursorValidationError('Missing or invalid createdAt in cursor');
    }
    
    if (!cursorData.id || typeof cursorData.id !== 'string' || cursorData.id.trim() === '') {
      throw new CursorValidationError('Missing or invalid id in cursor');
    }
    
    // Parse and validate date
    const createdAt = new Date(cursorData.createdAt);
    if (isNaN(createdAt.getTime())) {
      throw new CursorValidationError('Invalid date format in cursor');
    }
    
    return {
      createdAt,
      id: cursorData.id,
    };
  } catch (error) {
    if (error instanceof CursorValidationError) {
      throw error;
    }
    throw new CursorValidationError(
      `Invalid cursor format: ${error instanceof Error ? error.message : 'unknown error'}`
    );
  }
}

/**
 * Create cursor from a record
 * 
 * @param record - Record with createdAt and id fields
 * @returns Encoded cursor string
 */
export function createCursorFromRecord(record: { createdAt: Date; id: string }): string {
  return encodeCursor({
    createdAt: record.createdAt.toISOString(),
    id: record.id,
  });
}

// ============================================================================
// SQL Query Helpers
// ============================================================================

/**
 * Build WHERE clause for cursor pagination
 * 
 * Uses (created_at, id) < ($cursor_created_at, $cursor_id) for stable ordering
 * 
 * @param cursor - Decoded cursor (null for first page)
 * @param paramOffset - Starting parameter index (for $1, $2, etc.)
 * @returns Object with SQL clause and parameter values
 */
export function buildCursorWhereClause(
  cursor: DecodedCursor | null,
  paramOffset: number = 1
): { clause: string; params: unknown[] } {
  if (!cursor) {
    return { clause: '', params: [] };
  }
  
  // Use tuple comparison for stable ordering
  // (created_at, id) < ($cursor_created_at, $cursor_id)
  return {
    clause: `AND (created_at, id) < ($${paramOffset}, $${paramOffset + 1})`,
    params: [cursor.createdAt, cursor.id],
  };
}

/**
 * Build ORDER BY clause for cursor pagination
 * 
 * Always orders by (created_at DESC, id DESC) for stable pagination
 * 
 * @returns SQL ORDER BY clause
 */
export function buildCursorOrderByClause(): string {
  return 'ORDER BY created_at DESC, id DESC';
}

/**
 * Build complete pagination query parts
 * 
 * @param options - Pagination options
 * @param baseParamOffset - Starting parameter index
 * @returns Object with WHERE clause, ORDER BY clause, LIMIT clause, and params
 */
export function buildPaginationQueryParts(
  options: CursorPaginationOptions,
  baseParamOffset: number = 1
): {
  whereClause: string;
  orderByClause: string;
  limitClause: string;
  params: unknown[];
  limitParamIndex: number;
} {
  const cursor = options.cursor ? decodeCursor(options.cursor) : null;
  const { clause: whereClause, params: cursorParams } = buildCursorWhereClause(
    cursor,
    baseParamOffset
  );
  
  const limitParamIndex = baseParamOffset + cursorParams.length;
  
  return {
    whereClause,
    orderByClause: buildCursorOrderByClause(),
    limitClause: `LIMIT $${limitParamIndex}`,
    params: [...cursorParams, options.limit + 1], // +1 to check for more pages
    limitParamIndex,
  };
}

/**
 * Process query results for cursor pagination
 * 
 * @param results - Query results (should have limit + 1 items if more pages exist)
 * @param limit - Requested limit
 * @returns Paginated result with items, nextCursor, and hasMore
 */
export function processPaginatedResults<T extends { createdAt: Date; id: string }>(
  results: T[],
  limit: number
): CursorPaginatedResult<T> {
  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;
  
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem ? createCursorFromRecord(lastItem) : null;
  
  return {
    items,
    nextCursor,
    hasMore,
  };
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Error thrown when cursor validation fails
 */
export class CursorValidationError extends Error {
  readonly code = 'INVALID_CURSOR';
  
  constructor(message: string) {
    super(message);
    this.name = 'CursorValidationError';
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate and clamp pagination limit
 * 
 * Strategy: Silent clamp (ops-friendly)
 * - Invalid/missing → default (50)
 * - Below 1 → 1
 * - Above max → max
 * 
 * @param limit - Requested limit (may be undefined/NaN)
 * @param defaultLimit - Default limit (default: 50)
 * @param maxLimit - Maximum allowed limit (default: 200)
 * @returns Validated limit (clamped to range [1, maxLimit])
 */
export function validateLimit(
  limit: number | undefined | null,
  defaultLimit: number = 50,
  maxLimit: number = 200,
): number {
  if (limit === undefined || limit === null || typeof limit !== 'number' || isNaN(limit)) {
    return defaultLimit;
  }
  return Math.min(Math.max(1, Math.floor(limit)), maxLimit);
}

/**
 * Validate cursor string (basic format check)
 * 
 * @param cursor - Cursor string to validate
 * @returns true if cursor appears valid, false otherwise
 */
export function isValidCursorFormat(cursor: string | null | undefined): boolean {
  if (!cursor) return true; // null/undefined is valid (first page)
  
  // Basic format check: should be base64url encoded
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;
  return base64urlRegex.test(cursor);
}
