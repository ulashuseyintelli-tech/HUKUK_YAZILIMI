import { Injectable, Logger, NotFoundException, BadRequestException, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { findOrCreateDebtorAddress } from '@/common/address-hash.util'; // RFA-006 adres dedup
import {
  CreateUyapQueryDto,
  UpdateUyapQueryResponseDto,
  AddressFromQueryDto,
  UyapQueryType,
  UYAP_QUERY_CODES,
  QUERY_HIERARCHY,
} from './dto/uyap-query.dto';
import { CasePolicyEngine } from '../policy-engine/case-policy-engine.service';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { GateWarning } from '../policy-engine/types/policy-decision.interface';
import { CaseDebtorLifecycleGuardService } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';

@Injectable()
export class UyapQueryService {
  private readonly logger = new Logger(UyapQueryService.name);

  constructor(
    private prisma: PrismaService,
    private caseDebtorLifecycleGuard: CaseDebtorLifecycleGuardService,
    // ASSIGN: UYAP_QUERY soft-warning (advisory). @Optional → CPE inject edilemezse
    // fail-open (uyarı yok, sorgu akışı bozulmaz) — uyap.service/stage-trigger deseni.
    @Optional() @Inject(CasePolicyEngine) private readonly cpe?: CasePolicyEngine,
  ) {}

  /**
   * UYAP_QUERY policy gate'ini ADVISORY değerlendirir — ASLA bloklamaz.
   * UYAP geçici kesintisinde (system.uyap_available=false) SOFT uyarı (GateWarning[]) döner.
   * CPE inject edilmemişse ya da hata verirse → [] (fail-open), sorgu akışı bozulmaz.
   *
   * @remarks Çağrıldığı yerler:
   * - UyapQueryService.createQuery() → POST /address-discovery/uyap-query
   */
  private async getUyapQueryWarnings(
    caseId: string,
    debtorId: string,
    userId: string,
  ): Promise<GateWarning[]> {
    if (!this.cpe) return [];
    try {
      const decision = await this.cpe.canPerformAction(caseId, ActionCode.UYAP_QUERY, {
        debtorId,
        userId,
      });
      return decision.warnings ?? [];
    } catch (error) {
      this.logger.warn(
        `UYAP_QUERY policy uyarısı alınamadı (fail-open): ${(error as Error)?.message ?? error}`,
      );
      return [];
    }
  }

  /**
   * UYAP sorgusu oluştur
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AddressDiscoveryController.createUyapQuery() → POST /address-discovery/uyap-query (UYAP sorgusu oluşturma)
  /// </remarks>
  async createQuery(tenantId: string, userId: string, dto: CreateUyapQueryDto) {
    await this.caseDebtorLifecycleGuard.assertActiveByCaseDebtorId(tenantId, dto.caseDebtorId);

    // CaseDebtor'u doğrula
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: dto.caseDebtorId },
      include: {
        case: { select: { tenantId: true, fileNumber: true } },
        debtor: { select: { id: true, name: true, identityNo: true, type: true } },
      },
    });

    if (!caseDebtor || caseDebtor.case.tenantId !== tenantId) {
      throw new NotFoundException('Borçlu bulunamadı');
    }

    // Aynı sorgu daha önce yapılmış mı kontrol et
    const existingQuery = await this.prisma.uyapQuery.findFirst({
      where: {
        caseDebtorId: dto.caseDebtorId,
        queryType: dto.queryType,
        status: { in: ['PENDING', 'COMPLETED'] },
      },
    });

    if (existingQuery) {
      throw new BadRequestException(
        `Bu sorgu türü zaten ${existingQuery.status === 'PENDING' ? 'beklemede' : 'tamamlanmış'}`
      );
    }

    const queryCode = UYAP_QUERY_CODES[dto.queryType];

    const query = await this.prisma.uyapQuery.create({
      data: {
        tenantId,
        caseDebtorId: dto.caseDebtorId,
        queryType: dto.queryType,
        queryCode,
        status: 'PENDING',
        requestedBy: userId,
      },
      include: {
        caseDebtor: {
          include: {
            debtor: { select: { id: true, name: true } },
            case: { select: { id: true, fileNumber: true } },
          },
        },
      },
    });

    // ASSIGN: UYAP_QUERY policy gate'i ADVISORY → UYAP kesintisinde SOFT uyarı (asla
    // bloklamaz; query yukarıda zaten oluştu). Frontend `warnings`'i opsiyonel okur.
    const warnings = await this.getUyapQueryWarnings(
      caseDebtor.caseId,
      caseDebtor.debtor.id,
      userId,
    );

    this.logger.log(
      `UYAP sorgusu oluşturuldu: ${queryCode} - ${caseDebtor.debtor.name} (${caseDebtor.case.fileNumber})`
    );

    return { ...query, warnings };
  }

  /**
   * Sorgu sonucunu kaydet (manuel giriş)
   */
  async recordQueryResponse(
    tenantId: string,
    queryId: string,
    dto: UpdateUyapQueryResponseDto
  ) {
    const query = await this.prisma.uyapQuery.findFirst({
      where: { id: queryId, tenantId },
    });

    if (!query) {
      throw new NotFoundException('Sorgu bulunamadı');
    }

    if (query.status !== 'PENDING') {
      throw new BadRequestException('Bu sorgu zaten sonuçlandırılmış');
    }

    const updated = await this.prisma.uyapQuery.update({
      where: { id: queryId },
      data: {
        status: dto.status,
        respondedAt: new Date(),
        response: dto.response || null,
        errorMessage: dto.errorMessage,
        addressesFound: dto.addresses?.length || 0,
      },
      include: {
        caseDebtor: {
          include: {
            debtor: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Adresler varsa işle
    if (dto.addresses && dto.addresses.length > 0) {
      await this.processQueryAddresses(tenantId, queryId, dto.addresses);
    }

    this.logger.log(
      `UYAP sorgu sonucu kaydedildi: ${query.queryCode} - ${dto.status} (${dto.addresses?.length || 0} adres)`
    );

    return updated;
  }

  /**
   * Sorgudan gelen adresleri DebtorAddress'e ekle
   */
  async processQueryAddresses(
    tenantId: string,
    queryId: string,
    addresses: AddressFromQueryDto[]
  ) {
    const query = await this.prisma.uyapQuery.findFirst({
      where: { id: queryId, tenantId },
      include: {
        caseDebtor: {
          include: { debtor: { select: { id: true } } },
        },
      },
    });

    if (!query) {
      throw new NotFoundException('Sorgu bulunamadı');
    }

    const debtorId = query.caseDebtor.debtor.id;
    const addressSource = this.getAddressSourceFromQueryType(query.queryType as UyapQueryType);

    const createdAddresses = [];

    for (const addr of addresses) {
      // RFA-006: normalize hash dedup (eski zayıf fullText findFirst yerine). Idempotent.
      const { address: newAddress, created } = await findOrCreateDebtorAddress(this.prisma, {
        debtorId,
        fullText: addr.fullAddress,
        city: addr.city || 'Bilinmiyor',
        district: addr.district,
        street: addr.street || addr.fullAddress.substring(0, 200),
        postalCode: addr.postalCode,
        type: 'DECLARED',
        source: addressSource as any,
        verifiedSource: `UYAP ${query.queryCode} - ${queryId}`,
        verified: true,
        verifiedAt: new Date(),
      });

      if (!created) {
        this.logger.log(`Adres zaten mevcut, atlanıyor: ${addr.fullAddress.substring(0, 50)}...`);
        continue;
      }

      createdAddresses.push(newAddress);
    }

    // Sorguyu güncelle
    await this.prisma.uyapQuery.update({
      where: { id: queryId },
      data: { addressesFound: createdAddresses.length },
    });

    this.logger.log(`${createdAddresses.length} yeni adres eklendi (UYAP ${query.queryCode})`);

    return createdAddresses;
  }

  /**
   * Borçlu için sorguları getir
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AddressDiscoveryController.getUyapQueries() → GET /address-discovery/uyap-query/debtor/:caseDebtorId (UYAP sorgu geçmişi)
  /// </remarks>
  async getQueriesForDebtor(tenantId: string, caseDebtorId: string) {
    const queries = await this.prisma.uyapQuery.findMany({
      where: { tenantId, caseDebtorId },
      include: {
        requestedByUser: { select: { name: true, surname: true } },
        caseDebtor: { select: { lifecycleStatus: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });

    return queries.map((query: any) => ({
      ...query,
      caseDebtorLifecycleStatus: query.caseDebtor?.lifecycleStatus,
      caseDebtorLifecycleLabel: query.caseDebtor?.lifecycleStatus,
    }));
  }

  /**
   * Tek bir sorguyu getir
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - AddressDiscoveryController.getUyapQuery() → GET /address-discovery/uyap-query/:queryId (UYAP sorgu detayı)
  /// </remarks>
  async getQuery(tenantId: string, queryId: string) {
    const query = await this.prisma.uyapQuery.findFirst({
      where: { id: queryId, tenantId },
      include: {
        caseDebtor: {
          include: {
            debtor: { select: { id: true, name: true, identityNo: true } },
            case: { select: { id: true, fileNumber: true } },
          },
        },
        requestedByUser: { select: { name: true, surname: true } },
      },
    });

    if (!query) {
      throw new NotFoundException('Sorgu bulunamadı');
    }

    return {
      ...query,
      caseDebtorLifecycleStatus: query.caseDebtor?.lifecycleStatus,
      caseDebtorLifecycleLabel: query.caseDebtor?.lifecycleStatus,
    };
  }

  /**
   * Önerilen sorguları getir (henüz yapılmamış)
   *
   * NOT (ASSIGN [S], ERTELENDİ — ayrı PR/karar): Bu uç UYAP-kesinti SOFT uyarısını TAŞIMAZ.
   * Dönüş bare array (`UyapQuerySuggestion[]`); frontend (UyapQueryList/UyapQueryModal) `.map`
   * ile array olarak tüketir → `warnings` eklemek `{suggestions,warnings}` wrap'i gerektirir =
   * response-shape + frontend-contract KIRILIR. Outage uyarısı şimdilik yalnız createQuery'de
   * yüzeyleniyor; öneri-akışına uyarı frontend contract değişikliği gerektirir (ayrı PR).
   */
  async getSuggestedQueries(tenantId: string, caseDebtorId: string) {
    // Borçlu tipini al
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId },
      include: { debtor: { select: { type: true } } },
    });

    if (!caseDebtor) {
      throw new NotFoundException('Borçlu bulunamadı');
    }

    const isCompany = caseDebtor.debtor.type === 'COMPANY' || 
                      caseDebtor.debtor.type === 'PUBLIC_INSTITUTION';

    // Yapılmış sorguları al
    const completedQueries = await this.prisma.uyapQuery.findMany({
      where: { caseDebtorId, status: { in: ['PENDING', 'COMPLETED'] } },
      select: { queryType: true },
    });

    const completedTypes = completedQueries.map(q => q.queryType);

    // Önerilen sorguları filtrele
    const suggestions = QUERY_HIERARCHY
      .filter(q => {
        // Borçlu tipine uygun mu?
        if (isCompany && !q.forCompany) return false;
        if (!isCompany && !q.forIndividual) return false;
        // Zaten yapılmış mı?
        if (completedTypes.includes(q.type)) return false;
        return true;
      })
      .map(q => ({
        queryType: q.type,
        queryCode: q.code,
        name: q.name,
        priority: q.priority,
      }));

    return suggestions;
  }

  /**
   * Sorgu tipine göre AddressSource enum değeri
   */
  private getAddressSourceFromQueryType(queryType: UyapQueryType): string {
    const mapping: Record<UyapQueryType, string> = {
      [UyapQueryType.NUFUS_ADRES]: 'UYAP_AA',
      [UyapQueryType.SGK]: 'UYAP_AB',
      [UyapQueryType.TICARET_ODASI]: 'UYAP_AF',
      [UyapQueryType.VERGI_DAIRESI]: 'UYAP_AJ',
      [UyapQueryType.GSM]: 'UYAP_AR',
      [UyapQueryType.GUMRUK]: 'UYAP',
      [UyapQueryType.ORTAKLAR]: 'UYAP',
      [UyapQueryType.AILE]: 'UYAP',
      [UyapQueryType.ORTAK_DETAY]: 'UYAP',
    };
    return mapping[queryType] || 'UYAP';
  }

  /**
   * Sorgu kodu için bilgi getir
   */
  getQueryInfo(queryCode: string) {
    return QUERY_HIERARCHY.find(q => q.code === queryCode);
  }

  /**
   * Tüm sorgu tiplerini getir
   */
  getAllQueryTypes() {
    return QUERY_HIERARCHY.map(q => ({
      type: q.type,
      code: q.code,
      name: q.name,
      forIndividual: q.forIndividual,
      forCompany: q.forCompany,
    }));
  }
}
