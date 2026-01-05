/**
 * DECISION RULES LOADER SERVICE (v24)
 * 
 * DB-backed decision rules bundle'ından kuralları yükler.
 * bundle_kind='decision_rules' olan ACTIVE ParamBundle kullanılır.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as yaml from 'js-yaml';

export interface DecisionRule {
  rule_id: string;
  when: string;
  then: DecisionThen;
}

export interface DecisionThen {
  enqueue?: string[];
  open_lock?: string | string[];
  set_flag?: Record<string, any>;
  emit?: string | string[];
  compute?: string[];
  decisions?: DecisionBranch[];
}

export interface DecisionBranch {
  if: string;
  then: Omit<DecisionThen, 'compute' | 'decisions'>;
}

export interface DecisionRulesBundle {
  rules: DecisionRule[];
}

@Injectable()
export class DecisionRulesLoaderService {
  private readonly logger = new Logger(DecisionRulesLoaderService.name);
  private cache: { data: DecisionRulesBundle; loadedAt: Date } | null = null;
  private readonly CACHE_TTL_MS = 60000; // 1 minute

  constructor(private prisma: PrismaService) {}

  /**
   * Load active decision rules bundle
   */
  async loadActiveRules(tenantId: string): Promise<DecisionRulesBundle> {
    // Check cache
    if (this.cache && Date.now() - this.cache.loadedAt.getTime() < this.CACHE_TTL_MS) {
      return this.cache.data;
    }

    const bundle = await this.prisma.icrabotBundle.findFirst({
      where: {
        tenantId,
        type: 'DECISION_RULES',
        status: 'ACTIVE',
      },
      orderBy: { version: 'desc' },
    });

    if (!bundle) {
      this.logger.warn(`No active decision_rules bundle found for tenant ${tenantId}`);
      return { rules: [] };
    }

    const data = this.parseContent(bundle.content);
    
    if (!data.rules || !Array.isArray(data.rules)) {
      this.logger.error('decision_rules bundle must have top-level "rules" list');
      return { rules: [] };
    }

    this.cache = { data, loadedAt: new Date() };
    return data;
  }

  /**
   * Parse YAML or JSON content
   */
  private parseContent(content: string): DecisionRulesBundle {
    try {
      // Try YAML first
      const parsed = yaml.load(content) as DecisionRulesBundle;
      return parsed || { rules: [] };
    } catch {
      try {
        // Fallback to JSON
        return JSON.parse(content);
      } catch {
        this.logger.error('Failed to parse decision_rules content');
        return { rules: [] };
      }
    }
  }

  /**
   * Clear cache (for testing or manual refresh)
   */
  clearCache(): void {
    this.cache = null;
  }
}
