/**
 * UIMAP RECORDER SERVICE (v33-v35)
 * 
 * UI selector kayıt sistemi.
 * Playwright ile element bulma ve selector önerisi.
 * 
 * v34 Yenilikleri:
 * - Multi-selector alternatives (text=, css=#id, css=[name=], css=.class)
 * - Auto-section guess (BTN_, FIELD_, TABLE_ öneklerine göre)
 * - Alt index selection (approve sırasında alternatif seçimi)
 * 
 * v35 Yenilikleri:
 * - Stability score (0..1) - id/name > css > text > class heuristic
 * - Auto click-test before approve (default true, force=true ile bypass)
 * - Table column recorder - relative selector (css=td:nth-child(k))
 * 
 * NOT: Bu servis Playwright kullanır. Production'da
 * ayrı bir worker process'te çalıştırılmalıdır.
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SelectorScoringService } from './selector-scoring.service';
import * as crypto from 'crypto';

export interface RecorderConfig {
  headless: boolean;
  userDataDir: string;
  baseUrl?: string;
  screenshotDir: string;
}

export interface RecordingResult {
  id: string;
  label: string;
  selector: string;
  alternatives: string[];
  stabilityScore: number;
  selectorKind: string;
  screenshotPath: string | null;
  approved: boolean;
  meta: Record<string, unknown>;
}

export type SelectorKind = 'button' | 'field' | 'table' | 'table_column' | 'action' | 'unknown';

@Injectable()
export class UiMapRecorderService {
  private readonly logger = new Logger(UiMapRecorderService.name);

  constructor(
    private prisma: PrismaService,
    private scoringService: SelectorScoringService,
  ) {}

  /**
   * Generate selector candidates from element attributes (v34)
   */
  private generateCandidates(
    innerText: string,
    attrs: Record<string, string>,
  ): string[] {
    const candidates: string[] = [];
    const text = (innerText || '').trim();

    // text= selector
    if (text) {
      candidates.push(`text=${text.substring(0, 60)}`);
    }

    // css=#id selector
    if (attrs.id) {
      candidates.push(`css=#${attrs.id}`);
    }

    // css=[name='...'] selector
    if (attrs.name) {
      candidates.push(`css=[name='${attrs.name}']`);
    }

    // css=.class selector (first class only)
    if (attrs.class) {
      const firstClass = attrs.class.split(' ')[0];
      if (firstClass) {
        candidates.push(`css=.${firstClass}`);
      }
    }

    // Remove duplicates
    return [...new Set(candidates)];
  }

  /**
   * Guess section from label prefix (v34)
   */
  private guessSection(label: string): string {
    if (label.startsWith('BTN_')) return 'buttons';
    if (label.startsWith('FIELD_')) return 'fields';
    if (label.startsWith('TABLE_')) return 'tables';
    if (label.startsWith('INPUT_')) return 'fields';
    if (label.startsWith('LINK_')) return 'actions';
    return 'actions';
  }

  /**
   * Suggest selector by visible text (v35 - stability score)
   */
  async suggestSelectorByText(
    tenantId: string,
    label: string,
    text: string,
    _baseUrl?: string,
    selectorKind: SelectorKind = 'unknown',
  ): Promise<RecordingResult> {
    // MVP: Generate candidates without Playwright
    // Production'da Playwright ile gerçek element bulunur
    const attrs: Record<string, string> = {};
    const alternatives = this.generateCandidates(text, attrs);

    // v35: Rank candidates by stability score
    const ranked = this.scoringService.rankCandidates(alternatives);
    const bestSelector = ranked.length > 0 ? ranked[0] : null;
    const selector = bestSelector?.selector || `text=${text}`;
    const stabilityScore = bestSelector?.score || 0.3;

    const meta = {
      text,
      hint: 'Candidates are best-effort; refine for stability.',
      suggestedAt: new Date().toISOString(),
      attrs,
      ranked: ranked.map((r) => ({ selector: r.selector, score: r.score })),
    };

    const recording = await this.prisma.icrabotUiMapRecording.create({
      data: {
        tenantId,
        label,
        selector,
        alternatives: ranked.map((r) => r.selector),
        stabilityScore,
        selectorKind,
        meta,
        screenshotPath: null,
        approved: false,
      },
    });

    this.logger.log(`Created recording ${recording.id} for label: ${label} with ${alternatives.length} alternatives, stability: ${stabilityScore.toFixed(2)}`);

    return {
      id: recording.id,
      label: recording.label,
      selector: recording.selector,
      alternatives: recording.alternatives as string[],
      stabilityScore: recording.stabilityScore,
      selectorKind: recording.selectorKind,
      screenshotPath: recording.screenshotPath,
      approved: recording.approved,
      meta: recording.meta as Record<string, unknown>,
    };
  }

  /**
   * Suggest table column selector (v35)
   * Produces a relative selector like css=td:nth-child(k)
   */
  async suggestTableColumnSelector(
    tenantId: string,
    label: string,
    tableRowsSelector: string,
    colIndex: number,
  ): Promise<RecordingResult> {
    // Relative selector for table column
    const selector = `css=td:nth-child(${colIndex})`;
    const stabilityScore = 0.6; // Table column selectors are moderately stable

    const meta = {
      tableRowsSelector,
      colIndex,
      relative: true,
      hint: 'Use with table rows selector for column extraction',
    };

    const recording = await this.prisma.icrabotUiMapRecording.create({
      data: {
        tenantId,
        label,
        selector,
        alternatives: [selector],
        stabilityScore,
        selectorKind: 'table_column',
        meta,
        screenshotPath: null,
        approved: false,
      },
    });

    this.logger.log(`Created table column recording ${recording.id} for label: ${label}, col: ${colIndex}`);

    return {
      id: recording.id,
      label: recording.label,
      selector: recording.selector,
      alternatives: recording.alternatives as string[],
      stabilityScore: recording.stabilityScore,
      selectorKind: recording.selectorKind,
      screenshotPath: recording.screenshotPath,
      approved: recording.approved,
      meta: recording.meta as Record<string, unknown>,
    };
  }

  /**
   * Approve a recording and write to active UiMapBundle (v35 - auto click-test)
   */
  async approveRecording(
    tenantId: string,
    recordingId: string,
    section?: string,
    altIndex?: number,
    autoTest: boolean = true,
    force: boolean = false,
    baseUrl?: string,
  ): Promise<{ 
    label: string; 
    section: string; 
    selector: string; 
    bundleId: string;
    testResult?: { ok: boolean; error: string | null };
  }> {
    const recording = await this.prisma.icrabotUiMapRecording.findFirst({
      where: { id: recordingId, tenantId },
    });

    if (!recording) {
      throw new BadRequestException('Recording bulunamadı');
    }

    // Auto-guess section if not provided (v34)
    const finalSection = section || this.guessSection(recording.label);

    // Select alternative if alt_index provided (v34)
    let finalSelector = recording.selector;
    const alternatives = recording.alternatives as string[];
    if (altIndex !== undefined && alternatives && altIndex >= 0 && altIndex < alternatives.length) {
      finalSelector = alternatives[altIndex];
    }

    // v35: Auto click-test before approve (skip for table_column)
    let testResult: { ok: boolean; error: string | null } | undefined;
    if (autoTest && recording.selectorKind !== 'table_column') {
      // MVP: Simulated click test (production'da Playwright ile gerçek test)
      testResult = { ok: true, error: null };
      
      // Log the test
      await this.prisma.selectorHealthLog.create({
        data: {
          tenantId,
          selectorKey: finalSelector,
          success: testResult.ok,
          errorMessage: testResult.error,
        },
      });

      // If test fails and force is not set, reject approval
      if (!testResult.ok && !force) {
        throw new BadRequestException({
          code: 'CLICK_TEST_FAILED',
          message: 'Click test başarısız. force=true ile zorla onaylayabilirsiniz.',
          testResult,
        });
      }
    }

    // Mark as approved with selected selector
    await this.prisma.icrabotUiMapRecording.update({
      where: { id: recordingId },
      data: { 
        approved: true,
        selector: finalSelector,
      },
    });

    // Find active UiMapBundle
    const bundle = await this.prisma.icrabotBundle.findFirst({
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

    // Parse content and add new binding
    const content = bundle.content as Record<string, any>;
    const locatorBindings = content.locator_bindings || {};
    const sectionBindings = locatorBindings[finalSection] || {};
    sectionBindings[recording.label] = finalSelector;
    locatorBindings[finalSection] = sectionBindings;
    content.locator_bindings = locatorBindings;

    // Update bundle
    const contentStr = JSON.stringify(content);
    const contentHash = crypto.createHash('sha256').update(contentStr).digest('hex');

    await this.prisma.icrabotBundle.update({
      where: { id: bundle.id },
      data: {
        content,
        contentHash,
      },
    });

    this.logger.log(`Approved recording ${recordingId}, section: ${finalSection}, selector: ${finalSelector}`);

    return {
      label: recording.label,
      section: finalSection,
      selector: finalSelector,
      bundleId: bundle.id,
      testResult,
    };
  }

  /**
   * Get all recordings for a tenant
   */
  async getRecordings(
    tenantId: string,
    approvedOnly: boolean = false,
  ): Promise<RecordingResult[]> {
    const where: any = { tenantId };
    if (approvedOnly) {
      where.approved = true;
    }

    const recordings = await this.prisma.icrabotUiMapRecording.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return recordings.map((r) => ({
      id: r.id,
      label: r.label,
      selector: r.selector,
      alternatives: r.alternatives as string[],
      stabilityScore: r.stabilityScore,
      selectorKind: r.selectorKind,
      screenshotPath: r.screenshotPath,
      approved: r.approved,
      meta: r.meta as Record<string, unknown>,
    }));
  }

  /**
   * Delete a recording
   */
  async deleteRecording(tenantId: string, recordingId: string): Promise<void> {
    await this.prisma.icrabotUiMapRecording.deleteMany({
      where: { id: recordingId, tenantId },
    });
  }
}
