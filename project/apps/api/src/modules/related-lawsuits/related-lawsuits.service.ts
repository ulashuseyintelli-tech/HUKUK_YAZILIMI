import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TemplateEngineService } from '../template-engine/template-engine.service';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// ============================================
// TİPLER
// ============================================

export interface LawsuitDeadline {
  sikayet_suresi_ay?: number;
  mutlak_sure_yil?: number;
  dava_suresi_yil?: number;
  dava_suresi_ay?: number;
  dava_zamanaşımı_yil?: number;
  start_date_field?: string;
}

export interface LawsuitType {
  code: string;
  name: string;
  category: 'CEZA' | 'HUKUK';
  uyap_dava_turu: string;
  description: string;
  applies_to_case_types: string[];
  applies_to_instruments?: string[];
  available_stages: string[];
  prerequisites?: string[];
  deadlines?: LawsuitDeadline;
  court_type: string;
  venue_rule?: string;
  template_code: string;
  auto_calculate?: boolean;
  show_deadline_warning?: boolean;
  optional?: boolean;
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_note?: string;
  opened_by?: 'CREDITOR' | 'DEBTOR';
  benefits?: string[];
  warnings?: {
    approaching?: string;
    expired?: string;
  };
}

export interface LawsuitAvailability {
  lawsuit: LawsuitType;
  isAvailable: boolean;
  deadlineStatus: {
    expiryDate: Date | null;
    daysLeft: number | null;
    isExpired: boolean;
    isApproaching: boolean;
  } | null;
  reason?: string;
}

export interface LawsuitRecommendation {
  lawsuit: LawsuitType;
  priority: number;
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  actionButton: string;
}

// ============================================
// YAML YAPILAR
// ============================================

interface RelatedLawsuitsConfig {
  version: number;
  engine: string;
  lawsuit_types: Record<string, LawsuitType>;
  stage_rules: Record<string, {
    label: string;
    description: string;
    available_lawsuits: string[];
  }>;
  templates: Record<string, any>;
  warning_rules: Record<string, any>;
}

// ============================================
// RELATED LAWSUITS SERVİSİ
// ============================================

@Injectable()
export class RelatedLawsuitsService implements OnModuleInit {
  private readonly logger = new Logger(RelatedLawsuitsService.name);
  private config: RelatedLawsuitsConfig | null = null;

  constructor(
    private prisma: PrismaService,
    private templateEngine: TemplateEngineService,
  ) {}

  async onModuleInit() {
    await this.loadConfig();
  }

  // ============================================
  // YAML YÜKLEME
  // ============================================

  async loadConfig(): Promise<void> {
    try {
      const possiblePaths = [
        path.join(process.cwd(), 'src/config/related-lawsuits.yaml'),
        path.join(process.cwd(), 'dist/config/related-lawsuits.yaml'),
        path.join(__dirname, '../../config/related-lawsuits.yaml'),
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
        this.config = yaml.load(fileContent) as RelatedLawsuitsConfig;
        this.logger.log(`✅ İlgili davalar kuralları yüklendi (v${this.config?.version}) - ${usedPath}`);
      } else {
        this.logger.warn('related-lawsuits.yaml bulunamadı');
      }
    } catch (error) {
      this.logger.error('İlgili davalar kuralları yüklenemedi:', error);
    }
  }

  // ============================================
  // DAVA TÜRLERİNİ GETİR
  // ============================================

  /**
   * Tüm dava türlerini getir
   */
  getAllLawsuitTypes(): LawsuitType[] {
    if (!this.config?.lawsuit_types) return [];
    return Object.values(this.config.lawsuit_types);
  }

  /**
   * Belirli bir dava türünü getir
   */
  getLawsuitType(code: string): LawsuitType | null {
    return this.config?.lawsuit_types[code] || null;
  }

  /**
   * Takip türüne göre dava türlerini getir
   */
  getLawsuitTypesForCaseType(caseType: string): LawsuitType[] {
    if (!this.config?.lawsuit_types) return [];
    return Object.values(this.config.lawsuit_types).filter(
      lt => lt.applies_to_case_types.includes(caseType)
    );
  }

  /**
   * Aşamaya göre açılabilecek davaları getir
   */
  getLawsuitTypesForStage(stage: string): LawsuitType[] {
    if (!this.config?.lawsuit_types) return [];
    return Object.values(this.config.lawsuit_types).filter(
      lt => lt.available_stages.includes(stage)
    );
  }

  // ============================================
  // DAVA UYGUNLUĞİ KONTROLÜ
  // ============================================

  /**
   * Bir dosya için açılabilecek davaları kontrol et
   */
  checkAvailableLawsuits(payload: {
    caseType: string;
    stage: string;
    instrumentType?: string;
    instrumentDates?: {
      presentationDate?: Date | string;
      maturityDate?: Date | string;
      objectionDate?: Date | string;
    };
  }): LawsuitAvailability[] {
    const { caseType, stage, instrumentType, instrumentDates } = payload;
    const results: LawsuitAvailability[] = [];

    this.logger.debug(`checkAvailableLawsuits çağrıldı: caseType=${caseType}, stage=${stage}, instrumentType=${instrumentType}`);

    if (!this.config?.lawsuit_types) {
      this.logger.warn('Config yüklenmemiş veya lawsuit_types boş');
      return results;
    }

    for (const lawsuit of Object.values(this.config.lawsuit_types)) {
      // Takip türü kontrolü
      if (!lawsuit.applies_to_case_types.includes(caseType)) {
        this.logger.debug(`${lawsuit.code}: caseType ${caseType} uyuşmuyor (beklenen: ${lawsuit.applies_to_case_types.join(', ')})`);
        continue;
      }

      // Aşama kontrolü
      if (!lawsuit.available_stages.includes(stage)) {
        this.logger.debug(`${lawsuit.code}: stage ${stage} uyuşmuyor (beklenen: ${lawsuit.available_stages.join(', ')})`);
        results.push({
          lawsuit,
          isAvailable: false,
          deadlineStatus: null,
          reason: `Bu aşamada açılamaz (${stage})`,
        });
        continue;
      }

      // Senet türü kontrolü (varsa)
      if (lawsuit.applies_to_instruments && instrumentType) {
        if (!lawsuit.applies_to_instruments.includes(instrumentType)) {
          this.logger.debug(`${lawsuit.code}: instrumentType ${instrumentType} uyuşmuyor (beklenen: ${lawsuit.applies_to_instruments.join(', ')})`);
          continue;
        }
      }

      this.logger.debug(`${lawsuit.code}: TÜM KOŞULLAR SAĞLANDI - isAvailable=true`);

      // Süre kontrolü
      let deadlineStatus = null;
      if (lawsuit.deadlines && lawsuit.auto_calculate && instrumentDates) {
        deadlineStatus = this.calculateDeadlineStatus(lawsuit.deadlines, instrumentDates);
      }

      results.push({
        lawsuit,
        isAvailable: true,
        deadlineStatus,
      });
    }

    return results;
  }

  /**
   * Süre durumunu hesapla
   */
  private calculateDeadlineStatus(
    deadlines: LawsuitDeadline,
    dates: Record<string, Date | string | undefined>
  ): { expiryDate: Date | null; daysLeft: number | null; isExpired: boolean; isApproaching: boolean } {
    const startDateField = deadlines.start_date_field || 'maturityDate';
    const startDateValue = dates[startDateField];

    if (!startDateValue) {
      return { expiryDate: null, daysLeft: null, isExpired: false, isApproaching: false };
    }

    const startDate = typeof startDateValue === 'string' ? new Date(startDateValue) : startDateValue;
    let expiryDate: Date;

    // Süre hesapla
    if (deadlines.sikayet_suresi_ay) {
      expiryDate = new Date(startDate);
      expiryDate.setMonth(expiryDate.getMonth() + deadlines.sikayet_suresi_ay);
    } else if (deadlines.mutlak_sure_yil) {
      expiryDate = new Date(startDate);
      expiryDate.setFullYear(expiryDate.getFullYear() + deadlines.mutlak_sure_yil);
    } else if (deadlines.dava_suresi_yil) {
      expiryDate = new Date(startDate);
      expiryDate.setFullYear(expiryDate.getFullYear() + deadlines.dava_suresi_yil);
    } else if (deadlines.dava_suresi_ay) {
      expiryDate = new Date(startDate);
      expiryDate.setMonth(expiryDate.getMonth() + deadlines.dava_suresi_ay);
    } else {
      return { expiryDate: null, daysLeft: null, isExpired: false, isApproaching: false };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    return {
      expiryDate,
      daysLeft,
      isExpired: daysLeft <= 0,
      isApproaching: daysLeft > 0 && daysLeft <= 30,
    };
  }

  // ============================================
  // ÖNERİ MOTORU
  // ============================================

  /**
   * Dosya için dava önerileri üret
   */
  getRecommendations(payload: {
    caseType: string;
    stage: string;
    instrumentType?: string;
    instrumentDates?: Record<string, Date | string | undefined>;
  }): LawsuitRecommendation[] {
    this.logger.log(`getRecommendations çağrıldı: ${JSON.stringify(payload)}`);
    
    const availableLawsuits = this.checkAvailableLawsuits(payload);
    this.logger.log(`checkAvailableLawsuits sonucu: ${availableLawsuits.length} dava bulundu, ${availableLawsuits.filter(l => l.isAvailable).length} tanesi uygun`);
    
    const recommendations: LawsuitRecommendation[] = [];

    for (const item of availableLawsuits) {
      if (!item.isAvailable) continue;

      let priority = 50;
      let urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      let message = item.lawsuit.description;
      let actionButton = 'Dilekçe Hazırla';

      // Karşılıksız çek için özel öncelik
      if (item.lawsuit.code === 'KARSILIKSIZ_CEK') {
        priority = 100;
        actionButton = 'Şikayet Dilekçesi Hazırla';

        if (item.deadlineStatus) {
          if (item.deadlineStatus.isExpired) {
            urgency = 'CRITICAL';
            message = `⚠️ Şikayet süresi dolmuş olabilir! (${Math.abs(item.deadlineStatus.daysLeft || 0)} gün önce)`;
          } else if (item.deadlineStatus.isApproaching) {
            urgency = 'HIGH';
            message = `⏰ Şikayet süresinin dolmasına ${item.deadlineStatus.daysLeft} gün kaldı!`;
          } else {
            urgency = 'MEDIUM';
            message = `Şikayet süresi: ${item.deadlineStatus.daysLeft} gün`;
          }
        }
      }

      // İtirazın iptali için özel öncelik
      if (item.lawsuit.code === 'ITIRAZIN_IPTALI' && payload.stage === 'OBJECTION') {
        priority = 95;
        urgency = 'HIGH';
        actionButton = 'Dava Dilekçesi Hazırla';

        if (item.deadlineStatus?.isApproaching) {
          urgency = 'CRITICAL';
          message = `⏰ Dava açma süresinin dolmasına ${item.deadlineStatus.daysLeft} gün kaldı!`;
        }
      }

      // Tasarrufun iptali - riskli ama önemli
      if (item.lawsuit.code === 'TASARRUFUN_IPTALI') {
        priority = 60;
        urgency = 'MEDIUM';
        message = '⚠️ Mal kaçırma şüphesi varsa değerlendirin (riskli)';
      }

      recommendations.push({
        lawsuit: item.lawsuit,
        priority,
        urgency,
        message,
        actionButton,
      });
    }

    // Önceliğe göre sırala
    recommendations.sort((a, b) => b.priority - a.priority);

    return recommendations;
  }

  // ============================================
  // DİLEKÇE ŞABLONU
  // ============================================

  /**
   * Dilekçe şablonu bilgilerini getir
   */
  getTemplateInfo(templateCode: string): any {
    return this.config?.templates[templateCode] || null;
  }

  /**
   * Karşılıksız çek şikayet dilekçesi verilerini hazırla
   */
  prepareKarsiliksizCekData(caseData: {
    creditor: { name: string; identityNo?: string; address?: string };
    debtor: { name: string; identityNo?: string; address?: string };
    instrument: {
      serialNo: string;
      amount: number;
      currency?: string;
      bank: string;
      branch?: string;
      presentationDate: string;
      dishonorDate?: string;
      issuePlace?: string;
    };
    lawyer?: { name: string; barNumber: string };
  }): Record<string, any> {
    return {
      sikayetci: {
        ad_soyad: caseData.creditor.name,
        tc_kimlik: caseData.creditor.identityNo,
        adres: caseData.creditor.address,
      },
      sanik: {
        ad_soyad: caseData.debtor.name,
        tc_kimlik: caseData.debtor.identityNo,
        adres: caseData.debtor.address,
      },
      cek: {
        seri_no: caseData.instrument.serialNo,
        tutar: caseData.instrument.amount,
        para_birimi: caseData.instrument.currency || 'TRY',
        banka: caseData.instrument.bank,
        sube: caseData.instrument.branch,
        ibraz_tarihi: caseData.instrument.presentationDate,
        karsilik_tarihi: caseData.instrument.dishonorDate,
        kesideci: caseData.debtor.name,
        duzenleme_yeri: caseData.instrument.issuePlace,
      },
      vekil: caseData.lawyer ? {
        ad_soyad: caseData.lawyer.name,
        baro_sicil: caseData.lawyer.barNumber,
      } : null,
      tarih: new Date().toLocaleDateString('tr-TR'),
    };
  }

  // ============================================
  // UYAP BİLGİLERİ
  // ============================================

  /**
   * UYAP dava türü kodunu getir
   */
  getUyapDavaTuru(lawsuitCode: string): string | null {
    const lawsuit = this.getLawsuitType(lawsuitCode);
    return lawsuit?.uyap_dava_turu || null;
  }

  /**
   * Mahkeme türünü getir
   */
  getCourtType(lawsuitCode: string): string | null {
    const lawsuit = this.getLawsuitType(lawsuitCode);
    return lawsuit?.court_type || null;
  }

  // ============================================
  // DİLEKÇE OLUŞTURMA (Template Engine Entegrasyonu)
  // ============================================

  /**
   * Karşılıksız çek şikayet dilekçesi oluştur - Case ID ile
   */
  async generateKarsiliksizCekSikayet(caseId: string): Promise<{
    content: string;
    title: string;
    templateCode: string;
  }> {
    return this.templateEngine.generateKarsiliksizCekSikayetFromCase(caseId);
  }

  /**
   * Karşılıksız çek şikayet dilekçesi Word formatında oluştur
   */
  async generateKarsiliksizCekSikayetWord(caseId: string): Promise<Buffer> {
    return this.templateEngine.generateKarsiliksizCekSikayetWord(caseId);
  }
}
