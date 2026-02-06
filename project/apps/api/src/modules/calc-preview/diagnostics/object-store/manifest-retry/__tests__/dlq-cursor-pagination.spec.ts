/**
 * DLQ Cursor Pagination Tests
 * 
 * Phase 10.2 - Task 4.5
 * 
 * Tests for cursor-based pagination on DLQ endpoint.
 * 
 * Key invariants tested:
 * 1. No duplicates across paginated pages
 * 2. Stable order during concurrent inserts
 * 3. Cursor validation (INVALID_CURSOR error)
 * 4. Status allowlist validation
 * 5. Limit clamping
 */

import {
  decodeCursor,
  encodeCursor,
  createCursorFromRecord,
  CursorValidationError,
  validateLimit,
} from '../cursor-pagination';
import {
  DLQ_STATUS_ALLOWLIST,
} from '../manifest-admin.dto';

describe('DLQ Cursor Pagination', () => {
  // ==========================================================================
  // Cursor Encoding/Decoding Tests
  // ==========================================================================
  
  describe('decodeCursor', () => {
    it('should decode valid cursor', () => {
      const original = {
        createdAt: '2026-02-03T10:00:00.000Z',
        id: 'dlq-001',
      };
      const encoded = encodeCursor(original);
      const decoded = decodeCursor(encoded);
      
      expect(decoded.id).toBe('dlq-001');
      expect(decoded.createdAt.toISOString()).toBe('2026-02-03T10:00:00.000Z');
    });
    
    it('should throw INVALID_CURSOR for malformed base64', () => {
      expect(() => decodeCursor('not-valid-base64!!!')).toThrow(CursorValidationError);
    });
    
    it('should throw INVALID_CURSOR for invalid JSON', () => {
      const invalidJson = Buffer.from('not json', 'utf-8').toString('base64url');
      expect(() => decodeCursor(invalidJson)).toThrow(CursorValidationError);
    });
    
    it('should throw INVALID_CURSOR for missing createdAt', () => {
      const missingCreatedAt = Buffer.from(JSON.stringify({ id: 'test' }), 'utf-8').toString('base64url');
      expect(() => decodeCursor(missingCreatedAt)).toThrow(CursorValidationError);
    });
    
    it('should throw INVALID_CURSOR for missing id', () => {
      const missingId = Buffer.from(JSON.stringify({ createdAt: '2026-02-03T10:00:00.000Z' }), 'utf-8').toString('base64url');
      expect(() => decodeCursor(missingId)).toThrow(CursorValidationError);
    });
    
    it('should throw INVALID_CURSOR for empty id', () => {
      const emptyId = Buffer.from(JSON.stringify({ createdAt: '2026-02-03T10:00:00.000Z', id: '' }), 'utf-8').toString('base64url');
      expect(() => decodeCursor(emptyId)).toThrow(CursorValidationError);
    });
    
    it('should throw INVALID_CURSOR for invalid date', () => {
      const invalidDate = Buffer.from(JSON.stringify({ createdAt: 'not-a-date', id: 'test' }), 'utf-8').toString('base64url');
      expect(() => decodeCursor(invalidDate)).toThrow(CursorValidationError);
    });
    
    it('should throw INVALID_CURSOR for empty string', () => {
      expect(() => decodeCursor('')).toThrow(CursorValidationError);
    });
  });
  
  // ==========================================================================
  // Limit Validation Tests
  // ==========================================================================
  
  describe('validateLimit', () => {
    it('should return default for undefined', () => {
      expect(validateLimit(undefined)).toBe(50);
    });
    
    it('should return default for null', () => {
      expect(validateLimit(null)).toBe(50);
    });
    
    it('should return default for NaN', () => {
      expect(validateLimit(NaN)).toBe(50);
    });
    
    it('should clamp to max (200)', () => {
      expect(validateLimit(500)).toBe(200);
      expect(validateLimit(201)).toBe(200);
    });
    
    it('should clamp to min (1)', () => {
      expect(validateLimit(0)).toBe(1);
      expect(validateLimit(-5)).toBe(1);
    });
    
    it('should floor decimal values', () => {
      expect(validateLimit(10.9)).toBe(10);
      expect(validateLimit(10.1)).toBe(10);
    });
    
    it('should accept valid values', () => {
      expect(validateLimit(50)).toBe(50);
      expect(validateLimit(100)).toBe(100);
      expect(validateLimit(200)).toBe(200);
    });
  });
  
  // ==========================================================================
  // Status Allowlist Tests
  // ==========================================================================
  
  describe('DLQ Status Allowlist', () => {
    it('should contain all valid DLQ statuses', () => {
      expect(DLQ_STATUS_ALLOWLIST).toContain('DLQ_OPEN');
      expect(DLQ_STATUS_ALLOWLIST).toContain('DLQ_RESOLVED');
      expect(DLQ_STATUS_ALLOWLIST).toContain('DLQ_REDROVE');
    });
    
    it('should have exactly 3 statuses', () => {
      expect(DLQ_STATUS_ALLOWLIST.length).toBe(3);
    });
  });
  
  // ==========================================================================
  // Pagination Invariant Tests
  // ==========================================================================
  
  describe('Pagination Invariants', () => {
    /**
     * Test: should_return_no_duplicates_across_paginated_pages
     * 
     * Assertion summary:
     * - Create 10 mock DLQ entries with distinct (created_at, id) tuples
     * - Paginate with limit=3
     * - Collect all IDs across all pages
     * - Assert: Set(allIds).size === allIds.length (no duplicates)
     * - Assert: allIds.length === 10 (all items returned)
     */
    it('should_return_no_duplicates_across_paginated_pages', () => {
      // Simulate 10 entries
      const entries = Array.from({ length: 10 }, (_, i) => ({
        id: `dlq-${String(i).padStart(3, '0')}`,
        createdAt: new Date(Date.now() - i * 1000), // Descending order
      }));
      
      // Simulate pagination with limit=3
      const limit = 3;
      const allIds: string[] = [];
      let cursor: string | null = null;
      let pageCount = 0;
      
      while (pageCount < 10) { // Safety limit
        // Filter by cursor
        let pageEntries = entries;
        if (cursor) {
          const decoded = decodeCursor(cursor);
          pageEntries = entries.filter(e => 
            e.createdAt < decoded.createdAt || 
            (e.createdAt.getTime() === decoded.createdAt.getTime() && e.id < decoded.id)
          );
        }
        
        // Take limit + 1 to check hasMore
        const slice = pageEntries.slice(0, limit + 1);
        const hasMore = slice.length > limit;
        const items = hasMore ? slice.slice(0, limit) : slice;
        
        // Collect IDs
        allIds.push(...items.map(e => e.id));
        
        // Generate next cursor
        if (hasMore && items.length > 0) {
          cursor = createCursorFromRecord(items[items.length - 1]);
        } else {
          break;
        }
        
        pageCount++;
      }
      
      // Assert no duplicates
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
      
      // Assert all items returned
      expect(allIds.length).toBe(10);
    });
    
    /**
     * Test: should_maintain_stable_order_during_concurrent_inserts
     * 
     * Assertion summary:
     * - Create 5 entries
     * - Get first page (limit=2)
     * - Insert new entry with newer timestamp
     * - Get second page with cursor
     * - Assert: new entry NOT in second page (cursor excludes newer records)
     * - Assert: order is stable (descending by created_at, id)
     */
    it('should_maintain_stable_order_during_concurrent_inserts', () => {
      // Initial 5 entries (descending order)
      const entries = [
        { id: 'dlq-005', createdAt: new Date('2026-02-03T10:05:00.000Z') },
        { id: 'dlq-004', createdAt: new Date('2026-02-03T10:04:00.000Z') },
        { id: 'dlq-003', createdAt: new Date('2026-02-03T10:03:00.000Z') },
        { id: 'dlq-002', createdAt: new Date('2026-02-03T10:02:00.000Z') },
        { id: 'dlq-001', createdAt: new Date('2026-02-03T10:01:00.000Z') },
      ];
      
      // First page (limit=2)
      const firstPage = entries.slice(0, 2);
      expect(firstPage.map(e => e.id)).toEqual(['dlq-005', 'dlq-004']);
      
      // Generate cursor from last item of first page
      const cursor = createCursorFromRecord(firstPage[1]);
      
      // Simulate concurrent insert (newer timestamp)
      const newEntry = { id: 'dlq-006', createdAt: new Date('2026-02-03T10:06:00.000Z') };
      const updatedEntries = [newEntry, ...entries];
      
      // Second page with cursor
      const decoded = decodeCursor(cursor);
      const secondPageEntries = updatedEntries.filter(e => 
        e.createdAt < decoded.createdAt || 
        (e.createdAt.getTime() === decoded.createdAt.getTime() && e.id < decoded.id)
      );
      const secondPage = secondPageEntries.slice(0, 2);
      
      // Assert: new entry NOT in second page
      expect(secondPage.map(e => e.id)).not.toContain('dlq-006');
      
      // Assert: correct items in second page
      expect(secondPage.map(e => e.id)).toEqual(['dlq-003', 'dlq-002']);
    });
    
    /**
     * Test: should_handle_same_timestamp_with_id_tiebreaker
     * 
     * Assertion summary:
     * - Create entries with same timestamp but different IDs
     * - Paginate and verify deterministic order by ID
     */
    it('should_handle_same_timestamp_with_id_tiebreaker', () => {
      const sameTimestamp = new Date('2026-02-03T10:00:00.000Z');
      
      // Entries with same timestamp, different IDs (sorted DESC by id)
      const entries = [
        { id: 'dlq-ccc', createdAt: sameTimestamp },
        { id: 'dlq-bbb', createdAt: sameTimestamp },
        { id: 'dlq-aaa', createdAt: sameTimestamp },
      ];
      
      // First page (limit=1)
      const firstPage = entries.slice(0, 1);
      expect(firstPage[0].id).toBe('dlq-ccc');
      
      // Cursor from first page
      const cursor = createCursorFromRecord(firstPage[0]);
      const decoded = decodeCursor(cursor);
      
      // Second page: filter by (created_at, id) < (cursor_created_at, cursor_id)
      // Since timestamps are equal, filter by id < 'dlq-ccc'
      const secondPageEntries = entries.filter(e => 
        e.createdAt < decoded.createdAt || 
        (e.createdAt.getTime() === decoded.createdAt.getTime() && e.id < decoded.id)
      );
      
      // Should get dlq-bbb next (alphabetically before dlq-ccc)
      expect(secondPageEntries[0].id).toBe('dlq-bbb');
    });
  });
});
