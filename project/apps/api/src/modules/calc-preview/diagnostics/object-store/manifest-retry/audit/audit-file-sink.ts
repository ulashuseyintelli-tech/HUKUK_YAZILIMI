/**
 * Audit File Sink
 * 
 * Phase 10.2 - Task 2.1
 * 
 * JSONL file sink with rotation for degraded mode.
 * 
 * Features:
 * - JSONL format (one JSON object per line)
 * - Size-based rotation (maxBytes per file)
 * - File count limit (maxFiles, oldest deleted)
 * - Atomic writes (append mode)
 */

import * as fs from 'fs';
import * as path from 'path';
import { AuditEvent } from './manifest-admin-audit.types';

export interface FileSinkConfig {
  basePath: string;
  maxBytes: number;
  maxFiles: number;
}

export interface FileSinkStats {
  currentFileSize: number;
  totalFiles: number;
  pendingBytes: number;
}

export class AuditFileSink {
  private currentFileSize = 0;
  private currentFileIndex = 0;
  private initialized = false;
  
  constructor(private readonly config: FileSinkConfig) {}
  
  /**
   * Initialize the file sink.
   * Scans existing files to determine current state.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    const dir = path.dirname(this.config.basePath);
    
    // Ensure directory exists
    try {
      await fs.promises.mkdir(dir, { recursive: true });
    } catch (err) {
      // Directory might already exist
    }
    
    // Find existing files and determine current index
    const existingFiles = await this.listRotatedFiles();
    if (existingFiles.length > 0) {
      // Get highest index
      const indices = existingFiles.map(f => this.extractIndex(f)).filter(i => i !== null) as number[];
      this.currentFileIndex = indices.length > 0 ? Math.max(...indices) : 0;
      
      // Get current file size
      const currentPath = this.getCurrentFilePath();
      try {
        const stat = await fs.promises.stat(currentPath);
        this.currentFileSize = stat.size;
      } catch {
        this.currentFileSize = 0;
      }
    }
    
    this.initialized = true;
  }
  
  /**
   * Write events to the file sink.
   * 
   * @param events - Events to write
   * @returns Number of events written
   * @throws Error if write fails
   */
  async write(events: AuditEvent[]): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (events.length === 0) return 0;
    
    // Convert to JSONL
    const lines = events.map(e => JSON.stringify(this.serializeEvent(e))).join('\n') + '\n';
    const bytes = Buffer.byteLength(lines, 'utf-8');
    
    // Check if rotation needed
    if (this.currentFileSize + bytes > this.config.maxBytes) {
      await this.rotate();
    }
    
    // Write to current file
    const filePath = this.getCurrentFilePath();
    await fs.promises.appendFile(filePath, lines, 'utf-8');
    this.currentFileSize += bytes;
    
    return events.length;
  }
  
  /**
   * Get current file sink statistics.
   */
  async getStats(): Promise<FileSinkStats> {
    if (!this.initialized) {
      await this.initialize();
    }
    
    const files = await this.listRotatedFiles();
    let pendingBytes = 0;
    
    for (const file of files) {
      try {
        const stat = await fs.promises.stat(file);
        pendingBytes += stat.size;
      } catch {
        // File might have been deleted
      }
    }
    
    return {
      currentFileSize: this.currentFileSize,
      totalFiles: files.length,
      pendingBytes,
    };
  }
  
  /**
   * Get the current file path.
   */
  getCurrentFilePath(): string {
    if (this.currentFileIndex === 0) {
      return this.config.basePath;
    }
    const ext = path.extname(this.config.basePath);
    const base = this.config.basePath.slice(0, -ext.length);
    return `${base}.${this.currentFileIndex}${ext}`;
  }
  
  /**
   * Rotate to a new file.
   */
  private async rotate(): Promise<void> {
    this.currentFileIndex++;
    this.currentFileSize = 0;
    
    // Clean up old files if over limit
    await this.cleanupOldFiles();
  }
  
  /**
   * Clean up old files beyond maxFiles limit.
   */
  private async cleanupOldFiles(): Promise<void> {
    const files = await this.listRotatedFiles();
    
    // maxFiles includes current file, so we keep maxFiles total
    if (files.length < this.config.maxFiles) return;
    
    // Sort by index (oldest first)
    const sorted = files
      .map(f => ({ path: f, index: this.extractIndex(f) ?? 0 }))
      .sort((a, b) => a.index - b.index);
    
    // Delete oldest files to get down to maxFiles - 1 (leaving room for current)
    const toDelete = sorted.slice(0, files.length - this.config.maxFiles + 1);
    for (const file of toDelete) {
      try {
        await fs.promises.unlink(file.path);
      } catch {
        // File might already be deleted
      }
    }
  }
  
  /**
   * List all rotated files.
   */
  private async listRotatedFiles(): Promise<string[]> {
    const dir = path.dirname(this.config.basePath);
    const baseName = path.basename(this.config.basePath);
    const ext = path.extname(baseName);
    const nameWithoutExt = baseName.slice(0, -ext.length);
    
    try {
      const entries = await fs.promises.readdir(dir);
      const pattern = new RegExp(`^${this.escapeRegex(nameWithoutExt)}(\\.\\d+)?${this.escapeRegex(ext)}$`);
      
      return entries
        .filter(e => pattern.test(e))
        .map(e => path.join(dir, e));
    } catch {
      return [];
    }
  }
  
  /**
   * Extract rotation index from filename.
   */
  private extractIndex(filePath: string): number | null {
    const baseName = path.basename(filePath);
    const ext = path.extname(this.config.basePath);
    const nameWithoutExt = path.basename(this.config.basePath).slice(0, -ext.length);
    
    if (baseName === path.basename(this.config.basePath)) {
      return 0;
    }
    
    const match = baseName.match(new RegExp(`^${this.escapeRegex(nameWithoutExt)}\\.(\\d+)${this.escapeRegex(ext)}$`));
    return match ? parseInt(match[1], 10) : null;
  }
  
  /**
   * Escape special regex characters.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  /**
   * Serialize event for JSONL output.
   */
  private serializeEvent(event: AuditEvent): Record<string, unknown> {
    return {
      eventType: event.eventType,
      actor: event.actor,
      requestId: event.requestId,
      ipHash: event.ipHash,
      userAgent: event.userAgent,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      targetBundleId: event.targetBundleId,
      beforeState: event.beforeState,
      afterState: event.afterState,
      reason: event.reason,
      createdAt: event.createdAt.toISOString(),
    };
  }
}
