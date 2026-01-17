/**
 * Playbook Registry Service
 * 
 * Phase 7B - Sprint 1 - Task 1.4
 * 
 * Playbook YAML dosyalarını yükleyen ve yöneten bileşen.
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PlaybookYAMLValidator } from './playbook-yaml-validator.service';
import { Playbook, ValidationResult } from './playbook.types';

// ============================================================================
// REGISTRY SERVICE
// ============================================================================

@Injectable()
export class PlaybookRegistry implements OnModuleInit {
  private readonly logger = new Logger(PlaybookRegistry.name);
  
  // Playbook storage
  private playbooks = new Map<string, Playbook>();
  
  // Version tracking
  private versions = new Map<string, string>();
  
  // Load errors (for diagnostics)
  private loadErrors: { file: string; errors: string[] }[] = [];
  
  // Default playbooks directory
  private playbooksDirectory: string;

  constructor(
    private readonly validator: PlaybookYAMLValidator,
  ) {
    // Default to playbooks subdirectory
    this.playbooksDirectory = path.join(__dirname, 'playbooks');
  }

  /**
   * Initialize on module start
   */
  async onModuleInit(): Promise<void> {
    // Only load if directory exists
    if (fs.existsSync(this.playbooksDirectory)) {
      this.loadPlaybooks(this.playbooksDirectory);
    } else {
      this.logger.warn(`[PlaybookRegistry] Playbooks directory not found: ${this.playbooksDirectory}`);
    }
  }

  /**
   * Load playbooks from directory
   */
  loadPlaybooks(directory: string): void {
    this.playbooksDirectory = directory;
    this.playbooks.clear();
    this.versions.clear();
    this.loadErrors = [];

    if (!fs.existsSync(directory)) {
      this.logger.warn(`[PlaybookRegistry] Directory not found: ${directory}`);
      return;
    }

    const files = fs.readdirSync(directory)
      .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    this.logger.log(`[PlaybookRegistry] Loading ${files.length} playbook files from ${directory}`);

    const loadedPlaybooks: Playbook[] = [];

    for (const file of files) {
      const filePath = path.join(directory, file);
      
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const result = this.validator.validate(content);

        if (!result.valid) {
          this.loadErrors.push({
            file,
            errors: result.errors.map(e => `${e.field}: ${e.message}`),
          });
          this.logger.error(`[PlaybookRegistry] Validation failed for ${file}`, {
            errors: result.errors,
          });
          continue;
        }

        const playbook = yaml.load(content) as Playbook;
        loadedPlaybooks.push(playbook);
        
        this.logger.debug(`[PlaybookRegistry] Loaded: ${playbook.id} v${playbook.version}`);
      } catch (error) {
        this.loadErrors.push({
          file,
          errors: [(error as Error).message],
        });
        this.logger.error(`[PlaybookRegistry] Failed to load ${file}`, error);
      }
    }

    // Cross-playbook validation
    const crossValidation = this.validator.validateAll(loadedPlaybooks);
    if (!crossValidation.valid) {
      this.logger.error('[PlaybookRegistry] Cross-playbook validation failed', {
        errors: crossValidation.errors,
      });
      // Still load valid playbooks, but log errors
      for (const error of crossValidation.errors) {
        this.loadErrors.push({
          file: 'cross-validation',
          errors: [`${error.field}: ${error.message}`],
        });
      }
    }

    // Store valid playbooks
    for (const playbook of loadedPlaybooks) {
      this.playbooks.set(playbook.id, playbook);
      this.versions.set(playbook.id, playbook.version);
    }

    this.logger.log(`[PlaybookRegistry] Loaded ${this.playbooks.size} playbooks successfully`);
    
    if (this.loadErrors.length > 0) {
      this.logger.warn(`[PlaybookRegistry] ${this.loadErrors.length} files had errors`);
    }
  }


  /**
   * Get playbook by ID
   */
  getPlaybook(playbookId: string): Playbook | undefined {
    return this.playbooks.get(playbookId);
  }

  /**
   * Get all active playbooks
   */
  getAllPlaybooks(): Playbook[] {
    return Array.from(this.playbooks.values());
  }

  /**
   * Get playbook version
   */
  getVersion(playbookId: string): string | undefined {
    return this.versions.get(playbookId);
  }

  /**
   * Get all versions
   */
  getAllVersions(): Map<string, string> {
    return new Map(this.versions);
  }

  /**
   * Reload playbooks (hot reload)
   */
  reload(): void {
    this.logger.log('[PlaybookRegistry] Reloading playbooks...');
    this.loadPlaybooks(this.playbooksDirectory);
  }

  /**
   * Get load errors (for diagnostics)
   */
  getLoadErrors(): { file: string; errors: string[] }[] {
    return [...this.loadErrors];
  }

  /**
   * Check if registry has any playbooks
   */
  hasPlaybooks(): boolean {
    return this.playbooks.size > 0;
  }

  /**
   * Get playbook count
   */
  getPlaybookCount(): number {
    return this.playbooks.size;
  }

  /**
   * Register a playbook programmatically (for testing)
   */
  registerPlaybook(playbook: Playbook): ValidationResult {
    // Validate first
    const result = this.validator.validateSemantics(playbook);
    
    if (!result.valid) {
      this.logger.error(`[PlaybookRegistry] Cannot register invalid playbook: ${playbook.id}`, {
        errors: result.errors,
      });
      return result;
    }

    // Check for escalation loops with existing playbooks
    const allPlaybooks = [...this.getAllPlaybooks(), playbook];
    const loops = this.validator.detectEscalationLoops(allPlaybooks);
    
    if (loops.length > 0) {
      return {
        valid: false,
        errors: loops.map(loop => ({
          field: 'escalation',
          message: `Escalation loop detected: ${loop.cycle.join(' → ')}`,
          code: 'ESCALATION_LOOP',
        })),
      };
    }

    this.playbooks.set(playbook.id, playbook);
    this.versions.set(playbook.id, playbook.version);
    
    this.logger.log(`[PlaybookRegistry] Registered: ${playbook.id} v${playbook.version}`);
    
    return { valid: true, errors: [] };
  }

  /**
   * Unregister a playbook (for testing)
   */
  unregisterPlaybook(playbookId: string): boolean {
    const existed = this.playbooks.has(playbookId);
    this.playbooks.delete(playbookId);
    this.versions.delete(playbookId);
    
    if (existed) {
      this.logger.log(`[PlaybookRegistry] Unregistered: ${playbookId}`);
    }
    
    return existed;
  }

  /**
   * Clear all playbooks (for testing)
   */
  clear(): void {
    this.playbooks.clear();
    this.versions.clear();
    this.loadErrors = [];
    this.logger.log('[PlaybookRegistry] Cleared all playbooks');
  }

  /**
   * Get registry status (for diagnostics)
   */
  getStatus(): {
    playbookCount: number;
    playbooks: { id: string; version: string; dryRun: boolean }[];
    loadErrors: { file: string; errors: string[] }[];
    directory: string;
  } {
    return {
      playbookCount: this.playbooks.size,
      playbooks: Array.from(this.playbooks.values()).map(p => ({
        id: p.id,
        version: p.version,
        dryRun: p.dryRun,
      })),
      loadErrors: this.loadErrors,
      directory: this.playbooksDirectory,
    };
  }
}
