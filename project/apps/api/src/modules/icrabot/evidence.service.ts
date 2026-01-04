import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

/**
 * EVIDENCE SERVICE
 * 
 * Katman 6 - Denetim ve İspat (Audit / Log)
 * 
 * Her görev için:
 * - kim tetikledi (kural mı kullanıcı mı)
 * - ne okudu (status snapshot)
 * - ne yaptı (action)
 * - hangi delil çıktı (no/tarih)
 * - hata varsa log
 */
@Injectable()
export class EvidenceService {
  private readonly logger = new Logger(EvidenceService.name);

  constructor(private prisma: PrismaService) {}

  // Prisma client'a erişim (generate sonrası düzelecek)
  private get db(): any {
    return this.prisma;
  }

  /**
   * Kanıt kaydı oluştur
   */
  async recordEvidence(params: {
    taskId?: string;
    caseId: string;
    recipeId: string;
    action: string;
    data: Record<string, any>;
    triggeredBy?: 'AUTO' | 'MANUAL' | 'RULE';
    screenshotUrl?: string;
  }): Promise<void> {
    const { taskId, caseId, recipeId, action, data, triggeredBy = 'AUTO', screenshotUrl } = params;

    // Veri hash'i oluştur (bütünlük için)
    const dataHash = this.createHash(data);

    await this.db.botEvidence.create({
      data: {
        taskId,
        caseId,
        recipeId,
        action,
        triggeredBy,
        dataSnapshot: data,
        dataHash,
        screenshotUrl,
        timestamp: new Date(),
      },
    });

    this.logger.log(`Evidence recorded: ${action} for case ${caseId}`);
  }

  /**
   * Tebligat kanıtı kaydet
   */
  async recordTebligatEvidence(params: {
    caseId: string;
    tebligatId: string;
    action: 'SENT' | 'DELIVERED' | 'RETURNED' | 'MAZBATA_CREATED';
    data: {
      barcodeNo?: string;
      deliveredAt?: Date;
      mazbataNo?: string;
      pttResult?: string;
      recipientName?: string;
    };
  }): Promise<void> {
    await this.recordEvidence({
      caseId: params.caseId,
      recipeId: 'TebligatTracking',
      action: `TEBLIGAT_${params.action}`,
      data: {
        tebligatId: params.tebligatId,
        ...params.data,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Varlık sorgu kanıtı kaydet
   */
  async recordAssetQueryEvidence(params: {
    caseId: string;
    debtorId: string;
    queryType: 'SGK' | 'TAKBIS' | 'VEHICLE' | 'BANK' | 'TRADE_REGISTRY';
    result: {
      found: boolean;
      count?: number;
      details?: any;
    };
  }): Promise<void> {
    await this.recordEvidence({
      caseId: params.caseId,
      recipeId: 'AssetQuery',
      action: `ASSET_QUERY_${params.queryType}`,
      data: {
        debtorId: params.debtorId,
        queryType: params.queryType,
        ...params.result,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Kesinleşme kanıtı kaydet
   */
  async recordFinalizationEvidence(params: {
    caseId: string;
    reason: string;
    serviceDate: Date;
    finalizationDate: Date;
    hasObjection: boolean;
  }): Promise<void> {
    await this.recordEvidence({
      caseId: params.caseId,
      recipeId: 'DetectFinalizationCandidate',
      action: 'FINALIZATION_DETECTED',
      data: {
        ...params,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Dosya için tüm kanıtları getir
   */
  async getEvidenceForCase(caseId: string, options?: {
    recipeId?: string;
    action?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    const where: any = { caseId };

    if (options?.recipeId) where.recipeId = options.recipeId;
    if (options?.action) where.action = options.action;
    if (options?.fromDate || options?.toDate) {
      where.timestamp = {};
      if (options.fromDate) where.timestamp.gte = options.fromDate;
      if (options.toDate) where.timestamp.lte = options.toDate;
    }

    return this.db.botEvidence.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: options?.limit || 100,
    });
  }

  /**
   * Kanıt bütünlüğünü doğrula
   */
  async verifyEvidenceIntegrity(evidenceId: string): Promise<{
    isValid: boolean;
    message: string;
  }> {
    const evidence = await this.db.botEvidence.findUnique({
      where: { id: evidenceId },
    });

    if (!evidence) {
      return { isValid: false, message: 'Kanıt bulunamadı' };
    }

    const currentHash = this.createHash(evidence.dataSnapshot as any);
    const isValid = currentHash === evidence.dataHash;

    return {
      isValid,
      message: isValid 
        ? 'Kanıt bütünlüğü doğrulandı' 
        : 'UYARI: Kanıt verisi değiştirilmiş olabilir!',
    };
  }

  /**
   * Mahkeme raporu için kanıt özeti oluştur
   */
  async generateEvidenceReport(caseId: string): Promise<{
    caseId: string;
    generatedAt: Date;
    totalEvidence: number;
    summary: {
      tebligat: number;
      assetQuery: number;
      finalization: number;
      other: number;
    };
    timeline: Array<{
      date: Date;
      action: string;
      description: string;
      hash: string;
    }>;
  }> {
    const evidence = await this.db.botEvidence.findMany({
      where: { caseId },
      orderBy: { timestamp: 'asc' },
    });

    const summary = {
      tebligat: 0,
      assetQuery: 0,
      finalization: 0,
      other: 0,
    };

    const timeline = evidence.map((e: any) => {
      // Kategorize et
      if (e.action.startsWith('TEBLIGAT_')) summary.tebligat++;
      else if (e.action.startsWith('ASSET_QUERY_')) summary.assetQuery++;
      else if (e.action.includes('FINALIZATION')) summary.finalization++;
      else summary.other++;

      return {
        date: e.timestamp,
        action: e.action,
        description: this.getActionDescription(e.action, e.dataSnapshot as any),
        hash: e.dataHash,
      };
    });

    return {
      caseId,
      generatedAt: new Date(),
      totalEvidence: evidence.length,
      summary,
      timeline,
    };
  }

  /**
   * Aksiyon açıklaması oluştur
   */
  private getActionDescription(action: string, data: any): string {
    const descriptions: Record<string, (d: any) => string> = {
      'TEBLIGAT_SENT': (d) => `Tebligat gönderildi: ${d.recipientName || 'Alıcı'}`,
      'TEBLIGAT_DELIVERED': (d) => `Tebligat teslim edildi: ${d.deliveredAt}`,
      'TEBLIGAT_RETURNED': (d) => `Tebligat iade geldi: ${d.pttResult || 'Sebep belirtilmedi'}`,
      'TEBLIGAT_MAZBATA_CREATED': (d) => `Mazbata oluşturuldu: ${d.mazbataNo}`,
      'ASSET_QUERY_SGK': (d) => `SGK sorgusu: ${d.found ? `${d.count} kayıt bulundu` : 'Kayıt bulunamadı'}`,
      'ASSET_QUERY_TAKBIS': (d) => `Tapu sorgusu: ${d.found ? `${d.count} kayıt bulundu` : 'Kayıt bulunamadı'}`,
      'ASSET_QUERY_VEHICLE': (d) => `Araç sorgusu: ${d.found ? `${d.count} kayıt bulundu` : 'Kayıt bulunamadı'}`,
      'ASSET_QUERY_BANK': (d) => `Banka sorgusu: ${d.found ? `${d.count} kayıt bulundu` : 'Kayıt bulunamadı'}`,
      'FINALIZATION_DETECTED': (d) => `Kesinleşme tespit edildi: ${d.reason}`,
      'TASK_COMPLETED': (d) => `Görev tamamlandı`,
      'TASK_FAILED': (d) => `Görev başarısız: ${d.error || 'Bilinmeyen hata'}`,
    };

    const descFn = descriptions[action];
    return descFn ? descFn(data) : action;
  }

  /**
   * SHA-256 hash oluştur
   */
  private createHash(data: Record<string, any>): string {
    const json = JSON.stringify(data, Object.keys(data).sort());
    return crypto.createHash('sha256').update(json).digest('hex');
  }
}
