/**
 * Cursor Pagination Tests
 * 
 * Phase 10.2 - Task 1.3
 * 
 * Unit tests for cursor pagination utilities.
 */

import {
  encodeCursor,
  decodeCursor,
  createCursorFromRecord,
  buildCursorWhereClause,
  buildCursorOrderByClause,
  buildPaginationQueryParts,
  processPaginatedResults,
  validateLimit,
  isValidCursorFormat,
  CursorValidationError,
  CursorData,
} from '../cursor-pagination';

describe('Cursor Pagination', () => {
  describe('encodeCursor / decodeCursor', () => {
    it('should encode and decode cursor correctly', () => {
      const data: CursorData = {
        createdAt: '2026-02-03T10:00:00.000Z',
        id: '123e4567-e89b-12d3-a456-426614174000',
      };
      
      const encoded = encodeCursor(data);
      const decoded = decodeCursor(encoded);
      
      expect(decoded.createdAt.toISOString()).toBe(data.createdAt);
      expect(decoded.id).toBe(data.id);
    });

    it('should produce URL-safe base64url encoding', () => {
      const data: CursorData = {
        createdAt: '2026-02-03T10:00:00.000Z',
        id: '123e4567-e89b-12d3-a456-426614174000',
      };
      
      const encoded = encodeCursor(data);
      
      // Should not contain +, /, or = (standard base64 chars)
      expect(encoded).not.toMatch(/[+/=]/);
      // Should only contain base64url chars
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should throw CursorValidationError for invalid cursor', () => {
      expect(() => decodeCursor('invalid-cursor')).toThrow(CursorValidationError);
    });

    it('should throw CursorValidationError for missing fields', () => {
      const invalidData = Buffer.from(JSON.stringify({ id: 'test' })).toString('base64url');
      expect(() => decodeCursor(invalidData)).toThrow(CursorValidationError);
    });

    it('should throw CursorValidationError for invalid date', () => {
      const invalidData = Buffer.from(JSON.stringify({
        createdAt: 'not-a-date',
        id: 'test',
      })).toString('base64url');
      expect(() => decodeCursor(invalidData)).toThrow(CursorValidationError);
    });
  });

  describe('createCursorFromRecord', () => {
    it('should create cursor from record with Date object', () => {
      const record = {
        createdAt: new Date('2026-02-03T10:00:00.000Z'),
        id: '123e4567-e89b-12d3-a456-426614174000',
      };
      
      const cursor = createCursorFromRecord(record);
      const decoded = decodeCursor(cursor);
      
      expect(decoded.createdAt.toISOString()).toBe(record.createdAt.toISOString());
      expect(decoded.id).toBe(record.id);
    });
  });

  describe('buildCursorWhereClause', () => {
    it('should return empty clause for null cursor', () => {
      const result = buildCursorWhereClause(null);
      
      expect(result.clause).toBe('');
      expect(result.params).toEqual([]);
    });

    it('should build correct WHERE clause with cursor', () => {
      const cursor = {
        createdAt: new Date('2026-02-03T10:00:00.000Z'),
        id: '123e4567-e89b-12d3-a456-426614174000',
      };
      
      const result = buildCursorWhereClause(cursor);
      
      expect(result.clause).toBe('AND (created_at, id) < ($1, $2)');
      expect(result.params).toEqual([cursor.createdAt, cursor.id]);
    });

    it('should use correct param offset', () => {
      const cursor = {
        createdAt: new Date('2026-02-03T10:00:00.000Z'),
        id: '123e4567-e89b-12d3-a456-426614174000',
      };
      
      const result = buildCursorWhereClause(cursor, 5);
      
      expect(result.clause).toBe('AND (created_at, id) < ($5, $6)');
    });
  });

  describe('buildCursorOrderByClause', () => {
    it('should return correct ORDER BY clause', () => {
      const clause = buildCursorOrderByClause();
      expect(clause).toBe('ORDER BY created_at DESC, id DESC');
    });
  });

  describe('buildPaginationQueryParts', () => {
    it('should build parts for first page (no cursor)', () => {
      const result = buildPaginationQueryParts({ limit: 10 });
      
      expect(result.whereClause).toBe('');
      expect(result.orderByClause).toBe('ORDER BY created_at DESC, id DESC');
      expect(result.limitClause).toBe('LIMIT $1');
      expect(result.params).toEqual([11]); // limit + 1 for hasMore check
    });

    it('should build parts with cursor', () => {
      const cursor = encodeCursor({
        createdAt: '2026-02-03T10:00:00.000Z',
        id: '123e4567-e89b-12d3-a456-426614174000',
      });
      
      const result = buildPaginationQueryParts({ cursor, limit: 10 });
      
      expect(result.whereClause).toBe('AND (created_at, id) < ($1, $2)');
      expect(result.limitClause).toBe('LIMIT $3');
      expect(result.params.length).toBe(3);
      expect(result.params[2]).toBe(11); // limit + 1
    });

    it('should use correct base param offset', () => {
      const result = buildPaginationQueryParts({ limit: 10 }, 3);
      
      expect(result.limitClause).toBe('LIMIT $3');
    });
  });

  describe('processPaginatedResults', () => {
    const createRecord = (id: string, minutesAgo: number) => ({
      id,
      createdAt: new Date(Date.now() - minutesAgo * 60 * 1000),
      data: `record-${id}`,
    });

    it('should return all items when less than limit', () => {
      const records = [
        createRecord('1', 1),
        createRecord('2', 2),
      ];
      
      const result = processPaginatedResults(records, 10);
      
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should return hasMore=true when more items exist', () => {
      const records = [
        createRecord('1', 1),
        createRecord('2', 2),
        createRecord('3', 3), // Extra item indicating more pages
      ];
      
      const result = processPaginatedResults(records, 2);
      
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it('should create cursor from last item', () => {
      const records = [
        createRecord('1', 1),
        createRecord('2', 2),
        createRecord('3', 3),
      ];
      
      const result = processPaginatedResults(records, 2);
      
      // Decode cursor and verify it points to last returned item
      const decoded = decodeCursor(result.nextCursor!);
      expect(decoded.id).toBe('2');
    });

    it('should handle empty results', () => {
      const result = processPaginatedResults([], 10);
      
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('should handle exactly limit items (no more pages)', () => {
      const records = [
        createRecord('1', 1),
        createRecord('2', 2),
      ];
      
      const result = processPaginatedResults(records, 2);
      
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('validateLimit', () => {
    it('should return default for invalid input', () => {
      expect(validateLimit(NaN)).toBe(20);
      expect(validateLimit(undefined as any)).toBe(20);
    });

    it('should clamp to minimum of 1', () => {
      expect(validateLimit(0)).toBe(1);
      expect(validateLimit(-5)).toBe(1);
    });

    it('should clamp to maximum', () => {
      expect(validateLimit(200)).toBe(100);
      expect(validateLimit(150, 50)).toBe(50);
    });

    it('should floor decimal values', () => {
      expect(validateLimit(10.7)).toBe(10);
    });

    it('should pass through valid values', () => {
      expect(validateLimit(50)).toBe(50);
    });
  });

  describe('isValidCursorFormat', () => {
    it('should return true for null/undefined', () => {
      expect(isValidCursorFormat(null)).toBe(true);
      expect(isValidCursorFormat(undefined)).toBe(true);
    });

    it('should return true for valid base64url', () => {
      const cursor = encodeCursor({
        createdAt: '2026-02-03T10:00:00.000Z',
        id: 'test-id',
      });
      expect(isValidCursorFormat(cursor)).toBe(true);
    });

    it('should return false for invalid characters', () => {
      expect(isValidCursorFormat('invalid+cursor')).toBe(false);
      expect(isValidCursorFormat('invalid/cursor')).toBe(false);
      expect(isValidCursorFormat('invalid=cursor')).toBe(false);
    });
  });

  // ==========================================================================
  // Tie-Breaker Test - Phase A Determinism Proof
  // ==========================================================================
  
  describe('cursor tie-breaker determinism', () => {
    /**
     * CRITICAL TEST: Proves pagination is deterministic when multiple records
     * have the same created_at timestamp.
     * 
     * ORDER BY: created_at DESC, id DESC
     * Same created_at → id DESC: ccc > bbb > aaa
     * 
     * This test validates the tie-breaker contract.
     */
    it('should handle same created_at with id tie-breaker (id DESC)', () => {
      const sameTime = new Date('2026-02-03T10:00:00.000Z');
      
      // Records with identical created_at - only id differs
      const records = [
        { id: 'aaa', createdAt: sameTime },
        { id: 'bbb', createdAt: sameTime },
        { id: 'ccc', createdAt: sameTime },
      ];
      
      // Simulate DB ordering: ORDER BY created_at DESC, id DESC
      // Same created_at → sort by id DESC: ccc, bbb, aaa
      const ordered = [...records].sort((a, b) => {
        // First by createdAt DESC
        const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
        if (timeDiff !== 0) return timeDiff;
        // Then by id DESC (string comparison)
        return b.id.localeCompare(a.id);
      });
      
      // Verify ordering is deterministic
      expect(ordered.map(r => r.id)).toEqual(['ccc', 'bbb', 'aaa']);
      
      // Page 1: limit=2, should get ccc, bbb
      const page1 = processPaginatedResults(
        ordered.slice(0, 3), // DB returns limit+1 = 3 items
        2
      );
      expect(page1.items.map(r => r.id)).toEqual(['ccc', 'bbb']);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();
      
      // Verify cursor points to last item of page 1 (bbb)
      const cursor1 = decodeCursor(page1.nextCursor!);
      expect(cursor1.id).toBe('bbb');
      expect(cursor1.createdAt.toISOString()).toBe(sameTime.toISOString());
      
      // Page 2: After cursor (bbb), should get aaa only
      // Simulating: WHERE (created_at, id) < (sameTime, 'bbb')
      // With same created_at, only 'aaa' < 'bbb' in id DESC ordering
      const afterCursor = ordered.filter(r => {
        if (r.createdAt < cursor1.createdAt) return true;
        if (r.createdAt.getTime() === cursor1.createdAt.getTime()) {
          return r.id < cursor1.id; // id comparison for tie-breaker
        }
        return false;
      });
      
      expect(afterCursor.map(r => r.id)).toEqual(['aaa']);
      
      const page2 = processPaginatedResults(afterCursor, 2);
      expect(page2.items.map(r => r.id)).toEqual(['aaa']);
      expect(page2.hasMore).toBe(false);
      expect(page2.nextCursor).toBeNull();
    });

    it('should maintain determinism across mixed timestamps with tie-breaker', () => {
      const time1 = new Date('2026-02-03T10:00:00.000Z');
      const time2 = new Date('2026-02-03T09:00:00.000Z'); // 1 hour earlier
      
      const records = [
        { id: 'aaa', createdAt: time1 },
        { id: 'bbb', createdAt: time1 }, // Same as aaa
        { id: 'ccc', createdAt: time2 }, // Earlier time
        { id: 'ddd', createdAt: time2 }, // Same as ccc
      ];
      
      // ORDER BY created_at DESC, id DESC
      const ordered = [...records].sort((a, b) => {
        const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      });
      
      // Expected: bbb (time1), aaa (time1), ddd (time2), ccc (time2)
      expect(ordered.map(r => r.id)).toEqual(['bbb', 'aaa', 'ddd', 'ccc']);
      
      // Page through with limit=2
      const page1 = processPaginatedResults(ordered.slice(0, 3), 2);
      expect(page1.items.map(r => r.id)).toEqual(['bbb', 'aaa']);
      expect(page1.hasMore).toBe(true);
      
      // Cursor points to 'aaa' at time1
      const cursor1 = decodeCursor(page1.nextCursor!);
      expect(cursor1.id).toBe('aaa');
    });
  });
});
