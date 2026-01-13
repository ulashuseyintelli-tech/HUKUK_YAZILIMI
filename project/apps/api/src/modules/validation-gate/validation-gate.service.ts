import { Injectable, OnModuleInit, Logger, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// Shared contracts
import type {
  GateCode,
  GateResult,
  GateValidationResult as SharedGateValidationResult,
  ValidationError as SharedValidationError,
  GateSeverity,
} from '@shared/types';

/**
 * @deprecated Use policy-engine/gate-checker instead
 * 
 * Bu servis artık sadece adapter görevi görüyor.
 * Yeni kod için: import { GateCheckerService } from '@/modules/policy-engine'
 * 
 * Migration planı:
 * 1. Tüm validateGate() çağrıları policy-engine'e taşınacak
 * 2. Bu modül Phase 3 sonunda silinecek
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

// Gate tipleri - artık shared types'dan geliyor
export type GateId = 
  | 'GATE_1_CASE_CREATION'
  | 'GATE_2_ORNEK1_GENERATION'
  | 'GATE_3_SERVICE_OF_PROCESS'
  | 'GATE_4_UYAP_INTEGRATION';

// Local types (backward compatibility için)
export interface ValidationError {
  id: string;
  path: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  field?: string;
}

export interface GateValidationResult {
  gateId: GateId;
  gateName: string;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  checkedFields: string[];
  missingFields: string[];
  suggestions?: string[];
}

// YAML kural yapısı
interface ValidationRule {
  path: string;
  rule: string;
  params?: Record<string, any>;
  severity: 'ERROR' | 'WARNING';
  message: string;
  on_fail_action?: string;
}

interface BendDefinition {
  name: string;
  applies_to: string[] | 'ALL';
  required_at_gates: GateId[];
  fields: ValidationRule[];
  conditional?: {
    when: Record<string, any>;
    required_at_gates: GateId[];
    fields: ValidationRule[];
  };
}

interface TypeSpecificRule {
  required_at_gates: GateId[];
  fields: ValidationRule[];
  auto_items?: any[];
  optional_items?: any[];
}

interface MasterValidations {
  version: number;
  engine: string;
  policies: Record<string, any>;
  case_types: Array<{ code: string; name: string; category: string }>;
  gates: Array<{ id: GateId; name: string; description: string }>;
  ornek1_bends: Record<string, BendDefinition>;
  type_specific_rules: Record<string, TypeSpecificRule>;
  uyap_submission_rules: TypeSpecificRule;
  auto_suggestions: Record<string, any>;
}

@Injectable()
export class ValidationGateService implements OnModuleInit {
  private readonly logger = new Logger(ValidationGateService.name);
  private rules: MasterValidations | null = null;
  private deprecationWarned = false;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadRules();
    
    // Deprecation warning (sadece bir kez)
    if (!this.deprecationWarned && process.env.NODE_ENV !== 'test') {
      this.logger.warn(
        '⚠️ ValidationGateService is DEPRECATED. Use policy-engine/gate-checker instead. ' +
        'See ARCHITECTURE.md for migration guide.'
      );
      this.deprecationWarned = true;
    }
  }

  // YAML kurallarini yukle
  async loadRules(): Promise<void> {
    try {
      const possiblePaths = [
        path.join(process.cwd(), 'src/config/master-validations.yaml'),
        path.join(process.cwd(), 'dist/config/master-validations.yaml'),
        path.join(__dirname, '../../config/master-validations.yaml'),
        path.join(__dirname, '../../../src/config/master-validations.yaml'),
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
        this.rules = yaml.load(fileContent) as MasterValidations;
        this.logger.log(`Validation kuralları yüklendi (v${this.rules?.version}) - ${usedPath}`);
      } else {
        this.logger.warn('master-validations.yaml bulunamadı, varsayılan kurallar kullanılacak');
        this.rules = this.getDefaultRules();
      }
    } catch (error) {
      this.logger.error('Validation kuralları yüklenemedi:', error);
      this.rules = this.getDefaultRules();
    }
  }

  // Varsayilan kurallar
  private getDefaultRules(): MasterValidations {
    return {
      version: 1,
      engine: 'enforcement_master_validations',
      policies: {
        address_policy: { allow_case_creation_without_address: true },
        check_policy: { bad_check_compensation_default_on: true, bad_check_compensation_rate: 0.10 },
      },
      case_types: [],
      gates: [
        { id: 'GATE_1_CASE_CREATION', name: 'Takip Olusturma', description: '' },
        { id: 'GATE_2_ORNEK1_GENERATION', name: 'Ornek 1 Uretimi', description: '' },
        { id: 'GATE_3_SERVICE_OF_PROCESS', name: 'Tebligat', description: '' },
        { id: 'GATE_4_UYAP_INTEGRATION', name: 'UYAP Gonderimi', description: '' },
      ],
      ornek1_bends: {},
      type_specific_rules: {},
      uyap_submission_rules: { required_at_gates: [], fields: [] },
      auto_suggestions: {},
    };
  }

  // Kurallari getir
  getRules(): MasterValidations | null {
    return this.rules;
  }

  // Politika degerini getir
  getPolicy(key: string): any {
    if (!this.rules) return null;
    const parts = key.split('.');
    let value: any = this.rules.policies;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  }

  // ==================== ANA VALİDASYON FONKSİYONU ====================

  /**
   * Belirli bir gate icin dosyayi validate et
   */
  async validateGate(
    caseId: string,
    gateId: GateId,
    additionalData?: Record<string, any>
  ): Promise<GateValidationResult> {
    if (!this.rules) {
      return this.createEmptyResult(gateId, 'Kurallar yuklenemedi');
    }

    // Gate bilgisini al
    const gate = this.rules.gates.find(g => g.id === gateId);
    if (!gate) {
      return this.createEmptyResult(gateId, 'Gate bulunamadi');
    }

    // Dosya verisini al
    const caseData = await this.getCaseData(caseId);
    if (!caseData) {
      return {
        gateId,
        gateName: gate.name,
        isValid: false,
        errors: [{ id: 'case_not_found', path: 'case', severity: 'ERROR', message: 'Dosya bulunamadi' }],
        warnings: [],
        checkedFields: [],
        missingFields: [],
      };
    }

    // Takip turunu belirle
    const caseType = this.determineCaseType(caseData);

    // Validasyon sonuclari
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const checkedFields: string[] = [];
    const missingFields: string[] = [];

    // 1. Ornek1 bent kurallarini kontrol et
    for (const [bendKey, bend] of Object.entries(this.rules.ornek1_bends)) {
      // Bu bent bu gate icin gecerli mi?
      if (!bend.required_at_gates.includes(gateId)) continue;

      // Bu bent bu takip tipi icin gecerli mi?
      if (bend.applies_to !== 'ALL' && !bend.applies_to.includes(caseType)) continue;

      // Kosullu bent mi?
      if (bend.conditional) {
        const conditionMet = this.checkCondition(bend.conditional.when, caseData, additionalData);
        if (!conditionMet) continue;
      }

      // Alanlari kontrol et
      for (const field of bend.fields) {
        checkedFields.push(field.path);
        const result = this.validateField(field, caseData, additionalData);
        
        if (!result.valid) {
          missingFields.push(field.path);
          const error: ValidationError = {
            id: `${bendKey}_${field.path}`,
            path: field.path,
            severity: field.severity,
            message: field.message,
            field: field.path.split('.').pop(),
          };
          
          if (field.severity === 'ERROR') {
            errors.push(error);
          } else {
            warnings.push(error);
          }
        }
      }
    }

    // 2. Takip tipine ozel kurallari kontrol et
    const typeRules = this.rules.type_specific_rules[caseType];
    if (typeRules && typeRules.required_at_gates.includes(gateId)) {
      for (const field of typeRules.fields) {
        checkedFields.push(field.path);
        const result = this.validateField(field, caseData, additionalData);
        
        if (!result.valid) {
          missingFields.push(field.path);
          const error: ValidationError = {
            id: `type_${caseType}_${field.path}`,
            path: field.path,
            severity: field.severity,
            message: field.message,
            field: field.path.split('.').pop(),
          };
          
          if (field.severity === 'ERROR') {
            errors.push(error);
          } else {
            warnings.push(error);
          }
        }
      }
    }

    // 3. UYAP gonderim kurallarini kontrol et (Gate 4)
    if (gateId === 'GATE_4_UYAP_INTEGRATION') {
      for (const field of this.rules.uyap_submission_rules.fields) {
        checkedFields.push(field.path);
        const result = this.validateField(field, caseData, additionalData);
        
        if (!result.valid) {
          missingFields.push(field.path);
          errors.push({
            id: `uyap_${field.path}`,
            path: field.path,
            severity: 'ERROR',
            message: field.message,
            field: field.path.split('.').pop(),
          });
        }
      }
    }

    // Sonucu kaydet
    await this.saveValidationResult(caseId, gateId, gate.name, errors, warnings, checkedFields, missingFields);

    return {
      gateId,
      gateName: gate.name,
      isValid: errors.length === 0,
      errors,
      warnings,
      checkedFields,
      missingFields,
      suggestions: this.getSuggestions(caseType, missingFields),
    };
  }

  // ==================== YARDIMCI FONKSİYONLAR ====================

  /**
   * Dosya verisini al
   */
  private async getCaseData(caseId: string): Promise<any> {
    try {
      const caseData = await this.prisma.case.findUnique({
        where: { id: caseId },
        include: {
          client: true,
          debtors: {
            include: {
              debtor: {
                include: { debtorAddresses: true }
              }
            }
          },
          lawyers: { include: { lawyer: true } },
          dues: true,
          claimItems: true,
          executionOffice: true,
          caseClients: { include: { client: true } },
        },
      });

      if (!caseData) return null;

      // Ek modelleri kontrol et (varsa)
      let instrument = null;
      let lease = null;
      let judgment = null;
      let collateral = null;

      try {
        instrument = await this.prisma.caseInstrument.findFirst({ where: { caseId } });
      } catch { /* Model sorgusu başarısız */ }

      try {
        lease = await this.prisma.caseLease.findFirst({ where: { caseId } });
      } catch { /* Model sorgusu başarısız */ }

      try {
        judgment = await this.prisma.caseJudgment.findFirst({ where: { caseId } });
      } catch { /* Model sorgusu başarısız */ }

      try {
        collateral = await this.prisma.caseCollateral.findFirst({ where: { caseId } });
      } catch { /* Model sorgusu başarısız */ }

      return {
        ...caseData,
        instrument,
        lease,
        judgment,
        collateral,
        clients: caseData.caseClients?.map(cc => cc.client) || (caseData.client ? [caseData.client] : []),
      };
    } catch (error) {
      this.logger.error(`Dosya verisi alinamadi: ${caseId}`, error);
      return null;
    }
  }

  /**
   * Takip turunu belirle
   */
  private determineCaseType(caseData: any): string {
    // Oncelik: takipTuru lookup
    if (caseData.takipTuru?.code) {
      return caseData.takipTuru.code;
    }

    // Mahiyet koduna gore
    if (caseData.mahiyetKodu) {
      const mahiyetMap: Record<string, string> = {
        'CEK': 'KAMBIYO_CEK',
        'SENET': 'KAMBIYO_SENET',
        'KIRA': 'KIRA_ALACAGI',
        'NAFAKA': 'ILAMLI_NAFAKA',
        'TAZMINAT': 'ILAMLI_GENEL',
      };
      if (mahiyetMap[caseData.mahiyetKodu]) {
        return mahiyetMap[caseData.mahiyetKodu];
      }
    }

    // SubCategory'ye gore
    if (caseData.subCategory) {
      const subCategoryMap: Record<string, string> = {
        'CEK': 'KAMBIYO_CEK',
        'SENET': 'KAMBIYO_SENET',
        'KIRA': 'KIRA_ALACAGI',
        'NAFAKA': 'ILAMLI_NAFAKA',
        'DOVIZ': 'ILAMLI_DOVIZ',
        'GENEL': 'ILAMSIZ_GENEL',
      };
      if (subCategoryMap[caseData.subCategory]) {
        return subCategoryMap[caseData.subCategory];
      }
    }

    // Varsayilan
    return 'ILAMSIZ_GENEL';
  }

  /**
   * Kosulu kontrol et
   */
  private checkCondition(condition: Record<string, any>, caseData: any, additionalData?: Record<string, any>): boolean {
    for (const [key, expectedValue] of Object.entries(condition)) {
      const actualValue = this.getNestedValue({ case: caseData, wizard: additionalData }, key);
      if (actualValue !== expectedValue) {
        return false;
      }
    }
    return true;
  }

  /**
   * Alani validate et
   */
  private validateField(
    field: ValidationRule,
    caseData: any,
    additionalData?: Record<string, any>
  ): { valid: boolean; value?: any } {
    const value = this.getNestedValue({ case: caseData, wizard: additionalData }, field.path);

    switch (field.rule) {
      case 'exists':
        return { valid: value !== null && value !== undefined && value !== '', value };

      case 'min_count':
        const minCount = field.params?.min || 1;
        return { valid: Array.isArray(value) && value.length >= minCount, value };

      case 'has_item_type':
        const itemType = field.params?.type;
        if (!Array.isArray(value)) return { valid: false };
        return { valid: value.some((item: any) => item.type === itemType || item.itemType === itemType), value };

      case 'total_positive':
        if (!Array.isArray(value)) return { valid: false };
        const total = value.reduce((sum: number, item: any) => sum + (parseFloat(item.amount) || 0), 0);
        return { valid: total > 0, value: total };

      case 'positive':
        return { valid: parseFloat(value) > 0, value };

      case 'identity_valid':
        // TCKN (11 hane) veya VKN (10 hane) kontrolu
        if (!value) return { valid: false };
        const identity = value.tckn || value.vkn || value.identityNo || value;
        return { valid: typeof identity === 'string' && (identity.length === 11 || identity.length === 10), value };

      case 'optional_at_gate':
        // Opsiyonel - her zaman gecerli, sadece uyari
        return { valid: true, value };

      case 'warning_if_missing':
        // Uyari seviyesinde - eksikse bile gecerli
        return { valid: true, value };

      case 'equals':
        return { valid: value === field.params?.value, value };

      case 'not_equals':
        return { valid: value !== field.params?.value, value };

      case 'has_signer':
        // Imza yetkili avukat var mi
        if (!Array.isArray(value)) return { valid: false };
        return { valid: value.some((l: any) => l.canSign || l.hasSignatureAuthority), value };

      case 'issue_before_maturity':
        // Kesid tarihi vade tarihinden once mi
        if (!value?.issueDate || !value?.maturityDate) return { valid: false };
        return { valid: new Date(value.issueDate) <= new Date(value.maturityDate), value };

      default:
        return { valid: true, value };
    }
  }

  /**
   * Ic ice nesne degerini al
   */
  private getNestedValue(obj: any, path: string): any {
    // case.debtors[0].name veya case.debtors[*].address gibi path'leri isle
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;

      // Array index kontrolu: [0], [*]
      const arrayMatch = part.match(/^(\w+)\[(\d+|\*)\]$/);
      if (arrayMatch) {
        const [, key, index] = arrayMatch;
        current = current[key];
        if (!Array.isArray(current)) return undefined;
        
        if (index === '*') {
          // Tum elemanlari kontrol et - en az biri varsa true
          return current.length > 0 ? current : undefined;
        } else {
          current = current[parseInt(index, 10)];
        }
      } else {
        current = current[part];
      }
    }

    return current;
  }

  /**
   * Bos sonuc olustur
   */
  private createEmptyResult(gateId: GateId, errorMessage: string): GateValidationResult {
    return {
      gateId,
      gateName: gateId,
      isValid: false,
      errors: [{ id: 'system_error', path: '', severity: 'ERROR', message: errorMessage }],
      warnings: [],
      checkedFields: [],
      missingFields: [],
    };
  }

  /**
   * Onerileri getir
   */
  private getSuggestions(caseType: string, missingFields: string[]): string[] {
    const suggestions: string[] = [];

    // Adres eksikse
    if (missingFields.some(f => f.includes('address') || f.includes('Address'))) {
      const addressPolicy = this.getPolicy('address_policy.address_help_suggestions');
      if (Array.isArray(addressPolicy)) {
        suggestions.push(...addressPolicy.map((s: any) => s.label || s));
      }
    }

    // Cek tazminati onerileri
    if (caseType === 'KAMBIYO_CEK') {
      const checkPolicy = this.getPolicy('check_policy');
      if (checkPolicy?.bad_check_compensation_default_on) {
        suggestions.push('Karşılıksız çek tazminatı (%10) otomatik eklenecektir');
      }
    }

    return suggestions;
  }

  /**
   * Validasyon sonucunu kaydet
   */
  private async saveValidationResult(
    caseId: string,
    gateId: GateId,
    gateName: string,
    errors: ValidationError[],
    warnings: ValidationError[],
    checkedFields: string[],
    missingFields: string[]
  ): Promise<void> {
    try {
      // ValidationResult modeli varsa kaydet
      const caseData = await this.prisma.case.findUnique({ where: { id: caseId }, select: { tenantId: true } });
      if (!caseData) return;

      await (this.prisma as any).validationResult?.create({
        data: {
          tenantId: caseData.tenantId,
          caseId,
          gateId,
          gateName,
          isValid: errors.length === 0,
          errors: errors,
          warnings: warnings,
          checkedFields: checkedFields,
          missingFields: missingFields,
        },
      });
    } catch (error) {
      // Model henuz migrate edilmemis olabilir
      this.logger.debug('ValidationResult kaydedilemedi (model henuz yok olabilir)');
    }
  }

  // ==================== PUBLIC API ====================

  /**
   * Tum gate'leri validate et
   */
  async validateAllGates(caseId: string, additionalData?: Record<string, any>): Promise<Record<GateId, GateValidationResult>> {
    const results: Record<string, GateValidationResult> = {};
    
    for (const gate of this.rules?.gates || []) {
      results[gate.id] = await this.validateGate(caseId, gate.id, additionalData);
    }

    return results as Record<GateId, GateValidationResult>;
  }

  /**
   * Cek tazminati otomatik eklenecek mi?
   */
  shouldAddCheckCompensation(caseType: string): boolean {
    if (caseType !== 'KAMBIYO_CEK') return false;
    return this.getPolicy('check_policy.bad_check_compensation_default_on') === true;
  }

  /**
   * Cek tazminati oranini getir
   */
  getCheckCompensationRate(): number {
    return this.getPolicy('check_policy.bad_check_compensation_rate') || 0.10;
  }

  /**
   * Adres eksik task olusturulmali mi?
   */
  shouldCreateAddressTask(): boolean {
    return this.getPolicy('address_policy.create_task_when_address_missing') === true;
  }

  /**
   * Adres onerileri
   */
  getAddressSuggestions(): Array<{ method: string; label: string; description: string }> {
    return this.getPolicy('address_policy.address_help_suggestions') || [];
  }
}
