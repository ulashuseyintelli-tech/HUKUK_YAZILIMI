/**
 * FACT EXTRACTOR SERVICE (v22-v23)
 * 
 * Structured table rows -> Fact kayıtları.
 * Extractors listesi ile veri çıkarımı.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as crypto from 'crypto';

export interface ExtractorConfig {
  fact_type: string;
  key_fields: string[];
  when?: string; // Condition expression
  map: Record<string, any>;
}

export interface ExtractedFact {
  factType: string;
  key: string;
  value: any;
  snapshotRef?: string;
}

@Injectable()
export class FactExtractorService {
  private readonly logger = new Logger(FactExtractorService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Extract facts from table rows using extractors config
   */
  async extractFromRows(
    caseId: string,
    tenantId: string,
    rows: Record<string, any>[],
    extractors: ExtractorConfig[],
    snapshotRef?: string,
  ): Promise<ExtractedFact[]> {
    const facts: ExtractedFact[] = [];

    for (const row of rows) {
      for (const extractor of extractors) {
        // Check condition
        if (extractor.when && !this.evaluateCondition(extractor.when, row)) {
          continue;
        }

        // Build fact key from key_fields
        const keyParts = extractor.key_fields.map(field => {
          const value = this.resolveTemplate(field, row);
          return `${field}:${value}`;
        });
        const factKey = keyParts.join('|');

        // Build fact value from map
        const factValue = this.resolveMap(extractor.map, row);

        facts.push({
          factType: extractor.fact_type,
          key: factKey,
          value: factValue,
          snapshotRef,
        });
      }
    }

    // Save facts to database
    for (const fact of facts) {
      await this.saveFact(caseId, tenantId, fact);
    }

    return facts;
  }

  /**
   * Save a fact to the database
   */
  async saveFact(caseId: string, tenantId: string, fact: ExtractedFact): Promise<void> {
    const factHash = crypto.createHash('sha256')
      .update(`${fact.factType}:${fact.key}`)
      .digest('hex');

    // Upsert fact (update if same key exists)
    await this.prisma.icrabotFact.upsert({
      where: {
        tenantId_caseId_factHash: {
          tenantId,
          caseId,
          factHash,
        },
      },
      create: {
        caseId,
        tenantId,
        factType: fact.factType,
        factKey: fact.key,
        factHash,
        value: fact.value,
        snapshotRef: fact.snapshotRef,
      },
      update: {
        value: fact.value,
        snapshotRef: fact.snapshotRef,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get facts for a case
   */
  async getFactsForCase(
    caseId: string,
    tenantId: string,
    factType?: string,
  ): Promise<Array<{ factType: string; key: string; value: any; createdAt: Date }>> {
    const facts = await this.prisma.icrabotFact.findMany({
      where: {
        caseId,
        tenantId,
        ...(factType && { factType }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return facts.map(f => ({
      factType: f.factType,
      key: f.factKey,
      value: f.value,
      createdAt: f.createdAt,
    }));
  }

  /**
   * Evaluate a simple condition expression
   * Supports: field != '', field == 'value', field > 0
   */
  private evaluateCondition(condition: string, row: Record<string, any>): boolean {
    // Simple parser for conditions like "plate != ''"
    const match = condition.match(/(\w+)\s*(!=|==|>|<|>=|<=)\s*['"]?([^'"]*)?['"]?/);
    if (!match) return true;

    const [, field, operator, expected] = match;
    const actual = row[field];

    switch (operator) {
      case '!=':
        return actual !== expected && actual !== null && actual !== undefined;
      case '==':
        return String(actual) === expected;
      case '>':
        return Number(actual) > Number(expected);
      case '<':
        return Number(actual) < Number(expected);
      case '>=':
        return Number(actual) >= Number(expected);
      case '<=':
        return Number(actual) <= Number(expected);
      default:
        return true;
    }
  }

  /**
   * Resolve template strings like "{plate}" or "vehicle:plate:{plate}"
   */
  private resolveTemplate(template: string, row: Record<string, any>): string {
    return template.replace(/\{(\w+)\}/g, (_, field) => {
      return String(row[field] ?? '');
    });
  }

  /**
   * Resolve a map object with template values
   */
  private resolveMap(map: Record<string, any>, row: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(map)) {
      if (typeof value === 'string') {
        result[key] = this.resolveTemplate(value, row);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.resolveMap(value, row);
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
