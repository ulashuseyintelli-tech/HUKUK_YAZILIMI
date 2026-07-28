import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientFinancialDisclosureWriterService } from '../client-financial-disclosure/client-financial-disclosure-writer.service';
import { DispositionPostingService } from './disposition-posting.service';

/**
 * CLIENT-FINANCIAL-DISCLOSURE-PRODUCTION-ACTIVATION-R01 / I03 — AUTHORIZED WRITE ENTRYPOINT
 *
 * Track B'nin dormant `...WriterService`'ini yetkili ofis akışına bağlayan **tek** application
 * orchestration servisi. Domain servisi DEĞİŞTİRİLMEZ; burada yalnız aktivasyon kapısı,
 * yetki ve server-side scope çözümü yapılır.
 *
 * SCOPE SERVER-SIDE ÇÖZÜLÜR — client YALNIZ `dispositionId` verir:
 *   `caseId`, `caseClientId` ve `sendIdempotencyKey` dispozisyon kaydından TÜRETİLİR.
 *   Böylece cross-tenant / cross-case / cross-client / forged-source-reference yazma
 *   yapısal olarak İMKÂNSIZDIR — istemcinin uydurabileceği bir scope alanı YOKTUR.
 *
 * YETKİ: dispozisyon HAZIRLAMA predikatı (`isPrepareEligible`) kullanılır. Gerekçe: bu adım
 * yalnız `DRAFT` snapshot üretir (charter §40.2) ve finansal etki DOĞURMAZ; kesin finansal
 * yetki kapısı ofis onayıdır (§41.3, PARTNER/MANAGER/yetkilendirilmiş avukat) ve BURADA
 * GEVŞETİLMEZ. Aynı kaynak nesne (`CollectionDisposition`) için repository'nin canonical
 * hazırlama yetkisi budur; yeni bir yetki modeli ÜRETİLMEZ.
 */
@Injectable()
export class ClientFinancialDisclosureCommandService {
  private readonly logger = new Logger(ClientFinancialDisclosureCommandService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: ClientFinancialDisclosureWriterService,
    private readonly posting: DispositionPostingService,
  ) {}

  /**
   * §11 AKTİVASYON KAPISI — varsayılan KAPALI, eksik/geçersiz config'de FAIL-CLOSED.
   * Yalnız tam olarak `'true'` (case-insensitive, trim'lenmiş) açar; başka hiçbir değer açmaz.
   */
  static isWriteEnabled(): boolean {
    return (process.env.CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED ?? '').trim().toLowerCase() === 'true';
  }

  /**
   * `POSTED` bir dağıtım kararından `DRAFT` müvekkil finansal bildirimi üretir.
   * Aynı dispozisyon için tekrar çağrılırsa writer'ın idempotency sözleşmesi devreye girer
   * ve ikinci bir kayıt OLUŞMAZ (`replayed: true`).
   */
  async createFromDisposition(
    tenantId: string,
    dispositionId: string,
    actor: { userId?: string },
  ): Promise<{
    disclosureId: string;
    disclosureVersionId: string;
    version: number;
    status: string;
    replayed: boolean;
  }> {
    if (!ClientFinancialDisclosureCommandService.isWriteEnabled()) {
      // Kapalıyken varlık bilgisi sızdırmadan reddedilir.
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Client Financial Disclosure Write Disabled',
        code: 'DISCLOSURE_WRITE_NOT_ENABLED',
        message: 'Client financial disclosure creation is not enabled.',
      });
    }
    if (!actor?.userId) {
      throw new BadRequestException('Bildirim oluşturmak için actor gerekir');
    }
    if (!(await this.posting.isPrepareEligible(actor.userId, tenantId))) {
      throw new ForbiddenException(
        'Müvekkil finansal bildirimi hazırlama yetkisi yok (avukat veya yetkili muhasebe personeli gerekir).',
      );
    }

    // Kaynak dispozisyon TENANT-SCOPED okunur; `caseId`/`caseClientId` BURADAN türetilir.
    const disposition = await this.prisma.collectionDisposition.findFirst({
      where: { id: dispositionId, tenantId },
      select: { id: true, caseId: true, caseClientId: true, status: true },
    });
    if (!disposition) {
      throw new NotFoundException('Dağıtım kararı bulunamadı');
    }
    if (disposition.status !== 'POSTED') {
      throw new BadRequestException(
        `Yalnız POSTED dağıtım kararından bildirim üretilebilir (durum: ${disposition.status})`,
      );
    }
    if (!disposition.caseClientId) {
      throw new BadRequestException(
        'Dağıtım kararı tek bir müvekkile bağlı değil; bildirim üretilemez',
      );
    }

    const result = await this.writer.createDisclosureVersion({
      tenantId,
      caseId: disposition.caseId,
      caseClientId: disposition.caseClientId,
      collectionDispositionId: disposition.id,
      // Tenant-scoped ve DETERMİNİSTİK: caller idempotency anahtarı VEREMEZ, dolayısıyla
      // çift gönderim anahtarı uydurulamaz ve tekrar çağrı doğal olarak replay olur.
      sendIdempotencyKey: `client-financial-disclosure:${disposition.id}`,
    });

    // §12 gözlemlenebilirlik: finansal tutar, alıcı, hash ve snapshot içeriği LOG'A YAZILMAZ.
    this.logger.log(
      `disclosure_created tenantId=${tenantId} disclosureId=${result.disclosureId} ` +
        `versionId=${result.versionId} version=${result.version} actorId=${actor.userId} ` +
        `dispositionId=${disposition.id} replayed=${result.replayed}`,
    );

    return {
      disclosureId: result.disclosureId,
      disclosureVersionId: result.versionId,
      version: result.version,
      status: 'DRAFT',
      replayed: result.replayed,
    };
  }
}
