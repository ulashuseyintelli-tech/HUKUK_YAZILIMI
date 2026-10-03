import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientSettlementReadService } from '@/modules/client-settlement/client-settlement-read.service';
import {
  loadOpeningExpenseRequirement,
  openingExpenseBlocksExpenseGate,
  type OpeningExpenseNotDetermined,
  type OpeningExpenseRequirement,
} from './opening-expense-requirement';

/**
 * S8-B FAZ-1b — UYAP gate remaining-bazlı karar feature flag (default OFF). ON olunca BLOCKING masraf yalnız
 * computeExpenseRemaining>0 ise bloklar (offset/reimbursement ile kapanmış masraf UYAP'ı AÇAR). OFF=legacy status-bazlı
 * (davranış değişmez). Rollout: dual-eval + discrepancy log → flag flip sonrası authoritative.
 */
function isExpenseRemainingGateEnabled(): boolean {
  return process.env.EXPENSE_REMAINING_GATE_ENABLED?.toLowerCase() === 'true';
}

export interface GateCheckResult {
  isBlocked: boolean;
  blockingExpenses: Array<{
    id: string;
    stageCode: string | null;
    totalAmount: number;
    paidTotal: number;
    remaining: number;
    status: string;
  }>;
  /** Yalnız TUTARI BELİRLİ taleplerin kalanını toplar; `openingExpense` varsa toplam eksiktir (belirlenmemiş tutar 0 sayılmaz). */
  totalPending: number;
  message?: string;
  /** Açılış masrafı belirlenmediyse gelir: tutar YOKTUR ve masraf şartı sağlanmış SAYILMAZ. */
  openingExpense?: OpeningExpenseNotDetermined;
}

/** Masraf kapısından muaf UYAP işlem türleri (okuma / sorgu / indirme). */
const GATE_EXEMPT_UYAP_ACTIONS: readonly string[] = ['VIEW', 'QUERY', 'DOWNLOAD'];

/**
 * CPE Adapter Interface
 * Opsiyonel CPE entegrasyonu için
 */
export interface CpeAdapter {
  canPerformAction(caseId: string, actionCode: string, context?: any): Promise<{
    allowed: boolean;
    code?: string;
    reason?: string;
  }>;
}

@Injectable()
export class ExpenseGateService {
  private readonly logger = new Logger(ExpenseGateService.name);
  
  /**
   * CPE Adapter - opsiyonel, inject edilirse kullanılır
   * Feature flag ile kontrol edilir
   */
  private cpeAdapter?: CpeAdapter;
  private useCpe = false; // Feature flag

  constructor(
    private prisma: PrismaService,
    private readonly readService: ClientSettlementReadService,
  ) {}

  /**
   * CPE Adapter'ı set et (opsiyonel)
   * PolicyEngineModule'dan inject edilir
   */
  setCpeAdapter(adapter: CpeAdapter, enabled: boolean = true): void {
    this.cpeAdapter = adapter;
    this.useCpe = enabled;
    this.logger.log(`CPE adapter ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Büro (tenant) sınırı: dosya çağıranın bürosuna ait değilse — ya da hiç yoksa — AYNI "bulunamadı" yanıtı verilir;
   * başka büronun dosyası hakkında var / yok bilgisi dahil hiçbir şey sızmaz. Büro kimliği yalnız doğrulanmış oturumdan
   * gelir. Boş kimlikte sorguya gidilmez: Prisma tanımsız süzgeci yok sayar, sorgu dosyayı büro sınırı olmadan bulurdu.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseGateService.checkGate() / isUyapBlocked() / canPerformUyapAction()
   * </remarks>
   */
  private async assertCaseInTenant(caseId: string, tenantId: string): Promise<void> {
    const owned =
      caseId && tenantId
        ? await this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } })
        : null;
    if (!owned) {
      throw new NotFoundException('Takip bulunamadı');
    }
  }

  /**
   * Gate kontrolü - BLOCKING expense'ler ödenmemiş mi? Büro kapsamlıdır (bkz. assertCaseInTenant).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseRequestController.getGateStatus() → GET /expense-requests/case/:caseId/gate-status
   * - ExpenseGateService.getGateSummary() / updateGateStatus()
   * </remarks>
   */
  async checkGate(caseId: string, tenantId: string): Promise<GateCheckResult> {
    await this.assertCaseInTenant(caseId, tenantId);
    return this.evaluateGate(caseId, tenantId);
  }

  /**
   * Kapı değerlendirmesi. Dosyanın büroya ait olduğunu ÇAĞIRAN doğrular; talepler ayrıca büro süzgeciyle okunur
   * (dosyada başka büro damgalı talep sayılmaz).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseGateService.checkGate() / isUyapBlockedLegacy()
   * </remarks>
   */
  private async evaluateGate(caseId: string, tenantId: string): Promise<GateCheckResult> {
    // Coarse pre-filter (BLOCKING + açık statü). Nihai blok kararı FAZ-1b flag'e göre: legacy (statü-bazlı) vs remaining-bazlı.
    const candidates = await this.prisma.expenseRequest.findMany({
      where: {
        caseId,
        tenantId,
        gateType: 'BLOCKING',
        status: { in: ['PENDING', 'SENT', 'REMINDED', 'PARTIAL'] },
      },
      select: {
        id: true,
        tenantId: true,
        stageCode: true,
        totalAmount: true,
        paidTotal: true,
        status: true,
      },
    });

    const flagOn = isExpenseRemainingGateEnabled();
    const blockingExpenses: GateCheckResult['blockingExpenses'] = [];
    for (const exp of candidates) {
      // FAZ-1b dual-eval: legacy (totalAmount−paidTotal) vs true remaining (computeExpenseRemaining = +offset/reimbursement).
      const legacyRemaining = exp.totalAmount.minus(exp.paidTotal);
      const trueRemaining = await this.readService.computeExpenseRemaining(this.prisma, exp.tenantId, exp.id, exp.totalAmount, exp.paidTotal);
      if (!legacyRemaining.equals(trueRemaining)) {
        // Discrepancy: offset/reimbursement legacy'nin görmediği kapanışı gösterir (rollout gözlemi; act-on-legacy until flag).
        this.logger.warn(
          `[expense-gate] remaining discrepancy exp=${exp.id} legacy=${legacyRemaining.toString()} ` +
            `true=${trueRemaining.toString()} flagOn=${flagOn}`,
        );
      }
      // Karar: flagOn → yalnız trueRemaining>0 bloklar (kapanmış masraf UYAP'ı açar); flagOff → legacy (her aday bloklar).
      const blocks = flagOn ? trueRemaining.gt(0) : true;
      if (!blocks) continue;
      const shownRemaining = flagOn ? trueRemaining : legacyRemaining;
      blockingExpenses.push({
        id: exp.id,
        stageCode: exp.stageCode,
        totalAmount: exp.totalAmount.toNumber(),
        paidTotal: exp.paidTotal.toNumber(),
        remaining: shownRemaining.toNumber(),
        status: exp.status,
      });
    }

    const result: GateCheckResult = {
      isBlocked: blockingExpenses.length > 0,
      blockingExpenses,
      totalPending: blockingExpenses.reduce((sum, exp) => sum + exp.remaining, 0),
    };
    if (result.isBlocked) {
      result.message = `${result.blockingExpenses.length} adet ödenmemiş masraf talebi var. Toplam: ${result.totalPending.toFixed(2)} TL`;
    }
    return result;
  }

  /**
   * Dosyanın açılış masrafı şartı (SALT OKUMA). Dosya çağıranın bürosuna ait değilse "bulunamadı" verir.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - checkGateForCase() / canPerformUyapActionForCase() / getGateSummaryForCase() (bu servis)
   * - StageTriggerService.triggerStage() → POST /cases/:caseId/uyap/prepare, POST /cases/:caseId/stage-trigger,
   *   POST /cases/:caseId/operations (yalnız UYAP gönderim hazırlığı olayı)
   * </remarks>
   */
  async getOpeningExpenseRequirement(tenantId: string, caseId: string): Promise<OpeningExpenseRequirement> {
    const requirement = await loadOpeningExpenseRequirement(this.prisma, tenantId, caseId);
    if (!requirement) {
      throw new NotFoundException('Takip bulunamadı');
    }
    return requirement;
  }

  /**
   * Masraf kapısı — büro kapsamlı. Ödenmemiş BLOCKING taleplere ek olarak, açılış masrafı belirlenememiş (dövizli / karma
   * dosyada talep oluşturulamamış) dosyada da kilitlidir: tutarı belirlenmemiş masraf "sağlandı" sayılmaz. TL dosyada ve
   * açılış masrafı kayıtlı dosyada sonuç checkGate() ile AYNIDIR.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseRequestController.getGateStatus() → GET /expense-requests/case/:caseId/gate-status
   * - StageTriggerService.handleUyapPrepare() → POST /cases/:caseId/uyap/prepare (açılış masrafı elle kayıtlı dövizli dosya)
   * </remarks>
   */
  async checkGateForCase(tenantId: string, caseId: string): Promise<GateCheckResult> {
    const requirement = await this.getOpeningExpenseRequirement(tenantId, caseId);
    const gate = await this.checkGate(caseId, tenantId);
    if (!openingExpenseBlocksExpenseGate(requirement)) {
      return gate;
    }

    return {
      ...gate,
      isBlocked: true,
      message: this.openingExpenseBlockMessage(requirement, gate.message),
      openingExpense: requirement,
    };
  }

  /**
   * Belirli bir UYAP işlemi masraf açısından yapılabilir mi? — büro kapsamlı. Okuma / sorgu / indirme muaftır.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseRequestController.canPerformAction() → GET /expense-requests/case/:caseId/can-perform/:actionType
   * </remarks>
   */
  async canPerformUyapActionForCase(tenantId: string, caseId: string, actionType: string): Promise<boolean> {
    const requirement = await this.getOpeningExpenseRequirement(tenantId, caseId);
    if (GATE_EXEMPT_UYAP_ACTIONS.includes(actionType.toUpperCase())) {
      return true;
    }
    if (openingExpenseBlocksExpenseGate(requirement)) {
      return false;
    }
    return this.canPerformUyapAction(caseId, actionType, tenantId);
  }

  /**
   * Dosya için gate özeti — büro kapsamlı. Açılış masrafı belirlenmediyse özet "UYAP işlemleri için hazır" ya da yalnız
   * "bekleyen 0,00 TL" YAZMAZ: tutar yoktur, neden ve düzeltme yolu bildirilir. Diğer durumlarda sonuç getGateSummary()
   * ile AYNIDIR.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseRequestController.getGateSummary() → GET /expense-requests/case/:caseId/gate-summary
   * </remarks>
   */
  async getGateSummaryForCase(tenantId: string, caseId: string) {
    const requirement = await this.getOpeningExpenseRequirement(tenantId, caseId);
    const summary = await this.getGateSummary(caseId, tenantId);
    if (!openingExpenseBlocksExpenseGate(requirement)) {
      return summary;
    }

    return {
      ...summary,
      isBlocked: true,
      canSubmitToUyap: false,
      canSendNotification: false,
      message: this.openingExpenseBlockMessage(requirement, summary.isBlocked ? summary.message : undefined),
      openingExpense: requirement,
    };
  }

  /** Belirlenmemiş açılış masrafının nedeni + düzeltme yolu; tutarı belirli ödenmemiş talepler varsa onların mesajı eklenir. */
  private openingExpenseBlockMessage(requirement: OpeningExpenseNotDetermined, pendingMessage?: string): string {
    const reason = `${requirement.message} ${requirement.completionPath}`;
    return pendingMessage ? `${reason} Ayrıca: ${pendingMessage}` : reason;
  }

  /**
   * UYAP işlemleri kilitli mi?
   * 
   * @deprecated CPE kullanımına geçilecek - canPerformUyapAction kullanın
   *
   * <remarks>
   * Çağrıldığı yerler: üretimde çağıranı yok (yalnız testler). Büro kapsamlıdır (bkz. assertCaseInTenant).
   * </remarks>
   */
  async isUyapBlocked(caseId: string, tenantId: string): Promise<boolean> {
    await this.assertCaseInTenant(caseId, tenantId);

    // CPE aktifse, CPE'den kontrol et
    if (this.useCpe && this.cpeAdapter) {
      const decision = await this.cpeAdapter.canPerformAction(caseId, 'UYAP_SEND');
      const legacyResult = await this.isUyapBlockedLegacy(caseId, tenantId);
      
      // Discrepancy logging
      if (decision.allowed !== !legacyResult) {
        this.logger.warn(
          `CPE/Legacy discrepancy for case ${caseId}: CPE=${decision.allowed}, Legacy=${!legacyResult}`,
          { cpeCode: decision.code, cpeReason: decision.reason }
        );
      }
      
      return !decision.allowed;
    }

    return this.isUyapBlockedLegacy(caseId, tenantId);
  }

  /**
   * ROLL-002 — UYAP block kontrolü (isUyapBlocked/canPerformUyapAction ortak kaynağı).
   * Flag OFF: davranış/performans AYNEN korunur (ucuz COUNT — checkGate'in flag-off dalıyla
   * matematiksel eşdeğer). Flag ON: checkGate ile AYNI değerlendirmeye (evaluateGate) delege eder — bu metod artık
   * checkGate/getGateSummary ile AYNI (true-remaining bazlı) kararı verir; display/enforcement
   * ayrışması (ROLL-002) kapanır. "Legacy" adı korunuyor (çağıran metodlar değişmedi), ama artık
   * yalnız flag-off'ta saf legacy'dir.
   * Dosyanın büroya ait olduğunu ÇAĞIRAN doğrular; sayım da büro süzgeçlidir.
   */
  private async isUyapBlockedLegacy(caseId: string, tenantId: string): Promise<boolean> {
    if (!isExpenseRemainingGateEnabled()) {
      const count = await this.prisma.expenseRequest.count({
        where: {
          caseId,
          tenantId,
          gateType: 'BLOCKING',
          status: { in: ['PENDING', 'SENT', 'REMINDED', 'PARTIAL'] },
        },
      });
      return count > 0;
    }

    const gateCheck = await this.evaluateGate(caseId, tenantId);
    return gateCheck.isBlocked;
  }

  /**
   * Belirli bir UYAP işlemi yapılabilir mi?
   * CPE entegrasyonu ile çalışır. Büro kapsamlıdır (bkz. assertCaseInTenant).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseRequestController.canPerformAction() → GET /expense-requests/case/:caseId/can-perform/:actionType
   * </remarks>
   */
  async canPerformUyapAction(caseId: string, actionType: string, tenantId: string): Promise<boolean> {
    // Muafiyetten ÖNCE: kapıdan muaf işlem türü de başka büronun dosyası için yanıt üretmez
    await this.assertCaseInTenant(caseId, tenantId);

    // Bazı işlemler gate'den muaf olabilir (örn: dosya görüntüleme)
    if (GATE_EXEMPT_UYAP_ACTIONS.includes(actionType.toUpperCase())) {
      return true;
    }

    // CPE aktifse, CPE'den kontrol et
    if (this.useCpe && this.cpeAdapter) {
      // ActionType'ı CPE ActionCode'a map et
      const actionCodeMap: Record<string, string> = {
        'SEND': 'UYAP_SEND',
        'SUBMIT': 'UYAP_SEND',
        'NOTIFICATION': 'SEND_NOTIFICATION',
        'HACIZ': 'TRIGGER_HACIZ',
        'ENFORCEMENT': 'TRIGGER_HACIZ',
      };
      
      const actionCode = actionCodeMap[actionType.toUpperCase()] || 'UYAP_SEND';
      const decision = await this.cpeAdapter.canPerformAction(caseId, actionCode);
      
      // Legacy kontrolü de yap ve karşılaştır
      const legacyResult = await this.canPerformUyapActionLegacy(caseId, actionType, tenantId);
      
      if (decision.allowed !== legacyResult) {
        this.logger.warn(
          `CPE/Legacy discrepancy for ${actionType} on case ${caseId}: CPE=${decision.allowed}, Legacy=${legacyResult}`,
          { cpeCode: decision.code, cpeReason: decision.reason }
        );
      }
      
      return decision.allowed;
    }

    return this.canPerformUyapActionLegacy(caseId, actionType, tenantId);
  }

  /**
   * Legacy UYAP action kontrolü
   */
  private async canPerformUyapActionLegacy(caseId: string, actionType: string, tenantId: string): Promise<boolean> {
    const isBlocked = await this.isUyapBlockedLegacy(caseId, tenantId);
    return !isBlocked;
  }

  /**
   * Gate durumunu güncelle (ödeme sonrası)
   * Case status'unu "UYAP'a Gönderilebilir" yap
   */
  async updateGateStatus(caseId: string, tenantId: string): Promise<{ cleared: boolean; message: string }> {
    const gateCheck = await this.checkGate(caseId, tenantId);

    if (!gateCheck.isBlocked) {
      // Tüm BLOCKING masraflar ödendi - Case'i güncelle
      // Not: Case status güncellemesi için CaseService kullanılabilir
      // Şimdilik sadece log ve sonuç döndürüyoruz
      this.logger.log(`Gate cleared for case ${caseId} - UYAP actions unlocked`);
      
      return {
        cleared: true,
        message: 'Tüm masraflar ödendi. UYAP işlemleri açıldı.',
      };
    }

    return {
      cleared: false,
      message: gateCheck.message || 'Ödenmemiş masraflar mevcut.',
    };
  }

  /**
   * Dosya için gate özeti. Büro kapsamlıdır (bkz. assertCaseInTenant).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ExpenseRequestController.getGateSummary() → GET /expense-requests/case/:caseId/gate-summary
   * </remarks>
   */
  async getGateSummary(caseId: string, tenantId: string) {
    const gateCheck = await this.checkGate(caseId, tenantId);
    
    return {
      isBlocked: gateCheck.isBlocked,
      totalPending: gateCheck.totalPending,
      blockingCount: gateCheck.blockingExpenses.length,
      expenses: gateCheck.blockingExpenses,
      canSubmitToUyap: !gateCheck.isBlocked,
      canSendNotification: !gateCheck.isBlocked,
      message: gateCheck.isBlocked 
        ? `Masraf ödenmeden UYAP işlemi yapılamaz. Bekleyen: ${gateCheck.totalPending.toFixed(2)} TL`
        : 'UYAP işlemleri için hazır.',
    };
  }
}
