import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================
// TİPLER
// ============================================

export type LimitationLevel = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export interface LimitationRule {
  code: string;
  name: string;
  description: string;
  years?: number;
  months?: number;
  start_date_field: string;
  alternative_start_field?: string;
  legal_basis: string;
  applies_to_case_types: string[];
  instrument_types?: string[];
  debtor_roles?: string[];
  notes?: string;
  inherit_from_claim?: boolean;
}

export interface LimitationStatus {
  level: LimitationLevel;
  ruleCode: string;
  ruleName: string;
  expiryDate: Date | null;
  daysLeft: number | null;
  years: number | null;
  baseStartDate: Date | null;
  legalBasis: string;
  message: string;
}

export interface LimitationCheckResult {
  status: LimitationStatus;
  shouldShowModal: boolean;
  modalType: 'YELLOW' | 'RED' | null;
  modalTitle?: string;
  modalMessage?: string;
  suggestions?: string[];
}

export interface EnforcementRecommendation {
  type: string;
  typeName: string;
  score: number;
  limitationStatus: LimitationStatus;
  isRecommended: boolean;
  message?: string;
}

export interface LimitationLogEntry {
  caseId?: string;
  claimTypeCode: string;
  role?: string;
  startDateInput: Date | null;
  baseStartUsed: Date | null;
  expiryDate: Date | null;
  daysLeft: number | null;
  level: LimitationLevel;
  ackAction?: 'PROCEED' | 'BACK' | null;
}

// ============================================
// YAML YAPILAR
// ============================================

interface LimitationRulesConfig {
  version: number;
  engine: string;
  settings: {
    warning_threshold_days: number;
    critical_threshold_days: number;
    enable_logging: boolean;
    block_on_expired: boolean;
  };
  warning_levels: Record<string, {
    code: string;
    label: string;
    color: string;
    description: string;
  }>;
  general_claims: Record<string, LimitationRule>;
  kambiyo_claims: Record<string, LimitationRule>;
  judgment_claims: Record<string, LimitationRule>;
  collateral_claims: Record<string, LimitationRule>;
  recommendation_rules: Record<string, any>;
  modal_texts: Record<string, {
    title: string;
    message: string;
    buttons?: Array<{ code: string; label: string; variant: string }>;
    type?: string;
  }>;
}

// ============================================
// LİMİTATİON ENGİNE SERVİSİ
// ============================================

@Injectable()
export class LimitationEngineService implements OnModuleInit {
  private readonly logger = new Logger(LimitationEngineService.name);
  private rules: LimitationRulesConfig | null = null;
  private allRules: Map<string, LimitationRule> = new Map();

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadRules();
  }

  // ============================================
  // YAML YÜKLEME
  // ============================================

  async loadRules(): Promise<void> {
    try {
      const possiblePaths = [
        path.join(process.cwd(), 'src/config/limitation-rules.yaml'),
        path.join(process.cwd(), 'dist/config/limitation-rules.yaml'),
        path.join(__dirname, '../../config/limitation-rules.yaml'),
        path.join(__dirname, '../../../src/config/limitation-rules.yaml'),
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
        this.rules = yaml.load(fileContent) as LimitationRulesConfig;
        this.buildRulesMap();
        this.logger.log(`✅ Zamanaşımı kuralları yüklendi (v${this.rules?.version}) - ${usedPath}`);
      } else {
        this.logger.warn('limitation-rules.yaml bulunamadı, varsayılan kurallar kullanılacak');
        this.rules = this.getDefaultRules();
        this.buildRulesMap();
      }
    } catch (error) {
      this.logger.error('Zamanaşımı kuralları yüklenemedi:', error);
      this.rules = this.getDefaultRules();
      this.buildRulesMap();
    }
  }

  private buildRulesMap(): void {
    this.allRules.clear();
    if (!this.rules) return;

    // Tüm kural gruplarını birleştir
    const ruleGroups = [
      this.rules.general_claims,
      this.rules.kambiyo_claims,
      this.rules.judgment_claims,
      this.rules.collateral_claims,
    ];

    for (const group of ruleGroups) {
      if (group) {
        for (const [code, rule] of Object.entries(group)) {
          this.allRules.set(code, { ...rule, code });
        }
      }
    }

    this.logger.log(`📋 ${this.allRules.size} zamanaşımı kuralı yüklendi`);
  }

  private getDefaultRules(): LimitationRulesConfig {
    return {
      version: 1,
      engine: 'limitation_engine',
      settings: {
        warning_threshold_days: 90,
        critical_threshold_days: 0,
        enable_logging: true,
        block_on_expired: false,
      },
      warning_levels: {
        GREEN: { code: 'GREEN', label: 'Uygun', color: '#22c55e', description: 'Zamanaşımı süresi yeterli' },
        YELLOW: { code: 'YELLOW', label: 'Yaklaşıyor', color: '#eab308', description: 'Zamanaşımı süresi dolmak üzere' },
        RED: { code: 'RED', label: 'Dolmuş', color: '#ef4444', description: 'Zamanaşımı süresi dolmuş görünüyor' },
        UNKNOWN: { code: 'UNKNOWN', label: 'Hesaplanamadı', color: '#6b7280', description: 'Zamanaşımı hesaplanamadı' },
      },
      general_claims: {
        TBK_10: { code: 'TBK_10', name: 'Adi Alacak', description: 'Genel alacaklar', years: 10, start_date_field: 'maturityDate', legal_basis: 'TBK m.146', applies_to_case_types: ['ILAMSIZ', 'GENEL'] },
        TBK_5_KIRA: { code: 'TBK_5_KIRA', name: 'Kira Alacağı', description: 'Kira bedeli', years: 5, start_date_field: 'maturityDate', legal_basis: 'TBK m.147/1', applies_to_case_types: ['KIRA', 'TAHLIYE'] },
      },
      kambiyo_claims: {
        KAMB_BONO_ASIL: { code: 'KAMB_BONO_ASIL', name: 'Bono - Asıl Borçlu', description: 'Bono asıl borçlu', years: 3, start_date_field: 'maturityDate', legal_basis: 'TTK m.749', applies_to_case_types: ['KAMBIYO'], instrument_types: ['BONO', 'SENET'] },
        KAMB_CEK_KESIDECI: { code: 'KAMB_CEK_KESIDECI', name: 'Çek - Keşideci', description: 'Çek keşideci', years: 3, start_date_field: 'presentationDate', legal_basis: 'TTK m.814', applies_to_case_types: ['KAMBIYO'], instrument_types: ['CEK'] },
      },
      judgment_claims: {
        ILAM_10: { code: 'ILAM_10', name: 'Mahkeme İlamı', description: 'Mahkeme kararı', years: 10, start_date_field: 'judgmentDate', legal_basis: 'TBK m.156', applies_to_case_types: ['ILAMLI'] },
      },
      collateral_claims: {},
      recommendation_rules: {},
      modal_texts: {
        YELLOW: { title: 'Zamanaşımı Yaklaşıyor', message: 'Zamanaşımı süresinin dolmasına {days_left} gün kaldı.' },
        RED: { title: 'Zamanaşımı Riski', message: 'Zamanaşımı süresi dolmuş görünüyor.' },
        UNKNOWN: { title: 'Hesaplanamadı', message: 'Zamanaşımı hesaplanamadı.', type: 'banner' },
      },
    };
  }


  // ============================================
  // ANA HESAPLAMA FONKSİYONLARI
  // ============================================

  /**
   * Zamanaşımı süresini yıl olarak getir
   */
  getLimitationYears(claimTypeCode: string, role?: string): number | null {
    const rule = this.allRules.get(claimTypeCode);
    if (!rule) return null;

    // Rol bazlı kontrol (kambiyo için)
    if (role && rule.debtor_roles && !rule.debtor_roles.includes(role)) {
      // Bu rol için farklı kural ara
      for (const [, r] of this.allRules) {
        if (r.debtor_roles?.includes(role) && 
            r.applies_to_case_types.some(t => rule.applies_to_case_types.includes(t))) {
          return r.years ?? (r.months ? r.months / 12 : null);
        }
      }
    }

    if (rule.years) return rule.years;
    if (rule.months) return rule.months / 12;
    return null;
  }

  /**
   * Tarihe yıl ekle (kesirli yıllar için ay hesabı)
   * Şubat ayı taşmalarını (29, 30, 31) 1 Mart'a yuvarlar
   */
  private addYears(date: Date, yearsFloat: number): Date {
    const result = new Date(date);
    const originalDay = result.getDate();
    
    if (Number.isInteger(yearsFloat)) {
      result.setFullYear(result.getFullYear() + yearsFloat);
    } else {
      const months = Math.round(yearsFloat * 12);
      result.setMonth(result.getMonth() + months);
    }
    
    // Eğer gün değiştiyse (ay taşması), bir sonraki ayın 1'ine ayarla
    // Örnek: 31 Ocak + 1 ay = 3 Mart yerine 1 Mart olmalı
    // JavaScript Date otomatik olarak taşırır (31 Şubat -> 3 Mart)
    // Biz bunu 1 Mart'a yuvarlıyoruz
    if (result.getDate() !== originalDay) {
      // Ay taşması olmuş, bir sonraki ayın 1'ine ayarla
      result.setDate(1);
    }
    
    return result;
  }

  /**
   * Zamanaşımı durumunu hesapla
   */
  computeLimitationStatus(payload: {
    claimTypeCode: string;
    startDate?: Date | string | null;
    role?: string;
    lastInterruptionDate?: Date | string | null;
  }): LimitationStatus {
    const { claimTypeCode, startDate, role, lastInterruptionDate } = payload;

    const rule = this.allRules.get(claimTypeCode);
    if (!rule) {
      return this.createUnknownStatus('Alacak türü bulunamadı');
    }

    const years = this.getLimitationYears(claimTypeCode, role);
    if (years === null) {
      return this.createUnknownStatus('Zamanaşımı süresi tanımlı değil', rule);
    }

    // Başlangıç tarihi kontrolü
    let baseStart: Date | null = null;
    if (startDate) {
      baseStart = typeof startDate === 'string' ? new Date(startDate) : startDate;
    }

    if (!baseStart || isNaN(baseStart.getTime())) {
      return this.createUnknownStatus('Başlangıç tarihi eksik veya geçersiz', rule);
    }

    // Kesilme tarihi varsa onu kullan
    if (lastInterruptionDate) {
      const interruptDate = typeof lastInterruptionDate === 'string' 
        ? new Date(lastInterruptionDate) 
        : lastInterruptionDate;
      if (interruptDate > baseStart) {
        baseStart = interruptDate;
      }
    }

    // Bitiş tarihini hesapla
    const expiryDate = this.addYears(baseStart, years);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Seviye belirle
    const settings = this.rules?.settings || { warning_threshold_days: 90, critical_threshold_days: 0 };
    let level: LimitationLevel;
    let message: string;

    if (daysLeft <= settings.critical_threshold_days) {
      level = 'RED';
      message = `Zamanaşımı süresi dolmuş görünüyor (${Math.abs(daysLeft)} gün önce)`;
    } else if (daysLeft <= settings.warning_threshold_days) {
      level = 'YELLOW';
      message = `Zamanaşımı süresinin dolmasına ${daysLeft} gün kaldı`;
    } else {
      level = 'GREEN';
      message = `Zamanaşımı süresi uygun (${daysLeft} gün kaldı)`;
    }

    return {
      level,
      ruleCode: claimTypeCode,
      ruleName: rule.name,
      expiryDate,
      daysLeft,
      years,
      baseStartDate: baseStart,
      legalBasis: rule.legal_basis,
      message,
    };
  }

  private createUnknownStatus(message: string, rule?: LimitationRule): LimitationStatus {
    return {
      level: 'UNKNOWN',
      ruleCode: rule?.code || 'UNKNOWN',
      ruleName: rule?.name || 'Bilinmiyor',
      expiryDate: null,
      daysLeft: null,
      years: null,
      baseStartDate: null,
      legalBasis: rule?.legal_basis || '',
      message,
    };
  }

  // ============================================
  // TAKİP BAŞLATMA KONTROLÜ
  // ============================================

  /**
   * Takip başlatma öncesi zamanaşımı kontrolü
   */
  async checkBeforeEnforcement(payload: {
    caseType: string;
    claimTypeCode?: string;
    startDate?: Date | string | null;
    instrumentType?: string;
    role?: string;
    lastInterruptionDate?: Date | string | null;
  }): Promise<LimitationCheckResult> {
    const { caseType, claimTypeCode, startDate, instrumentType, role } = payload;

    // Alacak türü kodunu belirle
    let effectiveClaimCode: string | null | undefined = claimTypeCode;
    if (!effectiveClaimCode) {
      effectiveClaimCode = this.inferClaimTypeCode(caseType, instrumentType, role);
    }

    if (!effectiveClaimCode) {
      return {
        status: this.createUnknownStatus('Alacak türü belirlenemedi'),
        shouldShowModal: false,
        modalType: null,
      };
    }

    const status = this.computeLimitationStatus({
      claimTypeCode: effectiveClaimCode,
      startDate,
      role,
      lastInterruptionDate: payload.lastInterruptionDate,
    });

    // Modal gösterilmeli mi?
    const shouldShowModal = status.level === 'YELLOW' || status.level === 'RED';
    const modalType = shouldShowModal ? status.level as 'YELLOW' | 'RED' : null;

    // Modal metinlerini al
    let modalTitle: string | undefined;
    let modalMessage: string | undefined;

    if (modalType && this.rules?.modal_texts[modalType]) {
      const modalConfig = this.rules.modal_texts[modalType];
      modalTitle = modalConfig.title;
      modalMessage = modalConfig.message.replace('{days_left}', String(Math.abs(status.daysLeft || 0)));
    }

    // Öneriler
    const suggestions: string[] = [];
    if (status.level === 'RED' && caseType === 'KAMBIYO') {
      suggestions.push('Kambiyo zamanaşımı dolmuş görünüyor. Genel haciz yolu denenebilir ancak itiraz riski yüksektir.');
    }

    return {
      status,
      shouldShowModal,
      modalType,
      modalTitle,
      modalMessage,
      suggestions,
    };
  }

  /**
   * Takip türü ve senet türünden alacak kodu çıkar
   */
  private inferClaimTypeCode(caseType: string, instrumentType?: string, role?: string): string | null {
    // Kambiyo takibi
    if (caseType === 'KAMBIYO') {
      if (instrumentType === 'CEK') {
        return role === 'CIRANTA' ? 'KAMB_CEK_CIRANTA' : 'KAMB_CEK_KESIDECI';
      }
      if (instrumentType === 'BONO' || instrumentType === 'SENET') {
        return role === 'CIRANTA' ? 'KAMB_BONO_CIRANTA' : 'KAMB_BONO_ASIL';
      }
      return 'KAMB_BONO_ASIL'; // Varsayılan
    }

    // İlamlı takip
    if (caseType === 'ILAMLI') {
      return 'ILAM_10';
    }

    // Nafaka takibi
    if (caseType === 'NAFAKA') {
      return 'NAFAKA_10';
    }

    // Kira takibi
    if (caseType === 'KIRA' || caseType === 'TAHLIYE') {
      return 'TBK_5_KIRA';
    }

    // Genel ilamsız (fatura, genel alacak vb.)
    if (caseType === 'ILAMSIZ' || caseType === 'GENEL' || caseType === 'FATURA') {
      return 'TBK_10';
    }

    // Varsayılan olarak genel alacak
    return 'TBK_10';
  }

  // ============================================
  // TAKİP TÜRÜ ÖNERİ MOTORU
  // ============================================

  /**
   * Takip türü önerisi üret
   */
  async recommendEnforcementType(input: {
    hasJudgment?: boolean;
    judgmentDate?: Date | string | null;
    hasInstrument?: boolean;
    instrumentType?: string;
    instrumentStartDate?: Date | string | null;
    generalStartDate?: Date | string | null;
    role?: string;
  }): Promise<EnforcementRecommendation[]> {
    const recommendations: EnforcementRecommendation[] = [];

    // 1. İlam varsa
    if (input.hasJudgment) {
      const status = this.computeLimitationStatus({
        claimTypeCode: 'ILAM_10',
        startDate: input.judgmentDate,
      });
      recommendations.push({
        type: 'ILAMLI',
        typeName: 'İlamlı Takip',
        score: 100,
        limitationStatus: status,
        isRecommended: status.level !== 'RED',
        message: status.level === 'RED' 
          ? 'İlam zamanaşımı dolmuş görünüyor' 
          : 'Mahkeme kararı mevcut - en güçlü dayanak',
      });
    }

    // 2. Kambiyo senedi varsa
    if (input.hasInstrument && input.instrumentType) {
      const claimCode = this.inferClaimTypeCode('KAMBIYO', input.instrumentType, input.role);
      if (claimCode) {
        const status = this.computeLimitationStatus({
          claimTypeCode: claimCode,
          startDate: input.instrumentStartDate,
          role: input.role,
        });

        const score = status.level === 'RED' ? 40 : 90;
        recommendations.push({
          type: 'KAMBIYO',
          typeName: 'Kambiyo Takibi',
          score,
          limitationStatus: status,
          isRecommended: status.level !== 'RED',
          message: status.level === 'RED'
            ? 'Kambiyo zamanaşımı dolmuş - itiraz riski yüksek'
            : 'Kambiyo senedi mevcut ve süre uygun',
        });

        // Kambiyo dolmuşsa genel haciz alternatifi
        if (status.level === 'RED') {
          const generalStatus = this.computeLimitationStatus({
            claimTypeCode: 'TBK_10',
            startDate: input.generalStartDate || input.instrumentStartDate,
          });
          recommendations.push({
            type: 'ILAMSIZ',
            typeName: 'Genel Haciz (Alternatif)',
            score: 70,
            limitationStatus: generalStatus,
            isRecommended: generalStatus.level !== 'RED',
            message: 'Kambiyo zamanaşımı dolmuş - genel haciz denenebilir',
          });
        }
      }
    }

    // 3. Hiçbiri yoksa genel haciz
    if (recommendations.length === 0) {
      const status = this.computeLimitationStatus({
        claimTypeCode: 'TBK_10',
        startDate: input.generalStartDate,
      });
      recommendations.push({
        type: 'ILAMSIZ',
        typeName: 'Genel Haciz',
        score: 80,
        limitationStatus: status,
        isRecommended: status.level !== 'RED',
      });
    }

    // Skora göre sırala
    recommendations.sort((a, b) => b.score - a.score);

    return recommendations;
  }

  // ============================================
  // RİSK LOG
  // ============================================

  /**
   * Zamanaşımı risk logunu kaydet
   */
  async logLimitationRisk(
    tenantId: string,
    userId: string,
    caseId: string | null,
    entry: LimitationLogEntry,
  ): Promise<void> {
    if (!this.rules?.settings.enable_logging) return;

    try {
      // LimitationRiskLog modeli varsa kaydet
      await (this.prisma as any).limitationRiskLog?.create({
        data: {
          tenantId,
          userId,
          caseId,
          riskType: 'LIMITATION',
          level: entry.level,
          claimTypeCode: entry.claimTypeCode,
          role: entry.role,
          startDateInput: entry.startDateInput,
          baseStartUsed: entry.baseStartUsed,
          expiryDate: entry.expiryDate,
          daysLeft: entry.daysLeft,
          ackAction: entry.ackAction,
          ackAt: entry.ackAction ? new Date() : null,
        },
      });
    } catch (error) {
      // Model henüz migrate edilmemiş olabilir
      this.logger.debug('LimitationRiskLog kaydedilemedi (model henüz yok olabilir)');
    }
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Tüm zamanaşımı kurallarını getir
   */
  getAllRules(): LimitationRule[] {
    return Array.from(this.allRules.values());
  }

  /**
   * Belirli takip türü için kuralları getir
   */
  getRulesForCaseType(caseType: string): LimitationRule[] {
    return Array.from(this.allRules.values()).filter(
      rule => rule.applies_to_case_types.includes(caseType)
    );
  }

  /**
   * Uyarı seviyesi bilgilerini getir
   */
  getWarningLevelInfo(level: LimitationLevel): { label: string; color: string; description: string } | null {
    return this.rules?.warning_levels[level] || null;
  }

  /**
   * Ayarları getir
   */
  getSettings(): { warning_threshold_days: number; critical_threshold_days: number; block_on_expired: boolean } {
    return this.rules?.settings || {
      warning_threshold_days: 90,
      critical_threshold_days: 0,
      block_on_expired: false,
    };
  }

  /**
   * Modal metinlerini getir
   */
  getModalTexts(level: 'YELLOW' | 'RED' | 'UNKNOWN'): { title: string; message: string } | null {
    return this.rules?.modal_texts[level] || null;
  }
}
