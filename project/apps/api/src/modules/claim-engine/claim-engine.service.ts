import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Shared contracts
import type { InterestTypeCode } from '@shared/types';

/**
 * Claim Engine Service
 * 
 * Sorumluluklar:
 * - Document classification (OCR'dan belge türü)
 * - Case routing (takip türü belirleme)
 * - Claim item generation (alacak kalemi şablonu)
 * 
 * NOT: Faiz hesaplama ve oran okuma bu modülün sorumluluğunda DEĞİL.
 * @see interest-engine - Faiz hesaplama için tek kaynak
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

// Kural tipleri
export interface DocumentClassificationHint {
  any_of: string[];
}

export interface CaseRoutingRule {
  id: string;
  when: {
    docType: string;
    any_of_contains?: string[];
  };
  then: {
    caseType: string;
    subCategory: string;
    form: string;
    routeType: string;
  };
}

export interface ClaimItemTemplate {
  type: string;
  label: string;
  amount_source?: string;
  currency_source?: string;
  date_source?: string;
  period_source?: string;
  required: boolean;
  rule_ref?: string;
  calc_ref?: string;
  params?: Record<string, any>;
}

export interface InterestRule {
  interestType: string;
  annualRate: number | null;
  variableRate: boolean;
  startDateSource: string;
  endDateSource?: string;
  baseItemType: string;
}

export interface ValidationRule {
  id: string;
  severity: 'ERROR' | 'WARNING';
  when: Record<string, any>;
  message: string;
}

export interface ClaimEngineRules {
  version: number;
  engine: string;
  defaults: {
    currency: string;
    require_article4_request_to_start: boolean;
    rounding: { mode: string; scale: number };
  };
  document_classification: {
    hints: Record<string, DocumentClassificationHint>;
  };
  case_routing: {
    rules: CaseRoutingRule[];
  };
  claim_item_sets: {
    templates: Record<string, { items: ClaimItemTemplate[] }>;
  };
  interest_rules: Record<string, InterestRule>;
  validations: ValidationRule[];
  templates: Record<string, any>;
  communication_suggestions: Record<string, any>;
  penalty_calculators: Record<string, any>;
  interest_rate_table: Record<string, Record<string, Array<{ start_date: string; rate: number }>>>;
}

export interface ClassificationResult {
  docType: string;
  confidence: number;
  matchedKeywords: string[];
}

export interface RoutingResult {
  caseType: string;
  subCategory: string;
  form: string;
  routeType: string;
  ruleId: string;
}

export interface GeneratedClaimItem {
  type: string;
  label: string;
  amount?: number;
  currency?: string;
  dueDate?: string;
  required: boolean;
  isCalculated: boolean;
  interestRule?: InterestRule;
  params?: Record<string, any>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{ id: string; message: string }>;
  warnings: Array<{ id: string; message: string }>;
}

@Injectable()
export class ClaimEngineService implements OnModuleInit {
  private readonly logger = new Logger(ClaimEngineService.name);
  private rules: ClaimEngineRules | null = null;

  async onModuleInit() {
    await this.loadRules();
  }

  // YAML kurallarını yükle
  async loadRules(): Promise<void> {
    try {
      // Birden fazla olası yolu dene
      const possiblePaths = [
        path.join(process.cwd(), 'src/config/claim-engine-rules.yaml'),
        path.join(process.cwd(), 'dist/config/claim-engine-rules.yaml'),
        path.join(__dirname, '../../config/claim-engine-rules.yaml'),
        path.join(__dirname, '../../../src/config/claim-engine-rules.yaml'),
      ];

      let fileContent: string | null = null;
      let usedPath = '';

      for (const configPath of possiblePaths) {
        try {
          if (fs.existsSync(configPath)) {
            fileContent = fs.readFileSync(configPath, 'utf8');
            usedPath = configPath;
            break;
          }
        } catch {
          continue;
        }
      }

      if (fileContent) {
        this.rules = yaml.load(fileContent) as ClaimEngineRules;
        this.logger.log(`Claim Engine kuralları yüklendi (v${this.rules?.version}) - ${usedPath}`);
      } else {
        this.logger.warn('Claim Engine YAML dosyası bulunamadı, varsayılan kurallar kullanılacak');
        this.rules = this.getDefaultRules();
      }
    } catch (error) {
      this.logger.error('Claim Engine kuralları yüklenemedi:', error);
      this.rules = this.getDefaultRules();
    }
  }

  // Varsayılan kurallar (YAML bulunamazsa)
  private getDefaultRules(): ClaimEngineRules {
    return {
      version: 1,
      engine: 'claim_engine_rules',
      defaults: {
        currency: 'TRY',
        require_article4_request_to_start: true,
        rounding: { mode: 'HALF_UP', scale: 2 },
      },
      document_classification: {
        hints: {
          INVOICE: { any_of: ['FATURA', 'KDV', 'TOPLAM'] },
          CHECK: { any_of: ['ÇEK', 'KEŞİDECİ', 'BANKA'] },
          PROMISSORY: { any_of: ['SENET', 'BONO', 'VADE'] },
          LEASE: { any_of: ['KİRA', 'KİRACI', 'KİRALAYAN'] },
          JUDGMENT: { any_of: ['MAHKEMESİ', 'KARAR', 'HÜKÜM'] },
        },
      },
      case_routing: { rules: [] },
      claim_item_sets: {
        templates: {
          ILAMSIZ_GENEL: {
            items: [
              { type: 'PRINCIPAL', label: 'Asıl Alacak', required: true },
            ],
          },
        },
      },
      interest_rules: {
        default_post_interest: {
          interestType: 'LEGAL',
          annualRate: 24,
          variableRate: true,
          startDateSource: 'case.filingDate',
          baseItemType: 'PRINCIPAL',
        },
      },
      validations: [],
      templates: {},
      communication_suggestions: {},
      penalty_calculators: {},
      interest_rate_table: {
        TRY: {
          LEGAL: [{ start_date: '2024-01-01', rate: 24 }],
          COMMERCIAL: [{ start_date: '2024-01-01', rate: 48 }],
        },
      },
    };
  }

  // Kuralları getir
  getRules(): ClaimEngineRules | null {
    return this.rules;
  }

  // ==================== 1) DOCUMENT CLASSIFICATION ====================

  // OCR metninden belge türünü sınıflandır
  classifyDocument(ocrText: string): ClassificationResult {
    if (!this.rules) {
      return { docType: 'OTHER', confidence: 0, matchedKeywords: [] };
    }

    const upperText = ocrText.toUpperCase();
    const hints = this.rules.document_classification.hints;
    
    let bestMatch: ClassificationResult = { docType: 'OTHER', confidence: 0, matchedKeywords: [] };

    for (const [docType, hint] of Object.entries(hints)) {
      const matchedKeywords = hint.any_of.filter(keyword => 
        upperText.includes(keyword.toUpperCase())
      );
      
      const confidence = matchedKeywords.length / hint.any_of.length;
      
      if (confidence > bestMatch.confidence) {
        bestMatch = { docType, confidence, matchedKeywords };
      }
    }

    return bestMatch;
  }

  // ==================== 2) CASE TYPE ROUTING ====================

  // Belge türü ve içerikten takip türünü belirle
  routeCase(docType: string, documentContent?: string): RoutingResult | null {
    if (!this.rules) return null;

    const upperContent = (documentContent || '').toUpperCase();
    const routingRules = this.rules.case_routing.rules;

    // Önce spesifik kuralları kontrol et (any_of_contains olanlar)
    for (const rule of routingRules) {
      if (rule.when.docType !== docType) continue;
      
      // any_of_contains varsa içerik kontrolü yap
      if (rule.when.any_of_contains) {
        const hasMatch = rule.when.any_of_contains.some(keyword =>
          upperContent.includes(keyword.toUpperCase())
        );
        if (hasMatch) {
          return { ...rule.then, ruleId: rule.id };
        }
      }
    }

    // Sonra genel kuralları kontrol et (sadece docType eşleşmesi)
    for (const rule of routingRules) {
      if (rule.when.docType === docType && !rule.when.any_of_contains) {
        return { ...rule.then, ruleId: rule.id };
      }
    }

    return null;
  }


  // ==================== 3) CLAIM ITEM GENERATION ====================

  // Alt kategoriye göre alacak kalemi şablonlarını getir
  getClaimItemTemplates(subCategory: string): ClaimItemTemplate[] {
    if (!this.rules) return [];
    
    const template = this.rules.claim_item_sets.templates[subCategory];
    return template?.items || [];
  }

  // Evrak verilerinden alacak kalemleri oluştur
  generateClaimItems(
    subCategory: string,
    extractedData: Record<string, any>,
    wizardData: Record<string, any> = {},
  ): GeneratedClaimItem[] {
    const templates = this.getClaimItemTemplates(subCategory);
    const items: GeneratedClaimItem[] = [];

    for (const template of templates) {
      const item: GeneratedClaimItem = {
        type: template.type,
        label: template.label,
        required: template.required,
        isCalculated: false,
        params: template.params,
      };

      // Tutar kaynağını çözümle
      if (template.amount_source) {
        item.amount = this.resolveSource(template.amount_source, extractedData, wizardData);
      }

      // Para birimi kaynağını çözümle
      if (template.currency_source) {
        item.currency = this.resolveSource(template.currency_source, extractedData, wizardData) || 'TRY';
      }

      // Tarih kaynağını çözümle
      if (template.date_source) {
        item.dueDate = this.resolveSource(template.date_source, extractedData, wizardData);
      }

      // Faiz kuralı referansı
      if (template.rule_ref) {
        const ruleName = template.rule_ref.replace('interest_rules.', '');
        item.interestRule = this.rules?.interest_rules[ruleName];
      }

      // Hesaplama referansı varsa işaretle
      if (template.calc_ref) {
        item.isCalculated = true;
      }

      items.push(item);
    }

    return items;
  }

  // Kaynak yolunu çözümle (doc.extracted.xxx veya wizard.xxx)
  private resolveSource(
    source: string,
    extractedData: Record<string, any>,
    wizardData: Record<string, any>,
  ): any {
    const parts = source.split('.');
    
    if (parts[0] === 'doc' && parts[1] === 'extracted') {
      const key = parts.slice(2).join('.');
      return this.getNestedValue(extractedData, key);
    }
    
    if (parts[0] === 'wizard') {
      const key = parts.slice(1).join('.');
      return this.getNestedValue(wizardData, key);
    }

    return null;
  }

  // İç içe nesne değerini al
  private getNestedValue(obj: Record<string, any>, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  // ==================== 4) INTEREST RULES ====================

  // Faiz kuralını getir
  getInterestRule(ruleName: string): InterestRule | null {
    if (!this.rules) return null;
    return this.rules.interest_rules[ruleName] || null;
  }

  /**
   * @deprecated Use interest-engine/RateProviderService instead
   * 
   * Bu metod artık kullanılmamalı. Faiz oranları için:
   * ```typescript
   * import { RateProviderService } from '@/modules/interest-engine';
   * const rate = await rateProvider.getRate(interestTypeCode, date, currency);
   * ```
   * 
   * NOT: Bu metod artık YAML'dan oran okumaz. Sadece null döner.
   * Tüm oran okumaları interest-engine üzerinden yapılmalıdır.
   * 
   * @see ARCHITECTURE.md - Source of Truth Matrix
   * @returns null - Her zaman null döner, interest-engine kullanın
   */
  getInterestRate(currency: string, interestType: string, date: Date): number | null {
    // Deprecation warning (always log)
    this.logger.warn(
      `⛔ claim-engine.getInterestRate() is REMOVED. Use interest-engine/RateProviderService instead. ` +
      `Called with: currency=${currency}, type=${interestType}, date=${date.toISOString()}`
    );

    // Artık YAML'dan okumuyoruz - tek kaynak interest-engine
    return null;
  }


  // ==================== 5) VALIDATIONS ====================

  // Dosya verilerini doğrula
  validateCase(
    caseType: string,
    subCategory: string,
    claimItems: Array<{ type: string }>,
    extractedData: Record<string, any>,
    wizardData: Record<string, any>,
  ): ValidationResult {
    if (!this.rules) {
      return { isValid: true, errors: [], warnings: [] };
    }

    const errors: Array<{ id: string; message: string }> = [];
    const warnings: Array<{ id: string; message: string }> = [];

    for (const validation of this.rules.validations) {
      const { when, severity, message, id } = validation;
      let triggered = false;

      // missing_item_type kontrolü
      if (when.missing_item_type) {
        const hasItem = claimItems.some(item => item.type === when.missing_item_type);
        if (!hasItem) triggered = true;
      }

      // caseType kontrolü
      if (when.caseType && when.caseType !== caseType) {
        continue; // Bu kural bu takip türü için geçerli değil
      }

      // subCategory kontrolü
      if (when.subCategory && when.subCategory !== subCategory) {
        continue;
      }

      // missing_field kontrolü
      if (when.missing_field) {
        const value = this.resolveSource(when.missing_field, extractedData, wizardData);
        if (!value) triggered = true;
      }

      // any_of kontrolü (herhangi biri eksikse)
      if (when.any_of && Array.isArray(when.any_of)) {
        for (const condition of when.any_of) {
          if (condition.missing_field) {
            const value = this.resolveSource(condition.missing_field, extractedData, wizardData);
            if (!value) {
              triggered = true;
              break;
            }
          }
        }
      }

      // field_value_not_in kontrolü
      if (when.field_value_not_in) {
        const { field, values } = when.field_value_not_in;
        const value = this.resolveSource(field, extractedData, wizardData);
        if (value && !values.includes(value)) {
          triggered = true;
        }
      }

      if (triggered) {
        if (severity === 'ERROR') {
          errors.push({ id, message });
        } else {
          warnings.push({ id, message });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==================== 6) TEMPLATES ====================

  // Takip türüne göre şablon adını getir
  getTemplateForCase(subCategory: string, templateSet: string = 'takip_talebi_ornek_1'): string | null {
    if (!this.rules) return null;
    
    const templates = this.rules.templates[templateSet];
    if (!templates?.by_case) return null;

    return templates.by_case[subCategory] || null;
  }

  // ==================== 7) COMMUNICATION SUGGESTIONS ====================

  // İletişim önerilerini getir
  getCommunicationSuggestions(caseType: string): Array<{ type: string; smsTemplate: string; emailTemplate: string }> {
    if (!this.rules) return [];

    const suggestions: Array<{ type: string; smsTemplate: string; emailTemplate: string }> = [];

    for (const [type, config] of Object.entries(this.rules.communication_suggestions)) {
      if (config.when?.any_of_caseTypes?.includes(caseType)) {
        suggestions.push({
          type,
          smsTemplate: config.sms_template,
          emailTemplate: config.email_template,
        });
      }
    }

    return suggestions;
  }

  // ==================== 8) PENALTY CALCULATORS ====================

  // Ceza/tazminat hesapla
  calculatePenalty(calculatorName: string, principalAmount: number, customRate?: number): number {
    if (!this.rules) return 0;

    const calculator = this.rules.penalty_calculators[calculatorName];
    if (!calculator) return 0;

    const rate = customRate ?? calculator.default_rate;
    const maxRate = calculator.max_rate;

    // Oran sınırını kontrol et
    const effectiveRate = Math.min(rate, maxRate);

    return principalAmount * effectiveRate;
  }

  // ==================== YARDIMCI METODLAR ====================

  // Tüm belge türlerini getir
  getDocumentTypes(): string[] {
    if (!this.rules) return [];
    return Object.keys(this.rules.document_classification.hints);
  }

  // Tüm takip alt kategorilerini getir
  getSubCategories(): string[] {
    if (!this.rules) return [];
    return Object.keys(this.rules.claim_item_sets.templates);
  }

  // Varsayılan para birimini getir
  getDefaultCurrency(): string {
    return this.rules?.defaults.currency || 'TRY';
  }

  // Yuvarlama ayarlarını getir
  getRoundingConfig(): { mode: string; scale: number } {
    return this.rules?.defaults.rounding || { mode: 'HALF_UP', scale: 2 };
  }
}
