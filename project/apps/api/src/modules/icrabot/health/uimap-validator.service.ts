/**
 * UIMAP VALIDATOR SERVICE (v36)
 * 
 * UiMap bundle doğrulama.
 * Eksik locator binding ve columns_keys hatalarını tespit eder.
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface UiMapValidationIssue {
  type: 'missing_binding' | 'invalid_selector' | 'missing_column';
  screen?: string;
  column?: string;
  key: string;
  message?: string;
}

export interface UiMapValidationReport {
  ok: boolean;
  uimapBundleId: string;
  issues: UiMapValidationIssue[];
  stats: {
    totalBindings: number;
    totalScreens: number;
    totalColumns: number;
  };
}

@Injectable()
export class UiMapValidatorService {
  private readonly logger = new Logger(UiMapValidatorService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Validate active UiMap bundle
   */
  async validateActiveUiMap(tenantId: string): Promise<UiMapValidationReport> {
    // Use type assertion for Icrabot models (Prisma client may need regeneration)
    const prismaAny = this.prisma as any;

    // Get active UiMap bundle
    const bundle = await prismaAny.icrabotBundle.findFirst({
      where: {
        tenantId,
        type: 'UIMAP',
        status: 'ACTIVE',
      },
      orderBy: { version: 'desc' },
    });

    if (!bundle) {
      throw new BadRequestException('Aktif UiMapBundle bulunamadı');
    }

    const content = bundle.content as Record<string, any>;
    return this.validateUiMap(content, bundle.id);
  }

  /**
   * Validate UiMap content
   */
  validateUiMap(uimap: Record<string, any>, bundleId: string): UiMapValidationReport {
    const issues: UiMapValidationIssue[] = [];
    const bindings = uimap.locator_bindings || {};

    // Collect all binding keys
    const allKeys = new Set<string>();
    const sections = ['buttons', 'fields', 'tables', 'actions'];
    for (const sec of sections) {
      const sectionBindings = bindings[sec] || {};
      Object.keys(sectionBindings).forEach(key => allKeys.add(key));
    }

    // Validate screens
    const screens = uimap.ui_map?.screens || {};
    let totalColumns = 0;

    for (const [screenName, spec] of Object.entries(screens)) {
      const screenSpec = spec as Record<string, any>;

      // Check menu_clicks
      const menuClicks = screenSpec.menu_clicks || [];
      for (const key of menuClicks) {
        if (!allKeys.has(key)) {
          issues.push({
            type: 'missing_binding',
            screen: screenName,
            key,
            message: `Menu click key '${key}' not found in locator_bindings`,
          });
        }
      }

      // Check table rows
      const table = screenSpec.table || {};
      const rowsKey = table.rows;
      if (rowsKey && !allKeys.has(rowsKey)) {
        issues.push({
          type: 'missing_binding',
          screen: screenName,
          key: rowsKey,
          message: `Table rows key '${rowsKey}' not found in locator_bindings`,
        });
      }

      // Check columns_keys
      const columnsKeys = table.columns_keys || {};
      for (const [colName, colKey] of Object.entries(columnsKeys)) {
        totalColumns++;
        if (!allKeys.has(colKey as string)) {
          issues.push({
            type: 'missing_column',
            screen: screenName,
            column: colName,
            key: colKey as string,
            message: `Column key '${colKey}' for column '${colName}' not found in locator_bindings`,
          });
        }
      }
    }

    const report: UiMapValidationReport = {
      ok: issues.length === 0,
      uimapBundleId: bundleId,
      issues,
      stats: {
        totalBindings: allKeys.size,
        totalScreens: Object.keys(screens).length,
        totalColumns,
      },
    };

    this.logger.log(`UiMap validation: ${issues.length} issues found`);

    return report;
  }
}
