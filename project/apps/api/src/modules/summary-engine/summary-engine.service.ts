import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================
// TYPES
// ============================================================

interface SummaryRules {
  version: number;
  engine: string;
  policies: {
    use_demanded_amount_for_summary: boolean;
    use_collected_amount_for_balance: boolean;
    allocation_order: string[];
    bad_check_compensation: {
      default_on: boolean;
      rate: number;
      base_item_type: string;
    };
    default_currency: string;
  };
  buckets: Record<string, {
    label: string;
    include_types: string[];
    color?: string;
  }>;
  summary_sections: SummarySection[];
  computed_fields: ComputedField[];
  ledger_allocation: {
    enabled: boolean;
    on_payment: {
      entryType: string;
      apply_order_policy: string;
      allocate_to: Record<string, string[]>;
    };
  };
  alternative_collection_fee_scenarios: {
    enabled: boolean;
    rates: Array<{ rate: number; label: string }>;
    base_key: string;
    output_label: string;
  };
  case_type_rules: Record<string, any>;
}

interface SummarySection {
  section_key: string;
  section_label: string;
  section_color?: string;
  is_subtotal?: boolean;
  is_total?: boolean;
  lines: SummaryLine[];
}

interface SummaryLine {
  key: string;
  label: string;
  amount: AmountFormula;
  bold?: boolean;
  highlight?: boolean;
  hide_if_zero?: boolean;
  show_if_nonzero?: boolean;
  show_original?: boolean;
  note?: string;
  color?: string;
  size?: string;
  italic?: boolean;
  auto_generate_if_missing?: any;
  fallback_virtual_calc?: any;
}

interface AmountFormula {
  sum_bucket?: string;
  sum_of_keys?: string[];
  sum_items_by_label_contains?: string[];
  sum_items_by_type?: string[];
  sum_all_items?: { field: string };
  subtract?: { left: string; right: string };
  field?: string;
}

interface ComputedField {
  name: string;
  formula: string;
  min?: number;
  format?: string;
}

// Hesaplama sonucu
export interface SummaryResult {
  caseId: string;
  asOfDate: Date;
  currency: string;
  sections: SectionResult[];
  totals: {
    takipTutari: number;
    icraMasraflari: number;
    vekaletUcreti: number;
    takipSonrasiFaiz: number;
    toplamBorc: number;
    toplamTahsilat: number;
    sonBorc: number;
  };
  alternativeScenarios: Array<{
    rate: number;
    label: string;
    amount: number;
  }>;
  items: ClaimItemSummary[];
}

export interface SectionResult {
  key: string;
  label: string;
  color?: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
  lines: LineResult[];
  sectionTotal: number;
}

export interface LineResult {
  key: string;
  label: string;
  amount: number;
  originalAmount?: number;
  collectedAmount?: number;
  remainingAmount?: number;
  bold?: boolean;
  highlight?: boolean;
  note?: string;
  color?: string;
  size?: string;
  italic?: boolean;
  hidden?: boolean;
}

export interface ClaimItemSummary {
  id: string;
  itemType: string;
  label: string;
  originalAmount: number;
  demandedAmount: number;
  collectedAmount: number;
  remainingAmount: number;
  bucket: string;
  status: string;
}

// ============================================================
// SERVICE
// ============================================================

@Injectable()
export class SummaryEngineService implements OnModuleInit {
  private readonly logger = new Logger(SummaryEngineService.name);
  private rules: SummaryRules | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadRules();
  }

  /**
   * YAML kurallarını yükle
   */
  private async loadRules(): Promise<void> {
    try {
      const rulesPath = path.join(__dirname, '../../config/summary-engine-rules.yaml');
      const fileContent = fs.readFileSync(rulesPath, 'utf8');
      this.rules = yaml.load(fileContent) as SummaryRules;
      this.logger.log(`✅ Summary Engine kuralları yüklendi (v${this.rules.version})`);
    } catch (error) {
      this.logger.error('Summary Engine kuralları yüklenemedi:', error);
      // Varsayılan kurallar
      this.rules = this.getDefaultRules();
    }
  }

  /**
   * Varsayılan kurallar
   */
  private getDefaultRules(): SummaryRules {
    return {
      version: 1,
      engine: 'enforcement_accounting_summary',
      policies: {
        use_demanded_amount_for_summary: true,
        use_collected_amount_for_balance: true,
        allocation_order: ['EXPENSE', 'FEE', 'ATTORNEY_FEE', 'PRE_INTEREST', 'POST_INTEREST', 'PRINCIPAL', 'PENALTY', 'OTHER'],
        bad_check_compensation: { default_on: true, rate: 0.10, base_item_type: 'PRINCIPAL' },
        default_currency: 'TRY',
      },
      buckets: {
        principal_bucket: { label: 'Asıl Alacak', include_types: ['PRINCIPAL'] },
        penalty_bucket: { label: 'Tazminat', include_types: ['PENALTY', 'CHECK_PENALTY'] },
        fees_bucket: { label: 'Harçlar', include_types: ['FEE', 'STAMP'] },
        expenses_bucket: { label: 'Masraflar', include_types: ['EXPENSE', 'POSTAGE'] },
        attorney_fee_bucket: { label: 'Vekalet Ücreti', include_types: ['ATTORNEY_FEE'] },
      },
      summary_sections: [],
      computed_fields: [],
      ledger_allocation: {
        enabled: true,
        on_payment: {
          entryType: 'PAYMENT',
          apply_order_policy: 'policies.allocation_order',
          allocate_to: {},
        },
      },
      alternative_collection_fee_scenarios: {
        enabled: true,
        rates: [
          { rate: 0, label: 'Tahsil Harcı Yok' },
          { rate: 0.0227, label: '%2,27' },
          { rate: 0.0455, label: '%4,55' },
          { rate: 0.0910, label: '%9,10' },
          { rate: 0.1138, label: '%11,38' },
        ],
        base_key: 'final_balance_line',
        output_label: 'Tahsil Harcı Oranlarına Göre Son Borç',
      },
      case_type_rules: {},
    };
  }

  /**
   * Dosya için hesap özeti hesapla
   */
  async calculateSummary(tenantId: string, caseId: string, asOfDate?: Date): Promise<SummaryResult> {
    const effectiveDate = asOfDate || new Date();

    // Dosya ve alacak kalemlerini getir
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      include: {
        claimItems: {
          where: { status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
        },
        ledgerEntries: {
          where: { status: 'CONFIRMED' },
          include: { allocations: true },
        },
      },
    });

    if (!caseRecord) {
      throw new Error('Dosya bulunamadı');
    }

    const currency = caseRecord.currency || 'TRY';
    const items = caseRecord.claimItems || [];

    // Kalemleri özet formatına dönüştür
    const itemSummaries: ClaimItemSummary[] = items.map(item => {
      const originalAmount = this.toNumber(item.originalAmount) || this.toNumber(item.amount);
      const demandedAmount = this.toNumber(item.demandedAmount) || this.toNumber(item.amount);
      const collectedAmount = this.toNumber(item.collectedAmount) || 0;
      
      return {
        id: item.id,
        itemType: item.itemType,
        label: item.label || item.description || item.itemType,
        originalAmount,
        demandedAmount,
        collectedAmount,
        remainingAmount: Math.max(0, demandedAmount - collectedAmount),
        bucket: item.bucket || this.getBucketForType(item.itemType),
        status: item.status,
      };
    });

    // Satırları hesapla
    const lineResults: Record<string, number> = {};
    const sections: SectionResult[] = [];

    if (this.rules?.summary_sections) {
      for (const section of this.rules.summary_sections) {
        const sectionResult: SectionResult = {
          key: section.section_key,
          label: section.section_label,
          color: section.section_color,
          isSubtotal: section.is_subtotal,
          isTotal: section.is_total,
          lines: [],
          sectionTotal: 0,
        };

        for (const line of section.lines) {
          const amount = this.calculateLineAmount(line.amount, itemSummaries, lineResults);
          lineResults[line.key] = amount;

          const lineResult: LineResult = {
            key: line.key,
            label: line.label,
            amount,
            bold: line.bold,
            highlight: line.highlight,
            note: line.note,
            color: line.color,
            size: line.size,
            italic: line.italic,
            hidden: (line.hide_if_zero && amount === 0) || (line.show_if_nonzero && amount === 0),
          };

          // Orijinal tutar göster
          if (line.show_original) {
            const originalTotal = itemSummaries
              .filter(i => this.isInBucket(i.itemType, line.amount.sum_bucket))
              .reduce((sum, i) => sum + i.originalAmount, 0);
            lineResult.originalAmount = originalTotal;
          }

          sectionResult.lines.push(lineResult);
          if (!lineResult.hidden) {
            sectionResult.sectionTotal += amount;
          }
        }

        sections.push(sectionResult);
      }
    }

    // Toplamları hesapla
    const takipTutari = lineResults['takip_tutari_line'] || 0;
    const icraMasraflari = lineResults['icra_masraflari_total'] || 0;
    const vekaletUcreti = lineResults['attorney_fee_line'] || 0;
    const takipSonrasiFaiz = lineResults['post_filing_interest_line'] || 0;
    const toplamBorc = lineResults['total_gross_debt_line'] || (takipTutari + icraMasraflari + vekaletUcreti + takipSonrasiFaiz);
    const toplamTahsilat = lineResults['total_collected_line'] || itemSummaries.reduce((sum, i) => sum + i.collectedAmount, 0);
    const sonBorc = lineResults['final_balance_line'] || Math.max(0, toplamBorc - toplamTahsilat);

    // Alternatif senaryolar
    const alternativeScenarios = this.rules?.alternative_collection_fee_scenarios?.enabled
      ? this.rules.alternative_collection_fee_scenarios.rates.map(r => ({
          rate: r.rate,
          label: r.label,
          amount: sonBorc + (sonBorc * r.rate),
        }))
      : [];

    return {
      caseId,
      asOfDate: effectiveDate,
      currency,
      sections,
      totals: {
        takipTutari,
        icraMasraflari,
        vekaletUcreti,
        takipSonrasiFaiz,
        toplamBorc,
        toplamTahsilat,
        sonBorc,
      },
      alternativeScenarios,
      items: itemSummaries,
    };
  }

  /**
   * Satır tutarını hesapla
   */
  private calculateLineAmount(
    formula: AmountFormula,
    items: ClaimItemSummary[],
    previousResults: Record<string, number>,
  ): number {
    const field = formula.field || 'demandedAmount';

    // Bucket toplamı
    if (formula.sum_bucket) {
      return items
        .filter(i => this.isInBucket(i.itemType, formula.sum_bucket))
        .reduce((sum, i) => sum + (i[field as keyof ClaimItemSummary] as number || 0), 0);
    }

    // Önceki satırların toplamı
    if (formula.sum_of_keys) {
      return formula.sum_of_keys.reduce((sum, key) => sum + (previousResults[key] || 0), 0);
    }

    // Label içeren kalemlerin toplamı
    if (formula.sum_items_by_label_contains) {
      return items
        .filter(i => formula.sum_items_by_label_contains!.some(
          label => i.label.toLowerCase().includes(label.toLowerCase())
        ))
        .reduce((sum, i) => sum + (i[field as keyof ClaimItemSummary] as number || 0), 0);
    }

    // Tip bazlı toplam
    if (formula.sum_items_by_type) {
      return items
        .filter(i => formula.sum_items_by_type!.includes(i.itemType))
        .reduce((sum, i) => sum + (i[field as keyof ClaimItemSummary] as number || 0), 0);
    }

    // Tüm kalemlerin toplamı
    if (formula.sum_all_items) {
      const sumField = formula.sum_all_items.field || 'demandedAmount';
      return items.reduce((sum, i) => sum + (i[sumField as keyof ClaimItemSummary] as number || 0), 0);
    }

    // Çıkarma
    if (formula.subtract) {
      const left = previousResults[formula.subtract.left] || 0;
      const right = previousResults[formula.subtract.right] || 0;
      return Math.max(0, left - right);
    }

    return 0;
  }

  /**
   * Kalem türü bucket'a ait mi?
   */
  private isInBucket(itemType: string, bucketKey?: string): boolean {
    if (!bucketKey || !this.rules?.buckets[bucketKey]) return false;
    return this.rules.buckets[bucketKey].include_types.includes(itemType);
  }

  /**
   * Kalem türü için bucket bul
   */
  private getBucketForType(itemType: string): string {
    if (!this.rules?.buckets) return 'other';
    
    for (const [bucketKey, bucket] of Object.entries(this.rules.buckets)) {
      if (bucket.include_types.includes(itemType)) {
        return bucketKey;
      }
    }
    return 'other';
  }

  /**
   * Decimal'i number'a çevir
   */
  private toNumber(value: Decimal | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    return Number(value);
  }

  /**
   * Tahsilat kaydet ve TBK 100'e göre dağıt
   */
  async recordPayment(
    tenantId: string,
    caseId: string,
    amount: number,
    options: {
      entryDate?: Date;
      description?: string;
      referenceNo?: string;
      sourceType?: string;
    } = {},
  ): Promise<{ ledgerEntry: any; allocations: any[] }> {
    if (!this.rules?.ledger_allocation?.enabled) {
      throw new Error('Tahsilat dağıtımı devre dışı');
    }

    // Dosya ve aktif kalemleri getir
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      include: {
        claimItems: {
          where: { status: 'ACTIVE' },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!caseRecord) {
      throw new Error('Dosya bulunamadı');
    }

    // TBK 100 sırasına göre kalemleri sırala
    const allocationOrder = this.rules.policies.allocation_order;
    const sortedItems = [...caseRecord.claimItems].sort((a, b) => {
      const orderA = allocationOrder.indexOf(a.itemType);
      const orderB = allocationOrder.indexOf(b.itemType);
      return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
    });

    // Dağıtım hesapla
    let remainingAmount = amount;
    const allocations: Array<{ claimItemId: string; amount: number; allocationOrder: number }> = [];

    for (let i = 0; i < sortedItems.length && remainingAmount > 0; i++) {
      const item = sortedItems[i];
      const demandedAmount = this.toNumber(item.demandedAmount) || this.toNumber(item.amount);
      const collectedAmount = this.toNumber(item.collectedAmount) || 0;
      const remaining = demandedAmount - collectedAmount;

      if (remaining > 0) {
        const allocationAmount = Math.min(remaining, remainingAmount);
        allocations.push({
          claimItemId: item.id,
          amount: allocationAmount,
          allocationOrder: i + 1,
        });
        remainingAmount -= allocationAmount;
      }
    }

    // Transaction ile kaydet
    const result = await this.prisma.$transaction(async (tx) => {
      // Ledger entry oluştur
      const ledgerEntry = await tx.ledgerEntry.create({
        data: {
          tenantId,
          caseId,
          entryType: 'PAYMENT',
          amount,
          currency: caseRecord.currency || 'TRY',
          entryDate: options.entryDate || new Date(),
          description: options.description,
          referenceNo: options.referenceNo,
          sourceType: options.sourceType,
          status: 'CONFIRMED',
          allocations: {
            create: allocations.map(a => ({
              claimItemId: a.claimItemId,
              amount: a.amount,
              allocationOrder: a.allocationOrder,
            })),
          },
        },
        include: { allocations: true },
      });

      // ClaimItem'ların collectedAmount'larını güncelle
      for (const allocation of allocations) {
        await tx.claimItem.update({
          where: { id: allocation.claimItemId },
          data: {
            collectedAmount: {
              increment: allocation.amount,
            },
          },
        });
      }

      return ledgerEntry;
    });

    return {
      ledgerEntry: result,
      allocations: result.allocations,
    };
  }

  /**
   * Kısmi talep güncelle (demandedAmount)
   */
  async updateDemandedAmount(
    tenantId: string,
    claimItemId: string,
    newDemandedAmount: number,
  ): Promise<any> {
    const item = await this.prisma.claimItem.findFirst({
      where: { id: claimItemId, tenantId },
    });

    if (!item) {
      throw new Error('Alacak kalemi bulunamadı');
    }

    const originalAmount = this.toNumber(item.originalAmount) || this.toNumber(item.amount);
    
    if (newDemandedAmount > originalAmount) {
      throw new Error(`Talep edilen tutar (${newDemandedAmount}) orijinal tutarı (${originalAmount}) aşamaz`);
    }

    if (newDemandedAmount < 0) {
      throw new Error('Talep edilen tutar negatif olamaz');
    }

    const collectedAmount = this.toNumber(item.collectedAmount) || 0;
    if (newDemandedAmount < collectedAmount) {
      throw new Error(`Talep edilen tutar (${newDemandedAmount}) tahsil edilen tutarın (${collectedAmount}) altına düşemez`);
    }

    return this.prisma.claimItem.update({
      where: { id: claimItemId },
      data: { demandedAmount: newDemandedAmount },
    });
  }

  /**
   * Kuralları getir (frontend için)
   */
  getRules(): SummaryRules | null {
    return this.rules;
  }

  /**
   * Bucket listesini getir
   */
  getBuckets(): Record<string, { label: string; include_types: string[]; color?: string }> {
    return this.rules?.buckets || {};
  }

  /**
   * TBK 100 mahsup sırasını getir
   */
  getAllocationOrder(): string[] {
    return this.rules?.policies?.allocation_order || [];
  }
}
