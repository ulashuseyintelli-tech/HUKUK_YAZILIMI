/**
 * Task 10.3 + 10.4 + 13.5 - Legal Report Renderer
 * 
 * renderLegalReport(result) → string
 * UI ve backend aynı fonksiyonu kullanır (shared)
 * 
 * Includes:
 * - Parameter reporting (roundingScope, sameDayPaymentRule, gapPolicy, rateVersion)
 * - Disclaimer rules (PREVIEW zorunlu, PRODUCTION/LEGAL_REPORT yok)
 */

import { Injectable } from '@nestjs/common';
import { Segment, AllocationStep } from '../types/domain.types';
import { CalculationMode, RoundingMode, RoundingScope, SameDayPaymentRule } from '../types/common.types';
import { SegmentReporterService } from './segment-reporter.service';
import { 
  buildLegalText, 
  PREVIEW_DISCLAIMER,
  TBK100_ALLOCATION_TEXT,
  CLAIM_PRIORITY_TEXTS,
  ROUNDING_MODE_TEXTS,
  ROUNDING_SCOPE_TEXTS,
  SAME_DAY_PAYMENT_TEXTS,
  DAY_COUNT_RULE_TEXTS,
} from './legal-text-templates';
import { formatMoney, formatDate, formatTimestamp } from './format-utils';
import { ClaimPriorityRule } from '../allocation/claim-priority.service';

// ═══════════════════════════════════════════════════════════════════════════
// LEGAL REPORT INPUT
// ═══════════════════════════════════════════════════════════════════════════

export interface LegalReportInput {
  // Case info
  caseId: string;
  calculatedAt: string;
  asOfDate: string;
  
  // Totals
  totalInterest: number;
  totalDue: number;
  preEnforcementInterest?: number;
  postEnforcementInterest?: number;
  
  // Details
  segments: Segment[];
  allocations?: AllocationStep[];
  
  // Mode
  mode: CalculationMode;
  
  // Parameters used
  parameters: LegalReportParameters;
  
  // Versions
  versions: {
    rateTableVersion: string;
    engineVersion: string;
    ruleVersion?: string;
  };
  
  // Warnings
  warningCount: number;
}

export interface LegalReportParameters {
  interestType: string;
  dayCountBasis: 365 | 360;
  roundingMode: RoundingMode;
  roundingScope: RoundingScope;
  sameDayPaymentRule?: SameDayPaymentRule;
  claimPriorityRule?: ClaimPriorityRule;
  gapPolicy?: string;
}


// ═══════════════════════════════════════════════════════════════════════════
// LEGAL REPORT RENDERER SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class LegalReportRendererService {
  constructor(private readonly segmentReporter: SegmentReporterService) {}

  /**
   * Render complete legal report
   * 
   * Sections:
   * 1. Header (dosya bilgileri)
   * 2. Interest Summary (faiz özeti)
   * 3. Segment Table (segment tablosu)
   * 4. Allocation Table (mahsup tablosu - varsa)
   * 5. Parameters (kullanılan parametreler)
   * 6. Disclaimer (PREVIEW için)
   * 7. Footer (tarih, sürüm, imza)
   */
  renderLegalReport(input: LegalReportInput): string {
    const sections: string[] = [];

    // 1. Header
    sections.push(this.renderHeader(input));

    // 2. Disclaimer (PREVIEW only - at top for visibility)
    if (input.mode === CalculationMode.PREVIEW) {
      sections.push(this.renderDisclaimer());
    }

    // 3. Interest Summary
    sections.push(this.renderInterestSummary(input));

    // 4. Segment Table
    sections.push(this.segmentReporter.generateSegmentTable(input.segments));

    // 5. Phase Summary (if applicable)
    const phaseSummary = this.segmentReporter.generatePhaseSummary(input.segments);
    if (phaseSummary) {
      sections.push(phaseSummary);
    }

    // 6. Allocation Table (if payments exist)
    if (input.allocations && input.allocations.length > 0) {
      sections.push(this.renderAllocationSection(input));
    }

    // 7. Parameters
    sections.push(this.renderParameters(input.parameters));

    // 8. Footer
    sections.push(this.renderFooter(input));

    return sections.join('\n\n');
  }

  /**
   * Render header section
   */
  renderHeader(input: LegalReportInput): string {
    const lines: string[] = [];
    
    lines.push('═'.repeat(100));
    lines.push('                           FAİZ HESAPLAMA RAPORU');
    lines.push('═'.repeat(100));
    lines.push('');
    lines.push(`Dosya No      : ${input.caseId}`);
    lines.push(`Hesap Tarihi  : ${formatDate(input.asOfDate)}`);
    lines.push(`Rapor Tarihi  : ${formatTimestamp(new Date(input.calculatedAt))}`);
    lines.push(`Mod           : ${this.getModeText(input.mode)}`);

    return lines.join('\n');
  }

  /**
   * Render disclaimer (PREVIEW only)
   */
  renderDisclaimer(): string {
    const lines: string[] = [];
    lines.push('');
    lines.push('╔' + '═'.repeat(98) + '╗');
    lines.push('║' + ' '.repeat(98) + '║');
    for (const line of PREVIEW_DISCLAIMER.split('\n')) {
      lines.push('║  ' + line.padEnd(96) + '║');
    }
    lines.push('║' + ' '.repeat(98) + '║');
    lines.push('╚' + '═'.repeat(98) + '╝');
    return lines.join('\n');
  }

  /**
   * Render interest summary
   */
  renderInterestSummary(input: LegalReportInput): string {
    const lines: string[] = [];
    
    lines.push('');
    lines.push('FAİZ ÖZETİ');
    lines.push('-'.repeat(50));
    lines.push(`Toplam Faiz        : ${formatMoney(input.totalInterest)}`);
    
    if (input.preEnforcementInterest !== undefined) {
      lines.push(`  - Takip Öncesi   : ${formatMoney(input.preEnforcementInterest)}`);
    }
    if (input.postEnforcementInterest !== undefined) {
      lines.push(`  - Takip Sonrası  : ${formatMoney(input.postEnforcementInterest)}`);
    }
    
    lines.push(`Toplam Borç        : ${formatMoney(input.totalDue)}`);
    lines.push(`Segment Sayısı     : ${input.segments.length}`);
    
    if (input.warningCount > 0) {
      lines.push(`Uyarı Sayısı       : ${input.warningCount}`);
    }

    return lines.join('\n');
  }

  /**
   * Render allocation section
   */
  renderAllocationSection(input: LegalReportInput): string {
    const lines: string[] = [];
    
    lines.push('');
    lines.push(TBK100_ALLOCATION_TEXT);
    
    if (input.parameters.claimPriorityRule) {
      const priorityText = CLAIM_PRIORITY_TEXTS[input.parameters.claimPriorityRule];
      if (priorityText) {
        lines.push('');
        lines.push(priorityText);
      }
    }
    
    lines.push(this.segmentReporter.generateAllocationTable(input.allocations!));

    return lines.join('\n');
  }

  /**
   * Render parameters section
   */
  renderParameters(params: LegalReportParameters): string {
    const lines: string[] = [];
    
    lines.push('');
    lines.push('HESAPLAMA PARAMETRELERİ');
    lines.push('-'.repeat(50));
    lines.push(`Faiz Türü          : ${params.interestType}`);
    lines.push(`Gün Sayımı         : ${DAY_COUNT_RULE_TEXTS[params.dayCountBasis]}`);
    lines.push(`Yuvarlama Modu     : ${ROUNDING_MODE_TEXTS[params.roundingMode]}`);
    lines.push(`Yuvarlama Kapsamı  : ${ROUNDING_SCOPE_TEXTS[params.roundingScope]}`);
    
    if (params.sameDayPaymentRule) {
      lines.push(`Aynı Gün Ödeme     : ${SAME_DAY_PAYMENT_TEXTS[params.sameDayPaymentRule]}`);
    }
    
    if (params.claimPriorityRule) {
      lines.push(`Alacak Önceliği    : ${CLAIM_PRIORITY_TEXTS[params.claimPriorityRule]}`);
    }
    
    if (params.gapPolicy) {
      lines.push(`Boşluk Politikası  : ${params.gapPolicy}`);
    }

    return lines.join('\n');
  }

  /**
   * Render footer section
   */
  renderFooter(input: LegalReportInput): string {
    const lines: string[] = [];
    
    lines.push('');
    lines.push('-'.repeat(100));
    lines.push('SÜRÜM BİLGİLERİ');
    lines.push(`Oran Tablosu Sürümü : ${input.versions.rateTableVersion}`);
    lines.push(`Motor Sürümü        : ${input.versions.engineVersion}`);
    if (input.versions.ruleVersion) {
      lines.push(`Kural Sürümü        : ${input.versions.ruleVersion}`);
    }
    lines.push('');
    lines.push(`Oluşturulma         : ${formatTimestamp(new Date(input.calculatedAt))}`);
    lines.push('═'.repeat(100));

    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private getModeText(mode: CalculationMode): string {
    switch (mode) {
      case CalculationMode.PREVIEW:
        return 'Önizleme (Resmi Değil)';
      case CalculationMode.PRODUCTION:
        return 'Üretim';
      case CalculationMode.LEGAL_REPORT:
        return 'Mahkeme Raporu';
      default:
        return mode;
    }
  }
}
