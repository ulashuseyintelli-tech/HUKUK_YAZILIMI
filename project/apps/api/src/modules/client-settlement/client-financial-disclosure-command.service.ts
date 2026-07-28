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
import {
  buildDisclosureTelemetry,
  DISCLOSURE_TELEMETRY_EVENTS,
  isDisclosureWriteEnabled,
  resolveDisclosureActivationLevel,
} from '../client-financial-disclosure/client-financial-disclosure-activation';

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
   * AKTİVASYON KAPISI — varsayılan KAPALI, fail-closed.
   *
   * I05: canonical `isDisclosureWriteEnabled()` parser'ına geçirildi. I03'te kullanılan
   * `trim().toLowerCase()` biçimi `'TRUE'`, `'True'` ve `' true '` değerlerini de KABUL
   * EDİYORDU; canonical kural artık KATI-LİTERAL `'true'`dur (§7.1). Bu bilinçli bir
   * DARALTMADIR — gerçek finansal yazmayı açan bir bayrakta "yaklaşık doğru" değer kabul
   * edilmez. Daha önce `TRUE` ile açılmış bir kurulum bu değişiklikten sonra KAPANIR.
   */
  static isWriteEnabled(): boolean {
    return isDisclosureWriteEnabled();
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

    this.logger.log(
      buildDisclosureTelemetry(DISCLOSURE_TELEMETRY_EVENTS.CREATE_REQUESTED, {
        tenantId,
        dispositionId,
        actorId: actor.userId,
        activationLevel: resolveDisclosureActivationLevel(),
      }),
    );

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

    // §7.4 gözlemlenebilirlik: yasak alanlar telemetri yardımcısı tarafından fail-closed
    // ATILIR — finansal tutar, alıcı, hash ve snapshot içeriği satıra ASLA girmez.
    this.logger.log(
      buildDisclosureTelemetry(DISCLOSURE_TELEMETRY_EVENTS.CREATED, {
        tenantId,
        disclosureId: result.disclosureId,
        versionId: result.versionId,
        version: result.version,
        actorId: actor.userId,
        dispositionId: disposition.id,
        fromStatus: 'NONE',
        toStatus: 'DRAFT',
        replayed: result.replayed,
      }),
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
