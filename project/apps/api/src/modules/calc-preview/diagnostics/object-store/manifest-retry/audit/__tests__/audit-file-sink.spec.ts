/**
 * Audit File Sink Tests
 * 
 * Phase 10.2 - Task 2.1
 * 
 * Tests for file rotation and JSONL writing.
 */

import { AuditFileSink } from '../audit-file-sink';
import { AuditEvent } from '../manifest-admin-audit.types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const createTestEvent = (id: string): AuditEvent => ({
  eventType: 'DLQ_RESOLVE',
  actor: 'test-user',
  requestId: `req-${id}`,
  ipAddress: '192.168.1.1',
  ipHash: 'abc123',
  userAgent: 'test-agent',
  resourceType: 'DLQ_ENTRY',
  resourceId: `resource-${id}`,
  targetBundleId: null,
  beforeState: null,
  afterState: null,
  reason: null,
  createdAt: new Date(),
});

describe('AuditFileSink', () => {
  let testDir: string;
  let basePath: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `audit-sink-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    basePath = path.join(testDir, 'audit.jsonl');
  });

  afterEach(() => {
    // Clean up test directory
    try {
      const files = fs.readdirSync(testDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testDir, file));
      }
      fs.rmdirSync(testDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('write', () => {
    it('should write events as JSONL', async () => {
      const sink = new AuditFileSink({
        basePath,
        maxBytes: 1024 * 1024,
        maxFiles: 5,
      });

      await sink.write([createTestEvent('1'), createTestEvent('2')]);

      const content = fs.readFileSync(basePath, 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines).toHaveLength(2);
      
      const event1 = JSON.parse(lines[0]);
      expect(event1.requestId).toBe('req-1');
      
      const event2 = JSON.parse(lines[1]);
      expect(event2.requestId).toBe('req-2');
    });

    it('should append to existing file', async () => {
      const sink = new AuditFileSink({
        basePath,
        maxBytes: 1024 * 1024,
        maxFiles: 5,
      });

      await sink.write([createTestEvent('1')]);
      await sink.write([createTestEvent('2')]);

      const content = fs.readFileSync(basePath, 'utf-8');
      const lines = content.trim().split('\n');
      
      expect(lines).toHaveLength(2);
    });

    it('should return count of written events', async () => {
      const sink = new AuditFileSink({
        basePath,
        maxBytes: 1024 * 1024,
        maxFiles: 5,
      });

      const count = await sink.write([createTestEvent('1'), createTestEvent('2')]);
      expect(count).toBe(2);
    });
  });

  describe('rotation', () => {
    it('should rotate when maxBytes exceeded', async () => {
      const sink = new AuditFileSink({
        basePath,
        maxBytes: 100, // Very small for testing
        maxFiles: 5,
      });

      // Write enough to trigger rotation
      for (let i = 0; i < 10; i++) {
        await sink.write([createTestEvent(`event-${i}`)]);
      }

      // Should have multiple files
      const files = fs.readdirSync(testDir).filter(f => f.startsWith('audit'));
      expect(files.length).toBeGreaterThan(1);
    });

    it('should delete old files when maxFiles exceeded', async () => {
      const sink = new AuditFileSink({
        basePath,
        maxBytes: 50, // Very small
        maxFiles: 3,
      });

      // Write enough to create many files
      for (let i = 0; i < 20; i++) {
        await sink.write([createTestEvent(`event-${i}`)]);
      }

      // Should have at most maxFiles
      const files = fs.readdirSync(testDir).filter(f => f.startsWith('audit'));
      expect(files.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const sink = new AuditFileSink({
        basePath,
        maxBytes: 1024 * 1024,
        maxFiles: 5,
      });

      await sink.write([createTestEvent('1'), createTestEvent('2')]);

      const stats = await sink.getStats();
      expect(stats.totalFiles).toBe(1);
      expect(stats.pendingBytes).toBeGreaterThan(0);
      expect(stats.currentFileSize).toBeGreaterThan(0);
    });
  });

  describe('getCurrentFilePath', () => {
    it('should return base path for first file', async () => {
      const sink = new AuditFileSink({
        basePath,
        maxBytes: 1024 * 1024,
        maxFiles: 5,
      });

      await sink.initialize();
      expect(sink.getCurrentFilePath()).toBe(basePath);
    });
  });

  describe('empty writes', () => {
    it('should handle empty array', async () => {
      const sink = new AuditFileSink({
        basePath,
        maxBytes: 1024 * 1024,
        maxFiles: 5,
      });

      const count = await sink.write([]);
      expect(count).toBe(0);
      expect(fs.existsSync(basePath)).toBe(false);
    });
  });
});
