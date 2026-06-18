import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger, Inject, forwardRef } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateCaseDto, UpdateCaseDto, CaseSubCategory, Currency, DueDto, CaseInstrumentInputDto, CaseStaffInputDto } from "./dto/case.dto";
import { Prisma, LegalCaseStatus } from "@prisma/client";
import { mapDueTypeToClaimItemType, buildClaimItemData } from "./due-to-claim-item.mapper";
import {
  resolveCaseInstrumentType,
  buildCaseInstrumentData,
  buildInstrumentPrincipalClaimItemData,
} from "./ocr-instrument-to-case-instrument.mapper";
import { randomUUID } from "crypto";
import { isInitialStatus } from "../case-status/case-status.service";
import { AuditService } from "../audit/audit.service";
import { ClientInfoRequestService } from "../address-discovery/client-info-request.service";
import { InterestEngineService } from "../interest-engine/interest-engine.service";
import { resolveInitialPolicy } from "../interest-engine/interest-strategy.config";
import { mapDtoCaseTypeToInterestCaseType } from "./case-type-mapping";
import { ExpenseRequestService } from "../expense-request/expense-request.service";
import { DomainEventIngestService } from "../icrabot/domain-event-ingest";
import { CollectionService } from "../collection/collection.service";
// RFA-016: case.create içindeki inline taraf oluşturma artık bu guard'lı servislere devredilir
// (tx.client/lawyer/debtor.create duplicate guard'ı atlıyordu → Şükrü-deseninin dış-kapı hali).
import { ClientService } from "../client/client.service";
import { LawyerService } from "../lawyer/lawyer.service";
import { DebtorService } from "../debtor/debtor.service";
import { DebtorType } from "@prisma/client";

/**
 * B5/D — sorumsuz (zero-responsible) case'te fallback sorumlu avukat seçimi.
 * Öncelik: PARTNER > MANAGER > AUTHORIZED > LAWYER > INTERN > rank'siz.
 * Eşit öncelikte İLK kayıt seçilir (strict `<` ile korunur). Aday yoksa -1.
 *
 * Saf fonksiyon (yan-etkisiz, izole test edilebilir). Yalnız createCase'in
 * "≥1 sorumlu" invariant'ı, hiç RESPONSIBLE yokken çağırır.
 *
 * @remarks Çağrıldığı yerler:
 * - CaseService.create() → POST /cases (Yeni Takip sihirbazı: sorumlu seçilmeden açılırsa fallback)
 */
export function pickResponsibleFallbackIndex(ranks: (string | null)[]): number {
  const priority: Record<string, number> = {
    PARTNER: 0,
    MANAGER: 1,
    AUTHORIZED: 2,
    LAWYER: 3,
    INTERN: 4,
  };
  const RANKLESS = 5; // rank'siz → en düşük öncelik (INTERN'den sonra)
  let bestIdx = -1;
  let bestPri = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ranks.length; i++) {
    const r = ranks[i];
    const pri = r != null && priority[r] !== undefined ? priority[r] : RANKLESS;
    if (pri < bestPri) {
      // strict `<` → eşit öncelikte İLK kayıt korunur
      bestPri = pri;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * B5/D — "≥1 sorumlu avukat" invariant kararı (saf). Verilen CaseLawyer listesinde
 * yükseltilecek satırın id'sini döndürür, yoksa null.
 *
 * Kurallar:
 * - Liste boşsa → null (hiç avukat yok → no-op).
 * - Zaten bir RESPONSIBLE varsa → null (explicit seçim / PARTNER-MANAGER KORUNUR; ezme/demote YOK).
 * - Hiç sorumlu yoksa → {@link pickResponsibleFallbackIndex} önceliğiyle BİR satır seç.
 *
 * @remarks Çağrıldığı yerler:
 * - CaseService.create() → POST /cases (createCase tx'inde post-loop invariant)
 */
export function resolveResponsiblePromotion(
  created: { id: string; lawyerRank: string | null; isResponsible: boolean }[],
): string | null {
  if (created.length === 0) return null;
  if (created.some((cl) => cl.isResponsible)) return null; // sorumlu zaten var → dokunma
  const idx = pickResponsibleFallbackIndex(created.map((cl) => cl.lawyerRank));
  return idx >= 0 ? created[idx].id : null;
}

@Injectable()
export class CaseService {
  private readonly logger = new Logger(CaseService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    @Inject(forwardRef(() => ClientInfoRequestService))
    private clientInfoRequestService: ClientInfoRequestService,
    @Inject(forwardRef(() => InterestEngineService))
    private interestEngineService: InterestEngineService,
    @Inject(forwardRef(() => ExpenseRequestService))
    private expenseRequestService: ExpenseRequestService,
    private domainEventIngestService: DomainEventIngestService,
    // G3d: tahsilat create/cancel tek otorite = CollectionService (kanonik yol:
    // closed/duplicate guard + PAYMENT_RECEIVED event + G3a ledger + CollectionAllocation).
    private collectionService: CollectionService,
    // RFA-016: inline taraf (id YOK) resolve/create için guard'lı servisler.
    private clientService: ClientService,
    private lawyerService: LawyerService,
    private debtorService: DebtorService,
  ) {}

  /**
   * RFA-016: case.create içindeki inline-yeni taraflar (id YOK) için guard'lı resolve/create.
   * Transaction ÖNCESİ çağrılır (Tasarım A): guard mantığı tek-kaynak kalır (replike edilmez),
   * exact/identity eşleşmesi mevcut kaydı reuse eder → silent duplicate önlenir. dto party'lerin
   * `.id` alanı yerinde set edilir; tx içindeki döngüler artık yalnız id kullanır (tx.X.create YOK).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseService.create() → POST /cases (Yeni Takip sihirbazı: inline-yeni müvekkil/avukat/borçlu)
   * </remarks>
   */
  private async resolveInlinePartiesBeforeTx(tenantId: string, dto: CreateCaseDto): Promise<void> {
    // 1) Müvekkil (creditor) — ClientService.create: identity (tckn/vkn) eşleşmesi → mevcut döndür
    //    (reactivate dahil). Kimliksizde fuzzy YOK (Müvekkil=TCKN kontratı). Throw etmez.
    if (dto.creditors?.length) {
      for (const c of dto.creditors) {
        if (c.id || !c.name) continue;
        const isCompany = c.type === "COMPANY";
        const parts = c.name.trim().split(/\s+/);
        const resolved: any = await this.clientService.create(tenantId, {
          type: c.type,
          name: c.name,
          firstName: !isCompany ? (parts.length > 1 ? parts.slice(0, -1).join(" ") : c.name.trim()) : undefined,
          lastName: !isCompany && parts.length > 1 ? parts[parts.length - 1] : undefined,
          companyName: isCompany ? c.name : undefined,
          tckn: !isCompany ? c.identityNo : undefined,
          vkn: isCompany ? c.identityNo : undefined,
          taxOffice: c.taxOffice,
          phone: c.phone,
          email: c.email,
          address: c.address,
        });
        c.id = resolved.id;
      }
    }

    // 2) Avukat — LawyerService.create: bar/tckn VEYA isim eşleşmesi → mevcut döndür (reactivate). Throw etmez.
    if (dto.lawyers?.length) {
      for (const l of dto.lawyers) {
        if (l.id || !l.name || !l.surname) continue;
        const resolved: any = await this.lawyerService.create(tenantId, {
          name: l.name, surname: l.surname, tckn: l.tckn, gender: l.gender,
          barNumber: l.barNumber, barCity: l.barCity, tbbNo: l.tbbNo,
          vergiDairesi: l.vergiDairesi, vergiNo: l.vergiNo,
          phone: l.phone, email: l.email, bankName: l.bankName, iban: l.iban,
          isInHouseCounsel: l.isInHouseCounsel, isEmployee: l.isEmployee, canSign: l.canSign,
        });
        l.id = resolved.id;
      }
    }

    // 3) Legacy borçlu (yalnız caseDebtors yoksa kullanılır; UI=NO ama API kapısı açık → guard'a çevrildi).
    //    DebtorService.create THROW eder: DUPLICATE_IDENTITY → mevcut reuse (client ile tutarlı);
    //    SIMILAR_NAME_REVIEW (kimliksiz isim) → case-create'te interaktif review yok → forceCreate
    //    (iki gerçek aynı-isimli borçlu meşru, IR-0). NOT: legacy `address` (deprecated JSON) artık
    //    taşınmaz; kanonik adres = DebtorAddress (legacy yol UI=NO).
    if (!dto.caseDebtors?.length && dto.debtors?.length) {
      for (const d of dto.debtors) {
        if (d.id || !d.name) continue;
        const isCompany = d.type === "COMPANY";
        const parts = d.name.trim().split(/\s+/);
        const mapped: any = {
          type: isCompany ? DebtorType.COMPANY : DebtorType.INDIVIDUAL,
          ...(isCompany
            ? { companyName: d.name, vkn: d.identityNo, taxOffice: d.taxOffice }
            : {
                firstName: parts.length > 1 ? parts.slice(0, -1).join(" ") : d.name.trim(),
                lastName: parts.length > 1 ? parts[parts.length - 1] : "",
                tckn: d.identityNo,
              }),
          phone: d.phone,
          email: d.email,
        };
        try {
          const resolved: any = await this.debtorService.create(tenantId, mapped);
          d.id = resolved.id;
        } catch (e: any) {
          const body = e?.response ?? e;
          if (body?.code === "DUPLICATE_IDENTITY" && body?.existingDebtor?.id) {
            d.id = body.existingDebtor.id; // kimlik eşleşmesi → mevcut reuse
          } else if (body?.code === "SIMILAR_NAME_REVIEW") {
            const forced: any = await this.debtorService.create(tenantId, { ...mapped, forceCreate: true });
            d.id = forced.id;
          } else {
            throw e;
          }
        }
      }
    }
  }

  /**
   * Vekalet kontrolü - müvekkil ve avukat arasında geçerli vekalet var mı?
   */
  private async checkPoaValidity(clientId: string, lawyerId: string): Promise<{ valid: boolean; message?: string }> {
    const now = new Date();
    
    const validPoa = await this.prisma.clientPowerOfAttorney.findFirst({
      where: {
        clientId,
        status: "ACTIVE",
        isActive: true,
        lawyers: {
          some: { lawyerId },
        },
        OR: [
          { isLimited: false },
          { isLimited: true, validUntil: { gte: now } },
        ],
      },
      include: {
        client: { select: { displayName: true } },
        lawyers: {
          where: { lawyerId },
          include: { lawyer: { select: { name: true, surname: true } } },
        },
      },
    });

    if (!validPoa) {
      return { valid: false, message: "Geçerli vekalet bulunamadı" };
    }

    // Süresi dolmak üzere mi kontrol et (30 gün)
    if (validPoa.isLimited && validPoa.validUntil) {
      const daysLeft = Math.ceil((validPoa.validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 30) {
        return { valid: true, message: `Vekalet ${daysLeft} gün içinde sona erecek` };
      }
    }

    return { valid: true };
  }

  /**
   * İlamlı Alt Kategori Validasyonları
   * - Nafaka + Döviz aynı anda seçilemez
   * - Döviz seçildiğinde kur tarihi zorunlu
   * - Nafaka seçildiğinde aylık tutar önerilir
   */
  private validateSubCategoryRules(dto: CreateCaseDto) {
    const { subCategory, currency, exchangeDate, nafakaStartDate, monthlyNafakaAmount } = dto;

    // Kural 1: Nafaka + Döviz aynı anda olamaz
    if (subCategory === CaseSubCategory.NAFAKA && currency && currency !== Currency.TRY) {
      throw new BadRequestException(
        "Nafaka alacağı sadece TL cinsinden olabilir. Döviz ve nafaka aynı anda seçilemez."
      );
    }

    // Kural 2: Döviz alacağı seçildiğinde para birimi TRY olamaz
    if (subCategory === CaseSubCategory.DOVIZ && (!currency || currency === Currency.TRY)) {
      throw new BadRequestException(
        "Döviz alacağı seçildiğinde para birimi (USD, EUR, GBP, CHF) belirtilmelidir."
      );
    }

    // Kural 3: Döviz alacağı için kur tarihi zorunlu (uyarı seviyesinde)
    if (subCategory === CaseSubCategory.DOVIZ && !exchangeDate) {
      // Uyarı: Kur tarihi belirtilmedi, fiili ödeme tarihi kullanılacak
      // Bu bir hata değil, sadece bilgi
    }

    // Kural 4: Nafaka için başlangıç tarihi ve aylık tutar önerilir
    if (subCategory === CaseSubCategory.NAFAKA) {
      if (!nafakaStartDate) {
        // Uyarı seviyesinde - zorunlu değil
      }
      if (!monthlyNafakaAmount) {
        // Uyarı seviyesinde - zorunlu değil
      }
    }

    // Kural 5: Alt kategori otomatik belirleme (currency'ye göre)
    // Bu frontend'de yapılacak, backend sadece validasyon yapar
  }

  /**
   * Alt kategoriye göre faiz açıklaması otomatik oluştur
   */
  private generateInterestDescription(subCategory: CaseSubCategory, currency?: Currency): string {
    switch (subCategory) {
      case CaseSubCategory.NAFAKA:
        return "devam eden aylarla birlikte tahsili talebidir.";
      case CaseSubCategory.DOVIZ:
        // Currency parametresini kullanarak daha spesifik açıklama
        const currencyName = currency ? this.getCurrencyName(currency) : 'döviz';
        return `fiili ödeme tarihindeki T.C. Merkez Bankası ${currencyName} efektif satış kuru üzerinden Türk Lirası karşılığının tahsili talebidir.`;
      case CaseSubCategory.GENEL:
      default:
        return "değişen oranlarda yasal faizi ile birlikte tahsili talebidir.";
    }
  }

  /**
   * Currency enum'ını Türkçe isme çevir
   */
  private getCurrencyName(currency: Currency): string {
    const names: Record<Currency, string> = {
      [Currency.TRY]: 'TL',
      [Currency.USD]: 'ABD Doları',
      [Currency.EUR]: 'Euro',
      [Currency.GBP]: 'İngiliz Sterlini',
      [Currency.CHF]: 'İsviçre Frangı',
    };
    return names[currency] || currency;
  }

  /**
   * Lookup ID'lerinin doğru tenant'a ait olduğunu kontrol et
   * Güvenlik: Başka tenant'ın lookup değerlerinin kullanılmasını engeller
   */
  private async validateLookupIds(
    tenantId: string,
    lookupIds: {
      takipTuruId?: string | null;
      asamaId?: string | null;
      riskId?: string | null;
      durumEtiketiId?: string | null;
      mahiyetTipiId?: string | null;
      borcluTipiId?: string | null;
    }
  ): Promise<void> {
    const validations: Promise<boolean>[] = [];

    if (lookupIds.takipTuruId) {
      validations.push(
        this.prisma.lookupTakipTuru.findFirst({
          where: { id: lookupIds.takipTuruId, tenantId },
        }).then(r => !!r)
      );
    }

    if (lookupIds.asamaId) {
      validations.push(
        this.prisma.lookupAsama.findFirst({
          where: { id: lookupIds.asamaId, tenantId },
        }).then(r => !!r)
      );
    }

    if (lookupIds.riskId) {
      validations.push(
        this.prisma.lookupRisk.findFirst({
          where: { id: lookupIds.riskId, tenantId },
        }).then(r => !!r)
      );
    }

    if (lookupIds.durumEtiketiId) {
      validations.push(
        this.prisma.lookupDurumEtiketi.findFirst({
          where: { id: lookupIds.durumEtiketiId, tenantId },
        }).then(r => !!r)
      );
    }

    if (lookupIds.mahiyetTipiId) {
      validations.push(
        this.prisma.lookupMahiyetTipi.findFirst({
          where: { id: lookupIds.mahiyetTipiId, tenantId },
        }).then(r => !!r)
      );
    }

    if (lookupIds.borcluTipiId) {
      validations.push(
        this.prisma.lookupBorcluTipi.findFirst({
          where: { id: lookupIds.borcluTipiId, tenantId },
        }).then(r => !!r)
      );
    }

    const results = await Promise.all(validations);
    if (results.some(r => r === false)) {
      throw new BadRequestException('Geçersiz lookup ID: Belirtilen değer bu büroya ait değil');
    }
  }

  async findAll(tenantId: string, params?: { status?: string; expenseRequestStatus?: string; clientId?: string; page?: number; limit?: number }) {
    const { status, expenseRequestStatus, clientId, page = 1, limit = 20 } = params || {};

    const where: any = { tenantId };
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    
    // Masraf talebi durumuna göre filtreleme
    if (expenseRequestStatus) {
      where.expenseRequests = {
        some: {
          status: expenseRequestStatus,
        },
      };
    }

    const [cases, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        include: {
          client: { select: { id: true, name: true } },
          debtors: {
            include: { 
              debtor: { 
                select: { 
                  id: true, 
                  name: true, 
                  identityNo: true,
                  phone: true,
                  email: true,
                  addresses: true,
                } 
              },
              selectedAddress: {
                select: { id: true, street: true, city: true }
              }
            },
          },
          lawyers: {
            include: { lawyer: { select: { id: true, name: true, surname: true } } },
          },
          executionOffice: { select: { id: true, name: true, city: true, uyapCode: true } },
          risk: { select: { id: true, name: true, color: true } },
          asama: { select: { id: true, name: true, code: true } },
          takipTuru: { select: { id: true, name: true } },
          sorumluPersonel: { select: { id: true, name: true, surname: true } },
          lifecycleEvents: {
            where: { action: { in: ['ICRA_ISLEMI', 'TEBLIGAT', 'HACIZ', 'TAHSILAT', 'STATUS_CHANGE'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true },
          },
          collections: {
            orderBy: { date: 'desc' },
            take: 1,
            select: { date: true },
          },
          expenseRequests: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true, status: true, totalAmount: true, dueDate: true, sentAt: true },
          },
          _count: { select: { tasks: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.case.count({ where }),
    ]);

    // Her case için ek bilgileri hesapla
    const now = new Date();
    const casesWithExtras = await Promise.all(
      cases.map(async (c) => {
        // Vekalet kontrolü
        let hasValidPoa = true;
        if (c.clientId && c.lawyers && c.lawyers.length > 0) {
          const lawyerIds = c.lawyers.map((l: any) => l.lawyerId);
          const validPoa = await this.prisma.clientPowerOfAttorney.findFirst({
            where: {
              clientId: c.clientId,
              status: "ACTIVE",
              isActive: true,
              lawyers: { some: { lawyerId: { in: lawyerIds } } },
              OR: [
                { isLimited: false },
                { isLimited: true, validUntil: { gte: now } },
              ],
            },
          });
          hasValidPoa = !!validPoa;
        }
        
        // Son işlem tarihi
        const lastActionDate = c.lifecycleEvents?.[0]?.createdAt || null;
        
        // Son tahsilat tarihi
        const lastCollectionDate = c.collections?.[0]?.date || null;
        
        // Kalan gün hesabı (pasifleşmeye)
        let daysUntilPassive: number | null = null;
        if (lastActionDate) {
          const daysSinceLastAction = Math.floor((now.getTime() - new Date(lastActionDate).getTime()) / (1000 * 60 * 60 * 24));
          daysUntilPassive = Math.max(0, 365 - daysSinceLastAction); // 1 yıl pasifleşme süresi varsayımı
        }
        
        // Finansal özet hesapla
        const [collectionAgg, expenseAgg, claimAgg] = await Promise.all([
          // Tahsilat toplamı
          this.prisma.collection.aggregate({
            where: { caseId: c.id },
            _sum: { amount: true },
          }),
          // Masraf toplamı (tüm masraf talepleri)
          this.prisma.expenseRequest.aggregate({
            where: { caseId: c.id },
            _sum: { totalAmount: true, paidAmount: true },
          }),
          // Toplam alacak (ClaimItem'lardan - demandedAmount toplamı)
          this.prisma.claimItem.aggregate({
            where: { caseId: c.id },
            _sum: { demandedAmount: true },
          }),
        ]);
        
        const totalCollected = Number(collectionAgg._sum?.amount || 0);
        const totalExpense = Number(expenseAgg._sum?.totalAmount || 0);
        const expenseCollected = Number(expenseAgg._sum?.paidAmount || 0);
        // Toplam alacak: ClaimItem varsa oradan, yoksa principalAmount'tan
        const totalClaim = Number(claimAgg._sum?.demandedAmount || 0) || Number(c.principalAmount || 0);
        
        // Borçu adresleriyle birlikte döndür
        const debtorsWithAddress = c.debtors.map((d: any) => ({
          ...d,
          debtor: {
            ...d.debtor,
            address: d.debtor.addresses?.primary || d.debtor.addresses?.notification || null,
          },
        }));
        
        return {
          ...c,
          debtors: debtorsWithAddress,
          hasValidPoa,
          lastActionDate: lastActionDate?.toISOString() || null,
          lastCollectionDate: lastCollectionDate?.toISOString() || null,
          daysUntilPassive,
          // Finansal özet
          totalClaim,
          totalCollected,
          totalExpense,
          expenseCollected,
          // Masraf talebi durumu
          latestExpenseRequest: c.expenseRequests?.[0] || null,
          expenseRequestStatus: c.expenseRequests?.[0]?.status || null,
          // lifecycleEvents ve collections'ı response'dan çıkar (gereksiz)
          lifecycleEvents: undefined,
          collections: undefined,
          expenseRequests: undefined,
        };
      })
    );

    return {
      data: casesWithExtras,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: string, id: string) {
    const caseItem = await this.prisma.case.findFirst({
      where: { id, tenantId },
      include: {
        client: true,
        court: true,
        formType: { select: { id: true, name: true, code: true } },
        executionOffice: true,
        debtors: { include: { debtor: true } },
        lawyers: { 
          include: { 
            lawyer: {
              select: {
                id: true,
                name: true,
                surname: true,
                barNumber: true,
                phone: true,
                email: true,
                address: true,
                bankName: true,
                branchName: true,
                iban: true,
                lawyerRank: true,
                defaultPermissions: true,
                // RFA-010: pasif avukat gizlenmez; detayda [Pasif] etiketi için bayrak taşınır.
                isActive: true,
              }
            }
          }
        },
        staff: {
          include: {
            staffMember: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                staffType: true,
                phone: true,
                email: true,
                // RFA-010: pasif personel gizlenmez; detayda [Pasif] etiketi için bayrak taşınır.
                isActive: true,
              }
            }
          }
        },
        caseClients: {
          include: {
            client: {
              select: {
                id: true,
                name: true,
                displayName: true,
                type: true,
                tckn: true,
                vkn: true,
                taxOffice: true,
                phone: true,
                email: true,
                address: true,
                city: true,
                district: true,
                // RFA-010: pasif müvekkil gizlenmez; detayda [Pasif] etiketi için bayrak taşınır.
                isActive: true,
                bankAccounts: {
                  select: {
                    id: true,
                    bankName: true,
                    branchName: true,
                    iban: true,
                    accountHolder: true,
                    isPrimary: true,
                  }
                },
              }
            } 
          } 
        },
        tasks: { orderBy: { createdAt: "desc" }, take: 10 },
        collections: { orderBy: { date: "desc" } },
        dues: true,
        claimItems: { orderBy: { sortOrder: "asc" } },
        lifecycleEvents: { orderBy: { createdAt: "desc" }, take: 20 },
        statusHistory: { 
          orderBy: { createdAt: "desc" }, 
          take: 10,
          include: { changedBy: { select: { name: true, surname: true } } }
        },
        riskReports: { orderBy: { createdAt: "desc" }, take: 1 },
        // Lookup ilişkileri
        takipTuru: { select: { id: true, code: true, name: true } },
        asama: { select: { id: true, code: true, name: true } },
        risk: { select: { id: true, code: true, name: true, color: true } },
        borcluTipi: { select: { id: true, code: true, name: true } },
        durumEtiketi: { select: { id: true, code: true, name: true, color: true } },
        mahiyetTipi: { select: { id: true, code: true, name: true, uyapCode: true } },
        sorumluPersonel: { select: { id: true, name: true, surname: true } },
        groups: { include: { group: { select: { id: true, name: true, color: true } } } },
      },
    });

    if (!caseItem) {
      throw new NotFoundException("Takip bulunamadı");
    }

    // Çek/Senet bilgilerini ayrı sorgula (CaseInstrument tablosu)
    const instruments = await this.prisma.caseInstrument.findMany({
      where: { caseId: id },
      select: {
        id: true,
        instrumentType: true,
        serialNo: true,
        amount: true,
        issueDate: true,
        maturityDate: true,
        presentmentDate: true,
        isBounced: true,
        bounceDate: true,
        bankName: true,
        bankBranch: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Raporlama özeti oluştur
    const reportingSummary = this.buildReportingSummary(caseItem);

    return {
      ...caseItem,
      instruments,
      reportingSummary,
    };
  }

  /**
   * Raporlama özeti oluştur
   * Format: "Mahiyet / Takip Türü / Risk: X / Durum: Y"
   */
  private buildReportingSummary(caseItem: any): string {
    const parts: string[] = [];

    // Mahiyet Tipi
    if (caseItem.mahiyetTipi?.name) {
      parts.push(caseItem.mahiyetTipi.name);
    }

    // Takip Türü (kısa)
    if (caseItem.takipTuru?.name) {
      // Kısa versiyon: "İlamsız Genel Haciz" -> "İlamsız"
      const shortName = caseItem.takipTuru.name.split(' ')[0];
      parts.push(shortName);
    }

    // Risk
    if (caseItem.risk?.name) {
      parts.push(`Risk: ${caseItem.risk.name}`);
    }

    // Durum Etiketi
    if (caseItem.durumEtiketi?.name) {
      parts.push(`Durum: ${caseItem.durumEtiketi.name}`);
    }

    // Grup sayısı
    const groupCount = caseItem.groups?.length || 0;
    if (groupCount > 0) {
      parts.push(`${groupCount} grup`);
    }

    return parts.length > 0 ? parts.join(' / ') : 'Sınıflandırılmamış';
  }

  /**
   * G1 KÖPRÜSÜ — dosya açılışındaki dues'tan kanonik ClaimItem üretir.
   *
   * Kanonik alacak modeli = ClaimItem; bakiye/TBK100 motoru yalnız ClaimItem okur.
   * Due satırları korunur (legacy/transition + nafaka taksit takvimi). NAFAKA için
   * ClaimItem üretilmez (mapper null döner). tenantId zorunlu set edilir (multitenant;
   * Due'da tenantId yok, ClaimItem tenant-scoped). Çağıranın transaction'ı kullanılır.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseService.create() → POST /cases (create $transaction içi, dues sonrası)
   * </remarks>
   */
  private async createClaimItemsFromDues(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    dues: DueDto[],
  ): Promise<void> {
    for (const due of dues) {
      const itemType = mapDueTypeToClaimItemType(due.type);
      if (itemType === null) continue; // NAFAKA → yalnız Due (taksit takvimi)
      await tx.claimItem.create({
        data: buildClaimItemData(tenantId, caseId, due, itemType),
      });
    }
  }

  /**
   * PR-N3-wire: çoklu-enstrüman pipeline AÇIK mı (env flag; varsayılan KAPALI).
   * ocr.service.isMultiInstrumentEnabled ile AYNI anahtar/semantik (ConfigModule .env'i
   * process.env'e yükler). KAPALIYKEN createCase legacy BİREBİR (instruments[] yok sayılır).
   *
   * @remarks Çağrıldığı yerler:
   * - CaseService.create() → POST /cases (instrument işleme kapısı; AS1 kapsam sınırı).
   */
  private multiInstrumentEnabled(): boolean {
    return process.env.OCR_MULTI_INSTRUMENT === "true";
  }

  /**
   * PR-N3-wire: OCR kambiyo enstrümanlarını createCase tx içinde kanonik kayda çevirir —
   * her GEÇERLİ instrument için: CaseInstrument (hukuki evrak) + bağlı PRINCIPAL ClaimItem
   * (parasal yansıma, instrumentId BAĞ). Toplam instrument PRINCIPAL tutarını döndürür
   * (caller principalAmount'a ekler).
   *
   * INVARIANT (resolveCaseInstrumentType): kambiyo-değil (FATURA/DIGER) / documentNo boş /
   * amount≤0 / currency yok / issueDate yok → ATLA (sessiz create YOK).
   * K1: PRINCIPAL YALNIZ buradan; dues[]'da tekrarlanmaz → çift-sayım yok.
   * Flag KAPALI veya instruments boş → hiçbir şey üretmez, 0 döner (legacy).
   *
   * @remarks Çağrıldığı yerler:
   * - CaseService.create() → POST /cases (dues/ClaimItem sonrası 6c adımı; flag-gated AS1).
   */
  private async createInstrumentsAndClaims(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    instruments: CaseInstrumentInputDto[],
    enabled: boolean,
  ): Promise<number> {
    if (!enabled || instruments.length === 0) return 0;
    let totalPrincipal = 0;
    for (const input of instruments) {
      const instrumentType = resolveCaseInstrumentType(input);
      if (instrumentType === null) continue; // kambiyo değil / eksik → sessiz create YOK
      const created = await tx.caseInstrument.create({
        data: buildCaseInstrumentData(tenantId, caseId, input, instrumentType),
      });
      await tx.claimItem.create({
        data: buildInstrumentPrincipalClaimItemData(tenantId, caseId, created.id, input),
      });
      totalPrincipal += input.amount;
    }
    return totalPrincipal;
  }

  /**
   * Dosyaya personel ata — createCase tx step-8 (ASSIGN-2a / PR-ASSIGN-2a).
   * - dtoStaff DİZİ ise (Array.isArray; null/undefined DEĞİL) SEÇİM KANONİK OTORİTEDİR: yalnız bu
   *   liste yazılır; isDefaultForNewCases ile MERGE YOK (kullanıcı default'u çıkardıysa eklenmez).
   *   Boş dizi → hiç personel (deselection'a saygı). staffMemberId dedupe edilir; tenant ownership
   *   doğrulanır (cross-tenant/nonexistent → BadRequestException, hiç create yapılmaz).
   * - dtoStaff DİZİ DEĞİLse (undefined VEYA null) mevcut davranış AYNEN korunur: isDefaultForNewCases
   *   personelleri eklenir. (ASSIGN-2a-FU: `Array.isArray` guard → `staff: null` payload'ı crash
   *   etmez, undefined gibi güvenli default'a düşer; @IsOptional null'a izin verdiği için gerekli.)
   * Saf: yalnız verilen tx üzerinde çalışır → izole test edilebilir (case-create-instruments deseni).
   * @remarks Çağrıldığı yer: CaseService.create() → POST /cases (createCase tx step-8).
   */
  private async assignCaseStaff(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    dtoStaff?: CaseStaffInputDto[],
  ): Promise<{ selectionProvided: boolean; assigned: { staffMemberId: string; roleOnCase: string }[] }> {
    const assigned: { staffMemberId: string; roleOnCase: string }[] = [];

    if (Array.isArray(dtoStaff)) {
      // Seçim otoritesi: yalnız gönderilen personel (dedupe).
      const requestedIds = Array.from(new Set(dtoStaff.map((s) => s.staffMemberId).filter(Boolean)));
      if (requestedIds.length > 0) {
        // Tenant ownership: tüm id'ler bu tenant'a ait olmalı.
        const owned = await tx.staffMember.findMany({
          where: { tenantId, id: { in: requestedIds } },
          select: { id: true, staffType: true },
        });
        if (owned.length !== requestedIds.length) {
          const ownedIds = new Set(owned.map((s) => s.id));
          const invalid = requestedIds.filter((id) => !ownedIds.has(id));
          throw new BadRequestException(
            `Geçersiz veya başka tenant'a ait personel: ${invalid.join(', ')}`,
          );
        }
        const roleByDto = new Map(dtoStaff.map((s) => [s.staffMemberId, s.roleOnCase]));
        const typeById = new Map(owned.map((s) => [s.id, s.staffType]));
        for (const id of requestedIds) {
          const roleOnCase = roleByDto.get(id) || typeById.get(id) || 'PERSONEL';
          await tx.caseStaff.create({ data: { caseId, staffMemberId: id, roleOnCase } });
          assigned.push({ staffMemberId: id, roleOnCase });
        }
      }
      return { selectionProvided: true, assigned };
    }

    // dtoStaff undefined → eski davranış AYNEN: isDefaultForNewCases personelleri ekle.
    const defaultStaffMembers = await tx.staffMember.findMany({
      where: { tenantId, isDefaultForNewCases: true, isActive: true },
      select: { id: true, staffType: true },
    });
    for (const staff of defaultStaffMembers) {
      await tx.caseStaff.create({
        data: { caseId, staffMemberId: staff.id, roleOnCase: staff.staffType || 'PERSONEL' },
      });
      assigned.push({ staffMemberId: staff.id, roleOnCase: staff.staffType || 'PERSONEL' });
    }
    return { selectionProvided: false, assigned };
  }

  /**
   * Personel atamasını audit'le (ASSIGN-0: "dosyaya personel ekleme"). Yalnız seçim yoluyla
   * (dtoStaff verildiğinde) ve ≥1 personel atandığında anlamlı; default yol mevcut davranışı
   * AYNEN korur (ek audit üretmez). Tx DIŞINDA (commit sonrası) çağrılmalı.
   * @remarks Çağrıldığı yer: CaseService.create() → POST /cases (tx commit sonrası).
   */
  private async auditStaffAssignment(
    tenantId: string,
    caseId: string,
    assigned: { staffMemberId: string; roleOnCase: string }[],
  ): Promise<void> {
    if (assigned.length === 0) return;
    await this.auditService.log({
      tenantId,
      action: 'CREATE',
      entityType: 'CASE_STAFF',
      entityId: caseId,
      newValues: { staff: assigned },
      description: `Dosyaya ${assigned.length} personel atandı`,
    });
  }

  async create(tenantId: string, dto: CreateCaseDto, userId?: string) {
    // INTEREST_POLICY_ASSIGNED (HR-26: HUMAN actor zorunlu) için userId şart.
    // "Bu faiz politikasını kim atadı?" sorusunun cevabı olmadan event hukuken zayıf.
    // Fail-fast: tx başlamadan reddet ('unknown' actor kabul edilmez).
    if (!userId) {
      throw new BadRequestException(
        "Case oluşturmak için kullanıcı kimliği (userId) zorunludur (faiz politikası ataması audit'i)."
      );
    }

    // B.5: Başlangıç statüsü validasyonu
    if (dto.caseStatus && !isInitialStatus(dto.caseStatus as LegalCaseStatus)) {
      throw new BadRequestException(
        `Geçersiz başlangıç statüsü: ${dto.caseStatus}. Sadece DERDEST, ISLEMDE veya DERKENAR seçilebilir.`
      );
    }

    // İlamlı Alt Kategori Validasyonları
    this.validateSubCategoryRules(dto);

    try {
      // B4/D: fileNumber ön-benzersizlik kontrolü — tx-öncesi taraf yaratımından
      // (resolveInlinePartiesBeforeTx) HEMEN ÖNCE. Mükerrer dosya no'da Case tx zaten
      // aşağıdaki P2002 ile patlardı; fakat o ana dek inline-yeni müvekkil/borçlu/avukat
      // KALICI yaratılmış olurdu (orphan yan-etki). Erken 409 → hiç taraf yaratılmaz.
      // where TENANT-SCOPED: @@unique([tenantId, fileNumber]) constraint'i ile birebir.
      // NOT: Bu, atomiklik garantisi DEĞİL; eşzamanlı çift submit (TOCTOU) için aşağıdaki
      // P2002 catch backstop olarak KORUNUR.
      if (dto.fileNumber) {
        const duplicate = await this.prisma.case.findFirst({
          where: { tenantId, fileNumber: dto.fileNumber },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException(
            `Bu dosya numarası (${dto.fileNumber}) zaten kullanılıyor`
          );
        }
      }

      // RFA-016: inline-yeni taraflar (id YOK) tx ÖNCESİ guard'lı servislerle resolve edilir
      // (Tasarım A). Böylece tx içinde duplicate guard bypass'lı tx.client/lawyer/debtor.create kalmaz.
      await this.resolveInlinePartiesBeforeTx(tenantId, dto);

      const result = await this.prisma.$transaction(async (tx) => {
        // 1. Alacaklıları (Clients) hazırla - tüm creditors'ları kaydet
        const clientIds: string[] = [];
        let primaryClientId: string | undefined;
        
        if (dto.creditors && dto.creditors.length > 0) {
          for (const creditor of dto.creditors) {
            // RFA-016: inline-yeni müvekkil id'si tx ÖNCESİ guard'lı ClientService.create ile
            // resolve edildi (reuse/reactivate dahil). Burada tx.client.create YOK; yalnız id kullanılır.
            if (!creditor.id) continue; // isimsiz/çözülemeyen → atla
            clientIds.push(creditor.id);
            if (!primaryClientId) primaryClientId = creditor.id;
          }
        }

        // İcra dairesinin UYAP kodunu al (eğer DTO'da yoksa)
        let uyapBirimKodu = dto.uyapBirimKodu;
        if (!uyapBirimKodu && dto.executionOfficeId) {
          const executionOffice = await tx.executionOffice.findUnique({
            where: { id: dto.executionOfficeId },
            select: { uyapCode: true },
          });
          uyapBirimKodu = executionOffice?.uyapCode || undefined;
        }

        // 2. Case oluştur
        const newCase = await tx.case.create({
          data: {
            tenantId,
            fileNumber: dto.fileNumber,
            executionFileNumber: dto.executionFileNumber,
            type: dto.type,
            subType: dto.subType,
            status: dto.status || "ACTIVE",
            // Yeni alanlar
            executionPath: dto.executionPath || "HACIZ",
            caseStatus: dto.caseStatus || "DERDEST",
            caseDate: dto.startDate ? new Date(dto.startDate) : new Date(),
            executionOfficeId: dto.executionOfficeId,
            uyapBirimKodu: uyapBirimKodu,
            hasUyapWarning: !uyapBirimKodu,
            hasArticle4Request: dto.hasArticle4Request || false,
            isAutomationEnabled: true,
            // Alt Kategori ve Para Birimi (UYAP Uyumlu)
            subCategory: dto.subCategory || "GENEL",
            currency: dto.currency || "TRY",
            // MTS Bilgileri
            isMtsCase: dto.isMtsCase || false,
            mtsReferenceNo: dto.mtsReferenceNo,
            // Faiz Bilgileri
            interestType: dto.interestType || "YASAL",
            interestStartDate: dto.interestStartDate ? new Date(dto.interestStartDate) : undefined,
            interestDescription: dto.interestDescription || this.generateInterestDescription(
              (dto.subCategory as CaseSubCategory) || CaseSubCategory.GENEL,
              dto.currency as Currency
            ),
            // Döviz Bilgileri (Prisma generate sonrası aktif olacak)
            ...(dto.exchangeDate && { exchangeDate: new Date(dto.exchangeDate) }),
            ...(dto.exchangeRateType && { exchangeRateType: dto.exchangeRateType }),
            ...(!dto.exchangeRateType && dto.subCategory === "DOVIZ" && { exchangeRateType: "ODEME_TARIHI" }),
            // Nafaka Bilgileri
            ...(dto.nafakaStartDate && { nafakaStartDate: new Date(dto.nafakaStartDate) }),
            ...(dto.monthlyNafakaAmount && { monthlyNafakaAmount: dto.monthlyNafakaAmount }),
            // OCR / Belge Tarama Bilgileri
            ...(dto.preDetectedCaseType && { preDetectedCaseType: dto.preDetectedCaseType }),
            ...(dto.preDetectedSubCategory && { preDetectedSubCategory: dto.preDetectedSubCategory }),
            ...(dto.ocrText && { ocrText: dto.ocrText.substring(0, 2000) }), // İlk 2000 karakter
            ...(dto.isAutoDetected !== undefined && { isAutoDetected: dto.isAutoDetected }),
            ...(dto.confidenceScore !== undefined && { confidenceScore: dto.confidenceScore }),
            ...(dto.sourceDocumentId && { sourceDocumentId: dto.sourceDocumentId }),
            ...(dto.detectionKeywords && { detectionKeywords: dto.detectionKeywords }),
            // Eski alanlar
            clientId: primaryClientId,
            courtId: dto.courtId,
            principalAmount: dto.principalAmount,
            interestRate: dto.interestRate,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            notes: dto.notes,
          },
        });

        // 3. CaseClient ilişkilerini oluştur (tüm alacaklılar için)
        if (clientIds.length > 0) {
          for (let i = 0; i < clientIds.length; i++) {
            await tx.caseClient.create({
              data: {
                caseId: newCase.id,
                clientId: clientIds[i],
                role: i === 0 ? "ALACAKLI" : "ORTAK_ALACAKLI",
              },
            });
          }
        }

        // 4. Avukatları - mevcut veya yeni
        // B5/D: oluşturulan CaseLawyer'ları izle (post-loop "≥1 sorumlu" invariant'ı için).
        const createdCaseLawyers: { id: string; lawyerRank: string | null; isResponsible: boolean }[] = [];
        if (dto.lawyers && dto.lawyers.length > 0) {
          for (const lawyerDto of dto.lawyers) {
            let lawyerId: string;
            let lawyerRank: string | null = null;
            
            // RFA-016: inline-yeni avukat id'si tx ÖNCESİ guard'lı LawyerService.create ile resolve
            // edildi (reuse/reactivate dahil). Burada tx.lawyer.create YOK; yalnız id kullanılır.
            if (!lawyerDto.id) continue; // isimsiz/çözülemeyen → atla
            lawyerId = lawyerDto.id;
            const existingLawyer = await tx.lawyer.findUnique({
              where: { id: lawyerId },
              select: { lawyerRank: true },
            });
            lawyerRank = existingLawyer?.lawyerRank || null;

            // LawyerRank'e göre CaseLawyerRole belirle
            let caseRole: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN' = 'ASSIGNED';
            if (lawyerDto.isResponsible) {
              caseRole = 'RESPONSIBLE';
            } else if (lawyerRank) {
              // Büro ayarlarındaki rank'e göre dosya rolü
              switch (lawyerRank) {
                case 'PARTNER':
                case 'MANAGER':
                  caseRole = 'RESPONSIBLE'; // Ortak/Yönetici → Sorumlu
                  break;
                case 'AUTHORIZED':
                  caseRole = 'ASSIGNED'; // Yetkili → Atanmış
                  break;
                case 'LAWYER':
                  caseRole = 'ASSISTANT'; // Avukat → Yardımcı
                  break;
                case 'INTERN':
                  caseRole = 'INTERN'; // Stajyer → Stajyer
                  break;
                default:
                  caseRole = 'ASSIGNED';
              }
            }

            const createdLawyer = await tx.caseLawyer.create({
              data: {
                caseId: newCase.id,
                lawyerId,
                canSign: lawyerDto.canSign || false,
                isResponsible: caseRole === 'RESPONSIBLE',
                hasSignatureAuthority: lawyerDto.hasSignatureAuthority || false,
                role: caseRole,
              },
            });
            createdCaseLawyers.push({ id: createdLawyer.id, lawyerRank, isResponsible: caseRole === 'RESPONSIBLE' });
          }
        }

        // 5. Borçluları - Yeni CaseDebtor formatı (öncelikli)
        if (dto.caseDebtors && dto.caseDebtors.length > 0) {
          for (const caseDebtorDto of dto.caseDebtors) {
            await tx.caseDebtor.create({
              data: {
                caseId: newCase.id,
                debtorId: caseDebtorDto.debtorId,
                role: (caseDebtorDto.role as any) || "ASIL_BORCLU",
                liabilityAmount: caseDebtorDto.liabilityAmount,
                liabilityType: caseDebtorDto.liabilityType,
                notificationMode: (caseDebtorDto.notificationMode as any) || "NORMAL",
                selectedAddressId: caseDebtorDto.selectedAddressId,
                prepareNotification: caseDebtorDto.prepareNotification ?? true,
                ilanenJustification: caseDebtorDto.ilanenJustification,
                caseNote: caseDebtorDto.caseNote,
              } as any,
            });
          }
        }
        // Eski format (geriye uyumluluk) - sadece caseDebtors yoksa kullan
        else if (dto.debtors && dto.debtors.length > 0) {
          for (const debtorDto of dto.debtors) {
            // RFA-016: inline-yeni borçlu id'si tx ÖNCESİ guard'lı DebtorService.create ile resolve
            // edildi (kimlik eşleşmesi → reuse). Burada tx.debtor.create YOK; yalnız id kullanılır.
            if (!debtorDto.id) continue; // isimsiz/çözülemeyen → atla
            await tx.caseDebtor.create({
              data: {
                caseId: newCase.id,
                debtorId: debtorDto.id,
                role: "ASIL_BORCLU",
              },
            });
          }
        }

        // 6. Alacak Kalemleri (Dues)
        let duesPrincipal = 0;
        if (dto.dues && dto.dues.length > 0) {
          for (const dueDto of dto.dues) {
            await tx.due.create({
              data: {
                caseId: newCase.id,
                type: dueDto.type,
                description: dueDto.description,
                amount: dueDto.amount,
                dueDate: new Date(dueDto.dueDate),
              },
            });
          }

          // 6b. G1 KÖPRÜSÜ — kanonik ClaimItem'lar üret (bakiye motoru bunları okur).
          // Due satırları korunur (legacy/transition + nafaka takvimi); NAFAKA için
          // ClaimItem üretilmez. Aynı tx içinde, tenantId zorunlu.
          await this.createClaimItemsFromDues(tx, tenantId, newCase.id, dto.dues);

          // Ana para (dues PRINCIPAL); case.update aşağıda instrument ile birleştirilir.
          duesPrincipal = dto.dues
            .filter(d => d.type === 'PRINCIPAL')
            .reduce((sum, d) => sum + d.amount, 0);
        }

        // 6c. PR-N3-wire: kambiyo enstrümanları → CaseInstrument + bağlı PRINCIPAL ClaimItem
        // (flag-gated AS1; K1: PRINCIPAL tek kaynak = instrument, dues'da tekrarlanmaz → çift-sayım yok).
        const instrumentPrincipal = await this.createInstrumentsAndClaims(
          tx,
          tenantId,
          newCase.id,
          dto.instruments ?? [],
          this.multiInstrumentEnabled(),
        );

        // Ana para toplamı = dues PRINCIPAL + instrument PRINCIPAL → case.principalAmount (G5 @deprecated).
        const totalPrincipal = duesPrincipal + instrumentPrincipal;
        if (totalPrincipal > 0) {
          await tx.case.update({
            where: { id: newCase.id },
            data: { principalAmount: totalPrincipal },
          });
        }

        // 7. Varsayılan stajyer avukatları ekle (isDefaultForNewCases = true)
        const existingLawyerIds = dto.lawyers?.map(l => l.id).filter(Boolean) || [];
        const defaultInternLawyers = await tx.lawyer.findMany({
          where: {
            tenantId,
            isDefaultForNewCases: true,
            isActive: true,
            id: { notIn: existingLawyerIds as string[] }, // Zaten eklenmişleri hariç tut
          },
          select: { id: true, lawyerRank: true },
        });

        for (const lawyer of defaultInternLawyers) {
          const createdIntern = await tx.caseLawyer.create({
            data: {
              caseId: newCase.id,
              lawyerId: lawyer.id,
              canSign: false,
              isResponsible: false,
              hasSignatureAuthority: false,
              role: lawyer.lawyerRank === 'INTERN' ? 'INTERN' : 'ASSISTANT',
            },
          });
          createdCaseLawyers.push({ id: createdIntern.id, lawyerRank: lawyer.lawyerRank, isResponsible: false });
        }

        // B5/D: "≥1 sorumlu avukat" invariant'ı. Hiçbir CaseLawyer RESPONSIBLE değilse (ve
        // avukat varsa), önceliğe göre BİR avukatı RESPONSIBLE'a yükselt. Explicit isResponsible
        // ve PARTNER/MANAGER zaten yukarıda RESPONSIBLE ürettiğinden bu blok YALNIZ "sıfır sorumlu"
        // hâlinde çalışır → kullanıcının açık seçimi ASLA ezilmez/demote edilmez. Yükseltmede
        // isResponsible ve role BİRLİKTE set edilir (isResponsible ⇔ role===RESPONSIBLE tutarlılığı).
        const promoteResponsibleId = resolveResponsiblePromotion(createdCaseLawyers);
        if (promoteResponsibleId) {
          await tx.caseLawyer.update({
            where: { id: promoteResponsibleId },
            data: { isResponsible: true, role: 'RESPONSIBLE' },
          });
        }

        // 8. Personel ata (ASSIGN-2a). dto.staff verilmişse SEÇİM kanonik otorite (default ile
        //    MERGE YOK); verilmemişse mevcut isDefaultForNewCases davranışı AYNEN. Detay: assignCaseStaff.
        const staffResult = await this.assignCaseStaff(tx, tenantId, newCase.id, dto.staff);

        // 8.5. CASE_OPENED domain event (HR-39: same-tx append)
        await this.domainEventIngestService.appendInTransaction(tx, {
          header: {
            eventId: randomUUID(),
            aggregateType: 'Case',
            aggregateId: newCase.id,
            eventType: 'CASE_OPENED',
            occurredAt: new Date().toISOString(),
            occurredAtConfidence: 'SYSTEM_VERIFIED',
            actor: { type: 'HUMAN', userId: userId || 'unknown' },
            tenantId,
          },
          payload: {
            fileNumber: newCase.fileNumber,
            type: newCase.type,
            subType: newCase.subType,
            executionPath: newCase.executionPath,
            caseStatus: newCase.caseStatus,
            currency: newCase.currency,
            caseDate: newCase.caseDate?.toISOString(),
          },
        });

        // 8.6. INTEREST_POLICY_ASSIGNED domain event (doc 14, Sprint 2C)
        // Legal computation contract: CASE_OPENED'dan sonra aynı tx'te → aggregateVersion 2 (otomatik).
        // Payload hesap KURALIDIR, sonucu değil (Anayasa D); değer alanları taşımaz.
        await this.domainEventIngestService.appendInTransaction(tx, {
          header: {
            eventId: randomUUID(),
            aggregateType: 'Case',
            aggregateId: newCase.id,
            eventType: 'INTEREST_POLICY_ASSIGNED',
            occurredAt: new Date().toISOString(),
            occurredAtConfidence: 'SYSTEM_VERIFIED',
            actor: { type: 'HUMAN', userId },
            tenantId,
          },
          payload: ((): Record<string, unknown> => {
            // doc 24: dto.CaseType → interest config.CaseType (explicit, exhaustive mapping).
            // resolveInitialPolicy imzası değişmez; audit alanları (sourceCaseType/mappingReasoning)
            // additive olarak payload'a eklenir.
            const policyMapping = mapDtoCaseTypeToInterestCaseType(dto.type);
            return {
              ...resolveInitialPolicy(policyMapping.configType, {
                interestStartDate: dto.interestStartDate,
                startDate: dto.startDate,
              }),
              sourceCaseType: policyMapping.sourceCaseType,
              mappingReasoning: policyMapping.reasoning,
            };
          })(),
        });

        // 9. Tam case'i döndür
        const createdCase = await tx.case.findUnique({
          where: { id: newCase.id },
          include: {
            client: { select: { id: true, name: true } },
            debtors: {
              include: { debtor: { select: { id: true, name: true } } },
            },
            lawyers: {
              include: { lawyer: { select: { id: true, name: true, surname: true } } },
            },
            dues: true,
          },
        });

        return { case: createdCase, clientIds, lawyerIds: dto.lawyers?.map(l => l.id).filter(Boolean) || [], staffResult };
      });

      // ASSIGN-2a: seçimle atanan personel için audit (yalnız dto.staff verildiğinde; default
      // yol mevcut davranışı AYNEN korur → ek audit üretmez). Tx commit sonrası.
      if (result.staffResult.selectionProvided) {
        await this.auditStaffAssignment(tenantId, result.case?.id ?? '', result.staffResult.assigned);
      }

      // 7. Vekalet kontrolü (transaction dışında)
      const poaWarnings: string[] = [];
      if (result.clientIds.length > 0 && result.lawyerIds.length > 0) {
        for (const clientId of result.clientIds) {
          for (const lawyerId of result.lawyerIds) {
            const poaCheck = await this.checkPoaValidity(clientId, lawyerId as string);
            if (!poaCheck.valid) {
              // Müvekkil ve avukat isimlerini al
              const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { displayName: true } });
              const lawyer = await this.prisma.lawyer.findUnique({ where: { id: lawyerId as string }, select: { name: true, surname: true } });
              poaWarnings.push(`${lawyer?.name} ${lawyer?.surname} → ${client?.displayName}: ${poaCheck.message}`);
            } else if (poaCheck.message) {
              // Süresi dolmak üzere uyarısı
              const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { displayName: true } });
              const lawyer = await this.prisma.lawyer.findUnique({ where: { id: lawyerId as string }, select: { name: true, surname: true } });
              poaWarnings.push(`${lawyer?.name} ${lawyer?.surname} → ${client?.displayName}: ${poaCheck.message}`);
            }
          }
        }
      }

      if (poaWarnings.length > 0) {
        this.logger.warn(`Takip oluşturuldu ancak vekalet uyarıları var: ${poaWarnings.join(', ')}`);
      }

      // Audit log
      if (result.case) {
        await this.auditService.log({
          tenantId,
          action: 'CREATE',
          entityType: 'CASE',
          entityId: result.case.id,
          newValues: { fileNumber: result.case.fileNumber, type: result.case.type },
          description: `Yeni takip oluşturuldu: ${result.case.fileNumber}`,
        });

        // Otomatik müvekkil bilgi talebi gönder (arka planda)
        this.clientInfoRequestService
          .sendAutoRequestOnCaseCreate(tenantId, result.case.id)
          .catch((err) => {
            this.logger.warn(`Otomatik bilgi talebi gönderilemedi: ${err.message}`);
          });

        // Otomatik açılış masraf seti oluştur (arka planda)
        // Case oluşturulduğunda OPENING masrafları otomatik oluşturulur
        if (result.case.clientId) {
          const shouldSendEmail = dto.sendExpenseEmail === true;
          
          this.expenseRequestService
            .createOpeningExpenseSet(result.case.id, tenantId, 'system')
            .then(async (expenseResult) => {
              this.logger.log(`Otomatik açılış masrafları oluşturuldu: ${result.case!.fileNumber}`);
              
              // Masraf oluşturulduysa ve kullanıcı mail gönderilmesini istediyse
              if (expenseResult?.id && shouldSendEmail) {
                try {
                  await this.expenseRequestService.sendExpenseEmail(tenantId, expenseResult.id, 'system');
                  this.logger.log(`Masraf talebi maili gönderildi: ${result.case!.fileNumber}`);
                } catch (emailErr: any) {
                  this.logger.warn(`Masraf maili gönderilemedi: ${emailErr.message}`);
                }
              }
            })
            .catch((err) => {
              this.logger.warn(`Otomatik masraf seti oluşturulamadı: ${err.message}`);
            });
        }
      }

      return {
        ...result.case,
        poaWarnings: poaWarnings.length > 0 ? poaWarnings : undefined,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          throw new ConflictException(`Bu dosya numarası (${dto.fileNumber}) zaten kullanılıyor`);
        }
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateCaseDto) {
    await this.findOne(tenantId, id);

    // Boş string'leri undefined'a çevir
    const data: any = { ...dto };
    if (data.startDate === "" || data.startDate === null) {
      data.startDate = undefined;
    } else if (data.startDate) {
      data.startDate = new Date(data.startDate);
    }

    // caseDate için de aynı işlem
    if (data.caseDate === "" || data.caseDate === null) {
      data.caseDate = undefined;
    } else if (data.caseDate) {
      data.caseDate = new Date(data.caseDate);
    }

    // Boş string'leri temizle
    Object.keys(data).forEach((key) => {
      if (data[key] === "") {
        data[key] = undefined;
      }
    });

    // İcra dairesi değiştiyse ve UYAP kodu yoksa, icra dairesinden al
    if (data.executionOfficeId && !data.uyapBirimKodu) {
      const executionOffice = await this.prisma.executionOffice.findUnique({
        where: { id: data.executionOfficeId },
        select: { uyapCode: true },
      });
      if (executionOffice?.uyapCode) {
        data.uyapBirimKodu = executionOffice.uyapCode;
        data.hasUyapWarning = false;
      }
    }

    const updated = await this.prisma.case.update({
      where: { id },
      data,
    });

    // Audit log
    await this.auditService.log({
      tenantId,
      action: 'UPDATE',
      entityType: 'CASE',
      entityId: id,
      newValues: data,
      description: `Takip güncellendi: ${updated.fileNumber}`,
    });

    return updated;
  }

  async delete(tenantId: string, id: string) {
    const existing = await this.findOne(tenantId, id);

    // Transaction içinde silme ve audit log (veri bütünlüğü için)
    await this.prisma.$transaction(async (tx) => {
      await tx.case.delete({
        where: { id },
      });

      // Audit log - transaction içinde
      await this.auditService.log({
        tenantId,
        action: 'DELETE',
        entityType: 'CASE',
        entityId: id,
        oldValues: { fileNumber: existing.fileNumber },
        description: `Takip silindi: ${existing.fileNumber}`,
      });
    });

    return { success: true };
  }

  async getStats(tenantId: string) {
    const [total, active, closed, thisMonth] = await Promise.all([
      this.prisma.case.count({ where: { tenantId } }),
      this.prisma.case.count({ where: { tenantId, status: "ACTIVE" } }),
      this.prisma.case.count({ where: { tenantId, status: "CLOSED" } }),
      this.prisma.case.count({
        where: {
          tenantId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    return { total, active, closed, thisMonth };
  }

  // Sıradaki dosya numarasını al
  async getNextFileNumber(tenantId: string): Promise<string> {
    const currentYear = new Date().getFullYear();
    
    // Bu yıla ait tüm dosya numaralarını bul ve en büyük numarayı hesapla
    const casesThisYear = await this.prisma.case.findMany({
      where: {
        tenantId,
        fileNumber: {
          startsWith: `${currentYear}/`,
        },
      },
      select: { fileNumber: true },
    });

    let maxNumber = 0;
    for (const c of casesThisYear) {
      if (c.fileNumber) {
        const parts = c.fileNumber.split('/');
        if (parts.length === 2) {
          const num = parseInt(parts[1], 10);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    }

    return `${currentYear}/${maxNumber + 1}`;
  }

  // Dosya flag'lerini güncelle (K.47-50)
  async patchFlags(tenantId: string, id: string, dto: Partial<UpdateCaseDto>) {
    await this.findOne(tenantId, id);

    // Sadece izin verilen flag'leri güncelle
    const allowedFlags = [
      'isArchived',
      'showToClient',
      'allowUyapActions',
      'hasArticle4Request',
      'isAutomationEnabled',
      'automationConfig',
      // Düzenlenebilir alanlar
      'executionFileNumber',
      'caseStatus',
      'executionPath',
      'subCategory',
      'notes',
      'executionOfficeId',
    ];

    const data: any = {};
    for (const key of allowedFlags) {
      if (dto[key as keyof typeof dto] !== undefined) {
        data[key] = dto[key as keyof typeof dto];
      }
    }

    this.logger.log(`patchFlags called with dto: ${JSON.stringify(dto)}, filtered data: ${JSON.stringify(data)}`);

    if (Object.keys(data).length === 0) {
      this.logger.warn(`patchFlags: No allowed fields found in dto`);
      return this.findOne(tenantId, id);
    }

    return this.prisma.case.update({
      where: { id },
      data,
    });
  }

  // Toplu güncelleme (Batch Update)
  async batchUpdate(
    tenantId: string,
    caseIds: string[],
    updates: {
      riskId?: string | null;
      durumEtiketiId?: string | null;
      sorumluPersonelId?: string | null;
      takipTuruId?: string | null;
      mahiyetTipiId?: string | null;
    },
  ) {
    // Lookup ID'lerinin bu tenant'a ait olduğunu kontrol et
    await this.validateLookupIds(tenantId, {
      riskId: updates.riskId,
      durumEtiketiId: updates.durumEtiketiId,
      takipTuruId: updates.takipTuruId,
      mahiyetTipiId: updates.mahiyetTipiId,
    });

    // Sadece bu tenant'a ait dosyaları güncelle
    const result = await this.prisma.case.updateMany({
      where: {
        id: { in: caseIds },
        tenantId,
      },
      data: {
        ...(updates.riskId !== undefined && { riskId: updates.riskId }),
        ...(updates.durumEtiketiId !== undefined && { durumEtiketiId: updates.durumEtiketiId }),
        ...(updates.sorumluPersonelId !== undefined && { sorumluPersonelId: updates.sorumluPersonelId }),
        ...(updates.takipTuruId !== undefined && { takipTuruId: updates.takipTuruId }),
        ...(updates.mahiyetTipiId !== undefined && { mahiyetTipiId: updates.mahiyetTipiId }),
      },
    });

    return { updatedCount: result.count };
  }

  // Eksik UYAP kodlarını düzelt
  async fixMissingUyapCodes(tenantId: string) {
    // UYAP kodu olmayan ama icra dairesi olan takipleri bul
    const casesWithoutUyap = await this.prisma.case.findMany({
      where: {
        tenantId,
        executionOfficeId: { not: null },
        OR: [
          { uyapBirimKodu: null },
          { uyapBirimKodu: '' },
        ],
      },
      include: {
        executionOffice: {
          select: { id: true, uyapCode: true, name: true },
        },
      },
    });

    let fixedCount = 0;
    for (const c of casesWithoutUyap) {
      if (c.executionOffice?.uyapCode) {
        await this.prisma.case.update({
          where: { id: c.id },
          data: {
            uyapBirimKodu: c.executionOffice.uyapCode,
            hasUyapWarning: false,
          },
        });
        fixedCount++;
      }
    }

    return {
      totalChecked: casesWithoutUyap.length,
      fixedCount,
      message: `${fixedCount} takibin UYAP kodu güncellendi`,
    };
  }

  // ==================== DOSYA NOTLARI ====================

  async getNotes(tenantId: string, caseId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseLifecycle tablosundan notları çek
    const events = await this.prisma.caseLifecycle.findMany({
      where: {
        caseId,
        action: "NOTE_ADDED",
      },
      orderBy: { createdAt: "desc" },
    });

    return events.map((e) => ({
      id: e.id,
      content: e.description || "",
      createdAt: e.createdAt,
      createdBy: null,
      isPrivate: (e.metadata as any)?.isPrivate || false,
    }));
  }

  async addNote(tenantId: string, caseId: string, _userId: string, content: string, isPrivate = false) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseLifecycle olarak kaydet
    const note = await this.prisma.caseLifecycle.create({
      data: {
        caseId,
        stage: "INITIAL",
        action: "NOTE_ADDED",
        description: content,
        triggeredBy: "MANUAL",
        metadata: { isPrivate },
      },
    });

    return {
      id: note.id,
      content: note.description,
      createdAt: note.createdAt,
      createdBy: null,
      isPrivate,
    };
  }

  async deleteNote(tenantId: string, caseId: string, noteId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // Notun bu dosyaya ait olduğunu kontrol et (güvenlik düzeltmesi)
    const note = await this.prisma.caseLifecycle.findFirst({
      where: { id: noteId, caseId, action: "NOTE_ADDED" },
    });
    if (!note) throw new NotFoundException("Not bulunamadı");

    await this.prisma.caseLifecycle.delete({
      where: { id: noteId },
    });

    return { success: true };
  }

  // ==================== DOSYA ZAMAN ÇİZELGESİ ====================

  async getTimeline(tenantId: string, caseId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const events = await this.prisma.caseLifecycle.findMany({
      where: { caseId },
      orderBy: { createdAt: "desc" },
    });

    return events.map((e) => ({
      id: e.id,
      type: this.mapActionToTimelineType(e.action),
      title: this.getTimelineTitle(e.action),
      description: e.description,
      date: e.createdAt,
      user: undefined,
      metadata: e.metadata,
    }));
  }

  private mapActionToTimelineType(action: string): string {
    const mapping: Record<string, string> = {
      CREATED: "CREATED",
      STATUS_CHANGED: "STATUS_CHANGE",
      TEBLIGAT_SENT: "TEBLIGAT",
      TEBLIGAT_DELIVERED: "TEBLIGAT",
      HACIZ_REQUESTED: "HACIZ",
      HACIZ_COMPLETED: "HACIZ",
      COLLECTION_ADDED: "TAHSILAT",
      NOTE_ADDED: "NOTE",
      DOCUMENT_ADDED: "DOCUMENT",
      HEARING_SCHEDULED: "DURUSMA",
    };
    return mapping[action] || "NOTE";
  }

  private getTimelineTitle(action: string): string {
    const titles: Record<string, string> = {
      CREATED: "Dosya oluşturuldu",
      STATUS_CHANGED: "Durum değiştirildi",
      TEBLIGAT_SENT: "Tebligat gönderildi",
      TEBLIGAT_DELIVERED: "Tebligat teslim edildi",
      HACIZ_REQUESTED: "Haciz talebi yapıldı",
      HACIZ_COMPLETED: "Haciz tamamlandı",
      COLLECTION_ADDED: "Tahsilat kaydedildi",
      NOTE_ADDED: "Not eklendi",
      DOCUMENT_ADDED: "Belge eklendi",
      HEARING_SCHEDULED: "Duruşma planlandı",
    };
    return titles[action] || action;
  }

  // ==================== TEBLİGAT TAKİP ====================

  /**
   * CaseDebtor tebligat bilgilerini güncelle
   */
  async updateCaseDebtorNotification(
    tenantId: string,
    caseId: string,
    caseDebtorId: string,
    data: {
      notificationBarcode?: string;
      notificationSentDate?: string;
      notificationDeliveredDate?: string;
      notificationStatus?: string;
      notificationNote?: string;
    }
  ) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseDebtor'un bu dosyaya ait olduğunu kontrol et
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId, caseId },
      include: { debtor: { select: { name: true } } },
    });
    if (!caseDebtor) throw new NotFoundException("Borçlu kaydı bulunamadı");

    // Güncelle
    const updated = await this.prisma.caseDebtor.update({
      where: { id: caseDebtorId },
      data: {
        notificationBarcode: data.notificationBarcode || null,
        notificationSentDate: data.notificationSentDate ? new Date(data.notificationSentDate) : null,
        notificationDeliveredDate: data.notificationDeliveredDate ? new Date(data.notificationDeliveredDate) : null,
        notificationStatus: data.notificationStatus || null,
        notificationNote: data.notificationNote || null,
      },
      include: {
        debtor: {
          include: { estateHeirs: true },
        },
      },
    });

    // Timeline'a kaydet
    if (data.notificationStatus === "GONDERILDI" && data.notificationSentDate) {
      await this.prisma.caseLifecycle.create({
        data: {
          caseId,
          stage: "INITIAL",
          action: "TEBLIGAT_SENT",
          description: `${caseDebtor.debtor.name} için tebligat gönderildi (Barkod: ${data.notificationBarcode || "-"})`,
          triggeredBy: "MANUAL",
          metadata: { caseDebtorId, barcode: data.notificationBarcode },
        },
      });
    }

    if (data.notificationStatus === "TEBLIG_EDILDI" && data.notificationDeliveredDate) {
      await this.prisma.caseLifecycle.create({
        data: {
          caseId,
          stage: "INITIAL",
          action: "TEBLIGAT_DELIVERED",
          description: `${caseDebtor.debtor.name} için tebligat teslim edildi`,
          triggeredBy: "MANUAL",
          metadata: { caseDebtorId, deliveredDate: data.notificationDeliveredDate },
        },
      });
    }

    return updated;
  }

  /**
   * Dosyadaki tüm borçluların tebligat durumlarını getir
   */
  async getCaseDebtorsWithNotification(tenantId: string, caseId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const caseDebtors = await this.prisma.caseDebtor.findMany({
      where: { caseId },
      include: {
        debtor: {
          include: {
            estateHeirs: true,
            debtorAddresses: true,
          },
        },
        selectedAddress: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return caseDebtors;
  }

  // ==================== DOSYA AVUKAT YÖNETİMİ ====================

  /**
   * Dosyadaki avukatın rol ve yetkilerini güncelle
   */
  async updateCaseLawyer(
    tenantId: string,
    caseId: string,
    caseLawyerId: string,
    data: {
      role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
      canSign?: boolean;
      hasSignatureAuthority?: boolean;
      isResponsible?: boolean;
      casePermissions?: {
        canEditCase?: boolean;
        canGenerateDocs?: boolean;
        canSyncUYAP?: boolean;
        canViewFinance?: boolean;
        canEditFinance?: boolean;
        canChangeStatus?: boolean;
        canEditParties?: boolean;
      };
      receiveNotifications?: boolean;
    }
  ) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseLawyer'ın bu dosyaya ait olduğunu kontrol et
    const caseLawyer = await this.prisma.caseLawyer.findFirst({
      where: { id: caseLawyerId, caseId },
      include: { lawyer: { select: { name: true, surname: true } } },
    });
    if (!caseLawyer) throw new NotFoundException("Avukat kaydı bulunamadı");

    // Güncelleme verisi hazırla
    const updateData: any = {};
    
    if (data.role !== undefined) {
      updateData.role = data.role;
      // RESPONSIBLE rolü seçilirse isResponsible'ı da güncelle
      updateData.isResponsible = data.role === 'RESPONSIBLE';
    }
    
    if (data.canSign !== undefined) {
      updateData.canSign = data.canSign;
      updateData.hasSignatureAuthority = data.canSign;
    }
    
    if (data.hasSignatureAuthority !== undefined) {
      updateData.hasSignatureAuthority = data.hasSignatureAuthority;
      updateData.canSign = data.hasSignatureAuthority;
    }
    
    if (data.isResponsible !== undefined) {
      updateData.isResponsible = data.isResponsible;
      if (data.isResponsible) {
        updateData.role = 'RESPONSIBLE';
      }
    }
    
    if (data.casePermissions !== undefined) {
      updateData.casePermissions = data.casePermissions;
      updateData.permissionSource = 'CUSTOM';
    }
    
    if (data.receiveNotifications !== undefined) {
      updateData.receiveNotifications = data.receiveNotifications;
    }

    // Güncelle
    const updated = await this.prisma.caseLawyer.update({
      where: { id: caseLawyerId },
      data: updateData,
      include: {
        lawyer: {
          select: {
            id: true,
            name: true,
            surname: true,
            barNumber: true,
            lawyerRank: true,
          },
        },
      },
    });

    // Audit log
    await this.auditService.log({
      tenantId,
      action: 'UPDATE',
      entityType: 'CASE_LAWYER',
      entityId: caseLawyerId,
      newValues: updateData,
      description: `Avukat yetkileri güncellendi: ${caseLawyer.lawyer.name} ${caseLawyer.lawyer.surname}`,
    });

    this.logger.log(`CaseLawyer updated: ${caseLawyerId}, role: ${updated.role}, permissions: ${JSON.stringify(updated.casePermissions)}`);

    return updated;
  }

  /**
   * Dosyadaki tüm avukatları getir (detaylı)
   */
  async getCaseLawyers(tenantId: string, caseId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const caseLawyers = await this.prisma.caseLawyer.findMany({
      where: { caseId },
      include: {
        lawyer: {
          select: {
            id: true,
            name: true,
            surname: true,
            barNumber: true,
            phone: true,
            email: true,
            lawyerRank: true,
            bankName: true,
            branchName: true,
            iban: true,
          },
        },
      },
      orderBy: [
        { isResponsible: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return caseLawyers.map(cl => ({
      id: cl.id,
      lawyerId: cl.lawyerId,
      role: cl.role,
      canSign: cl.canSign,
      hasSignatureAuthority: cl.hasSignatureAuthority,
      isResponsible: cl.isResponsible,
      casePermissions: cl.casePermissions,
      permissionSource: cl.permissionSource,
      receiveNotifications: cl.receiveNotifications,
      lawyer: cl.lawyer,
    }));
  }

  /**
   * Dosyaya avukat ekle
   */
  async addCaseLawyer(tenantId: string, caseId: string, data: {
    lawyerId: string;
    role?: 'RESPONSIBLE' | 'ASSIGNED' | 'ASSISTANT' | 'INTERN';
    canSign?: boolean;
  }) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // Avukatın bu tenant'a ait olduğunu kontrol et
    const lawyer = await this.prisma.lawyer.findFirst({
      where: { id: data.lawyerId, tenantId },
    });
    if (!lawyer) throw new NotFoundException("Avukat bulunamadı");

    // Zaten ekli mi kontrol et
    const existing = await this.prisma.caseLawyer.findFirst({
      where: { caseId, lawyerId: data.lawyerId },
    });
    if (existing) throw new BadRequestException("Bu avukat zaten dosyaya ekli");

    // LawyerRank'e göre varsayılan rol belirle
    let role = data.role;
    if (!role) {
      switch (lawyer.lawyerRank) {
        case 'PARTNER':
        case 'MANAGER':
          role = 'RESPONSIBLE';
          break;
        case 'AUTHORIZED':
          role = 'ASSIGNED';
          break;
        case 'INTERN':
          role = 'INTERN';
          break;
        default:
          role = 'ASSIGNED';
      }
    }

    const caseLawyer = await this.prisma.caseLawyer.create({
      data: {
        caseId,
        lawyerId: data.lawyerId,
        role,
        canSign: data.canSign ?? (lawyer.lawyerRank !== 'INTERN'),
        isResponsible: role === 'RESPONSIBLE',
      },
      include: {
        lawyer: {
          select: {
            id: true,
            name: true,
            surname: true,
            barNumber: true,
            lawyerRank: true,
          },
        },
      },
    });

    return caseLawyer;
  }

  /**
   * Dosyadan avukat çıkar
   */
  async removeCaseLawyer(tenantId: string, caseId: string, caseLawyerId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseLawyer'ın bu dosyaya ait olduğunu kontrol et
    const caseLawyer = await this.prisma.caseLawyer.findFirst({
      where: { id: caseLawyerId, caseId },
    });
    if (!caseLawyer) throw new NotFoundException("Avukat ataması bulunamadı");

    await this.prisma.caseLawyer.delete({
      where: { id: caseLawyerId },
    });

    return { success: true };
  }

  /**
   * Dosyadaki personelleri getir
   */
  async getCaseStaff(tenantId: string, caseId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const caseStaff = await this.prisma.caseStaff.findMany({
      where: { caseId },
      include: {
        staffMember: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffType: true,
            phone: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return caseStaff;
  }

  /**
   * Dosyaya personel ekle
   */
  async addCaseStaff(tenantId: string, caseId: string, data: {
    staffMemberId: string;
    roleOnCase?: string;
  }) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // Personelin bu tenant'a ait olduğunu kontrol et
    const staffMember = await this.prisma.staffMember.findFirst({
      where: { id: data.staffMemberId, tenantId },
    });
    if (!staffMember) throw new NotFoundException("Personel bulunamadı");

    // Zaten ekli mi kontrol et
    const existing = await this.prisma.caseStaff.findFirst({
      where: { caseId, staffMemberId: data.staffMemberId },
    });
    if (existing) throw new BadRequestException("Bu personel zaten dosyaya ekli");

    const caseStaff = await this.prisma.caseStaff.create({
      data: {
        caseId,
        staffMemberId: data.staffMemberId,
        roleOnCase: data.roleOnCase || staffMember.staffType,
      },
      include: {
        staffMember: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            staffType: true,
          },
        },
      },
    });

    return caseStaff;
  }

  /**
   * Dosyadan personel çıkar
   */
  async removeCaseStaff(tenantId: string, caseId: string, caseStaffId: string) {
    // Dosyanın bu tenant'a ait olduğunu kontrol et
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // CaseStaff'ın bu dosyaya ait olduğunu kontrol et
    const caseStaff = await this.prisma.caseStaff.findFirst({
      where: { id: caseStaffId, caseId },
    });
    if (!caseStaff) throw new NotFoundException("Personel ataması bulunamadı");

    await this.prisma.caseStaff.delete({
      where: { id: caseStaffId },
    });

    return { success: true };
  }

  // ==================== ALACAK KALEMLERİ (DUES) ====================

  /**
   * Dosyanın alacak kalemlerini getir
   */
  async getCaseDues(tenantId: string, caseId: string) {
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    return this.prisma.due.findMany({
      where: { caseId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  /**
   * Alacak kalemi ekle
   */
  async createDue(
    tenantId: string,
    caseId: string,
    data: {
      type: string;
      description?: string;
      amount: number;
      dueDate: string;
      currency?: string;
      interestType?: string;
      interestRate?: number;
      interestStartDate?: string;
      sourceDocumentNo?: string;
      hasKdv?: boolean;
      kdvRate?: number;
      isPrimary?: boolean;
    }
  ) {
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    // Get max sortOrder
    const maxSort = await this.prisma.due.aggregate({
      where: { caseId },
      _max: { sortOrder: true },
    });

    return this.prisma.due.create({
      data: {
        caseId,
        type: data.type as any,
        description: data.description,
        amount: data.amount,
        dueDate: new Date(data.dueDate),
        currency: data.currency || "TRY",
        interestType: data.interestType,
        interestRate: data.interestRate,
        interestStartDate: data.interestStartDate ? new Date(data.interestStartDate) : undefined,
        sourceDocumentNo: data.sourceDocumentNo,
        hasKdv: data.hasKdv || false,
        kdvRate: data.kdvRate,
        isPrimary: data.isPrimary || false,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
      },
    });
  }

  /**
   * Alacak kalemi güncelle
   */
  async updateDue(
    tenantId: string,
    caseId: string,
    dueId: string,
    data: {
      type?: string;
      description?: string;
      amount?: number;
      dueDate?: string;
      currency?: string;
      interestType?: string;
      interestRate?: number;
      interestStartDate?: string;
      interestEndDate?: string;
      sourceDocumentNo?: string;
      hasKdv?: boolean;
      kdvRate?: number;
      isFinalized?: boolean;
      finalizationDate?: string;
      finalizationNote?: string;
      sortOrder?: number;
      isPrimary?: boolean;
    }
  ) {
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const due = await this.prisma.due.findFirst({
      where: { id: dueId, caseId },
    });
    if (!due) throw new NotFoundException("Alacak kalemi bulunamadı");

    return this.prisma.due.update({
      where: { id: dueId },
      data: {
        type: data.type as any,
        description: data.description,
        amount: data.amount,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        currency: data.currency,
        interestType: data.interestType,
        interestRate: data.interestRate,
        interestStartDate: data.interestStartDate ? new Date(data.interestStartDate) : undefined,
        interestEndDate: data.interestEndDate ? new Date(data.interestEndDate) : undefined,
        sourceDocumentNo: data.sourceDocumentNo,
        hasKdv: data.hasKdv,
        kdvRate: data.kdvRate,
        isFinalized: data.isFinalized,
        finalizationDate: data.finalizationDate ? new Date(data.finalizationDate) : undefined,
        finalizationNote: data.finalizationNote,
        sortOrder: data.sortOrder,
        isPrimary: data.isPrimary,
      },
    });
  }

  /**
   * Alacak kalemi sil
   */
  async deleteDue(tenantId: string, caseId: string, dueId: string) {
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const due = await this.prisma.due.findFirst({
      where: { id: dueId, caseId },
    });
    if (!due) throw new NotFoundException("Alacak kalemi bulunamadı");

    await this.prisma.due.delete({ where: { id: dueId } });
    return { success: true };
  }

  // ==================== TAHSİLATLAR (COLLECTIONS) ====================

  /**
   * Dosyanın tahsilatlarını getir
   */
  async getCaseCollections(tenantId: string, caseId: string) {
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    return this.prisma.collection.findMany({
      where: { caseId, tenantId },
      orderBy: { date: "desc" },
      include: {
        case: { select: { id: true, fileNumber: true } },
      },
    });
  }

  /**
   * Tahsilat ekle
   */
  async createCollection(
    tenantId: string,
    caseId: string,
    data: {
      caseDebtorId?: string;
      amount: number;
      currency?: string;
      type: string;
      channel: string;
      date: string;
      valueDate?: string;
      description?: string;
      receiptNo?: string;
      bankName?: string;
      accountNo?: string;
      notes?: string;
    },
    userId?: string,
  ) {
    // G3d: kanonik yola delege — closed/duplicate guard + PAYMENT_RECEIVED event +
    // G3a ledger + CollectionAllocation tek otoritede (collection.service.create).
    return this.collectionService.create(
      tenantId,
      {
        caseId,
        caseDebtorId: data.caseDebtorId,
        amount: data.amount,
        currency: data.currency,
        type: data.type as any,
        channel: data.channel as any,
        date: data.date,
        valueDate: data.valueDate,
        description: data.description,
        receiptNo: data.receiptNo,
        bankName: data.bankName,
        accountNo: data.accountNo,
        notes: data.notes,
      } as any,
      userId,
    );
  }

  /**
   * Tahsilat güncelle
   */
  async updateCollection(
    tenantId: string,
    caseId: string,
    collectionId: string,
    data: {
      amount?: number;
      type?: string;
      channel?: string;
      date?: string;
      valueDate?: string;
      description?: string;
      receiptNo?: string;
      bankName?: string;
      notes?: string;
      status?: string;
    }
  ) {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, caseId, tenantId },
    });
    if (!collection) throw new NotFoundException("Tahsilat bulunamadı");

    const updated = await this.prisma.collection.update({
      where: { id: collectionId },
      data: {
        amount: data.amount,
        type: data.type as any,
        channel: data.channel as any,
        date: data.date ? new Date(data.date) : undefined,
        valueDate: data.valueDate ? new Date(data.valueDate) : undefined,
        description: data.description,
        receiptNo: data.receiptNo,
        bankName: data.bankName,
        notes: data.notes,
        status: data.status as any,
      },
    });

    // Tahsilat güncellendikten sonra faiz hesaplamasını yeniden tetikle
    // TODO: interest-engine entegrasyonu tamamlandığında aktif edilecek
    // try {
    //   const today = new Date().toISOString().split('T')[0];
    //   await this.interestEngineService.recalculateForCase(caseId, today, tenantId);
    //   this.logger.debug(`Interest recalculated after collection update for case ${caseId}`);
    // } catch (error) {
    //   this.logger.warn(`Failed to recalculate interest after collection update: ${error.message}`);
    // }

    return updated;
  }

  /**
   * Tahsilat iptal et
   */
  async cancelCollection(tenantId: string, caseId: string, collectionId: string, reason?: string) {
    // G3d: kanonik cancel'a delege (tenant doğrulaması collection.service.cancel içinde).
    return this.collectionService.cancel(tenantId, collectionId, {
      cancelReason: reason || "",
    });
  }

  /**
   * Tahsilat sil
   */
  async deleteCollection(tenantId: string, caseId: string, collectionId: string) {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, caseId, tenantId },
    });
    if (!collection) throw new NotFoundException("Tahsilat bulunamadı");

    await this.prisma.collection.delete({ where: { id: collectionId } });

    // Tahsilat silindikten sonra faiz hesaplamasını yeniden tetikle
    // TODO: interest-engine entegrasyonu tamamlandığında aktif edilecek
    // try {
    //   const today = new Date().toISOString().split('T')[0];
    //   await this.interestEngineService.recalculateForCase(caseId, today, tenantId);
    //   this.logger.debug(`Interest recalculated after collection delete for case ${caseId}`);
    // } catch (error) {
    //   this.logger.warn(`Failed to recalculate interest after collection delete: ${error.message}`);
    // }

    return { success: true };
  }

  /**
   * Dosya finans özeti
   */
  async getCaseFinanceSummary(tenantId: string, caseId: string) {
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true, currency: true },
    });
    if (!caseExists) throw new NotFoundException("Dosya bulunamadı");

    const [dues, collections] = await Promise.all([
      this.prisma.due.findMany({ where: { caseId } }),
      this.prisma.collection.findMany({ where: { caseId, tenantId, status: "CONFIRMED" } }),
    ]);

    const totalDues = dues.reduce((sum, d) => sum + Number(d.amount), 0);
    const totalCollections = collections.reduce((sum, c) => sum + Number(c.amount), 0);

    // Group dues by type
    const duesByType = dues.reduce((acc, d) => {
      const existing = acc.find((x) => x.type === d.type);
      if (existing) {
        existing.amount += Number(d.amount);
        existing.count += 1;
      } else {
        acc.push({ type: d.type, amount: Number(d.amount), count: 1 });
      }
      return acc;
    }, [] as Array<{ type: string; amount: number; count: number }>);

    // Group collections by channel
    const collectionsByChannel = collections.reduce((acc, c) => {
      const existing = acc.find((x) => x.channel === c.channel);
      if (existing) {
        existing.amount += Number(c.amount);
        existing.count += 1;
      } else {
        acc.push({ channel: c.channel, amount: Number(c.amount), count: 1 });
      }
      return acc;
    }, [] as Array<{ channel: string; amount: number; count: number }>);

    return {
      caseId,
      currency: caseExists.currency || "TRY",
      totalDues,
      totalCollections,
      balance: totalDues - totalCollections,
      duesByType,
      collectionsByChannel,
    };
  }

  /**
   * Hesap özeti - TEK KAYNAK PRENSİBİ
   * 
   * Tüm hesaplamalar backend engine'lerden gelir:
   * - Faiz: interest-engine
   * - Masraf/harç: fee-engine
   * - Vekalet ücreti: fee-engine/attorney-fee
   * 
   * UI'da hesaplama YAPILMAZ.
   * 
   * @see ARCHITECTURE.md - Source of Truth Matrix
   */
  async getCalculationSummary(tenantId: string, caseId: string, calculationDate: string) {
    // 1. Case verilerini al
    const caseData = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      include: {
        dues: true,
        collections: { where: { status: { not: 'CANCELLED' } } },
        debtors: { include: { debtor: true } },
        formType: true,
      },
    });

    if (!caseData) {
      throw new NotFoundException('Dosya bulunamadı');
    }

    const takipTarihi = caseData.caseDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
    const hesapTarihi = calculationDate;

    // 2. Asıl alacak ve kalem türü belirleme
    const principalDues = caseData.dues.filter((d: any) => 
      ['PRINCIPAL', 'ASIL_ALACAK', 'CEK', 'SENET', 'CHECK', 'BOND'].includes(d.type)
    );
    
    const asilAlacak = principalDues.length > 0
      ? principalDues.reduce((sum: number, d: any) => sum + Number(d.amount), 0)
      : Number(caseData.principalAmount || 0);

    const firstDue = principalDues[0] as any;
    const kalemTuru = firstDue?.type || 
      (caseData.type === 'CHECK' ? 'CEK' : caseData.type === 'BOND' ? 'SENET' : 'ASIL_ALACAK');

    // 3. Faiz hesabı - şimdilik basit hesaplama
    // TODO: interest-engine entegrasyonu tamamlandığında aktif edilecek
    let takipOncesiFaiz = 0;
    let takipSonrasiFaiz = 0;
    const faizSegmentleri = { takipOncesi: [] as any[], takipSonrasi: [] as any[] };

    // 4. Çek tazminatı ve komisyon
    const isCek = kalemTuru === 'CEK' || kalemTuru === 'CHECK';
    const tazminat = isCek ? asilAlacak * 0.10 : 0;
    const komisyon = isCek ? asilAlacak * 0.003 : 0;

    // 5. Takip tutarı
    const takipTutari = asilAlacak + tazminat + komisyon + takipOncesiFaiz;

    // 6. Masraflar - fee-engine'den veya 2026 tarifesi
    const debtorCount = caseData.debtors?.length || 1;
    const basvurmaHarci = 738.50;
    const vekaletHarci = 105.00;
    const pesinHarc = Math.max(Math.round(takipTutari * 0.005 * 100) / 100, 120);
    const dosyaGideri = 50.00;
    const tebligatGideri = 252.00 * debtorCount;
    const vekaletPulu = 165.60;
    const icraMasraflari = basvurmaHarci + vekaletHarci + pesinHarc + dosyaGideri + tebligatGideri + vekaletPulu;

    // 7. Tahsil harçları
    const pesinHarcDahilTahsilHarci = Math.round((takipTutari + icraMasraflari) * 0.0455 * 100) / 100;
    const pesinHarcHaricTahsilHarci = Math.round((takipTutari + icraMasraflari - pesinHarc) * 0.0455 * 100) / 100;

    // 8. Vekalet ücreti - fee-engine'den
    let vekaletUcreti = 9000; // Asgari
    try {
      vekaletUcreti = this.calculateAttorneyFee(takipTutari);
    } catch (error) {
      this.logger.warn(`Attorney fee calculation failed:`, error);
    }

    // 9. Tahsilatlar
    const aktiveTahsilatlar = caseData.collections
      .filter((c: any) => c.status !== 'CANCELLED')
      .map((c: any) => ({
        tarih: c.date?.toISOString().split('T')[0] || hesapTarihi,
        tutar: Number(c.amount),
      }));
    const toplamTahsilat = aktiveTahsilatlar.reduce((sum: number, c: any) => sum + c.tutar, 0);

    // 10. Toplamlar
    const toplamBorc = takipTutari + icraMasraflari + vekaletUcreti + takipSonrasiFaiz;
    const sonBorc = toplamBorc + pesinHarcHaricTahsilHarci;
    const kalanBorc = sonBorc - toplamTahsilat;

    // 11. Tahsil oranları
    const tahsilOranlari = [
      { oran: 0, label: "0" },
      { oran: 0.0227, label: "2,27" },
      { oran: 0.0455, label: "4,55" },
      { oran: 0.0910, label: "9,10" },
      { oran: 0.1138, label: "11,38" },
    ].map(t => ({
      ...t,
      tutar: Math.round(toplamBorc * (1 + t.oran) * 100) / 100,
    }));

    return {
      caseId,
      hesapTarihi,
      takipTarihi,
      kalemTuru,
      
      asilAlacak,
      tazminat,
      komisyon,
      takipOncesiFaiz,
      takipTutari,
      
      basvurmaHarci,
      vekaletHarci,
      pesinHarc,
      dosyaGideri,
      tebligatGideri,
      vekaletPulu,
      icraMasraflari,
      
      pesinHarcDahilTahsilHarci,
      pesinHarcHaricTahsilHarci,
      
      vekaletUcreti,
      takipSonrasiFaiz,
      
      toplamBorc,
      sonBorc,
      toplamTahsilat,
      kalanBorc,
      kalanAnapara: asilAlacak, // TBK m.100 sonrası hesaplanacak
      
      mahsupDetaylari: [], // TODO: TBK m.100 mahsup detayları
      faizSegmentleri,
      tahsilOranlari,
    };
  }

  /**
   * Vekalet ücreti hesaplama (2025/2026 Tarifesi)
   * @deprecated fee-engine'e taşınacak
   */
  private calculateAttorneyFee(takipTutari: number): number {
    const MAKTU_ICRA_UCRETI = 9000;
    
    const dilimler = [
      { limit: 600000, oran: 0.16 },
      { limit: 1200000, oran: 0.15 },
      { limit: 2400000, oran: 0.14 },
      { limit: 3600000, oran: 0.13 },
      { limit: 5400000, oran: 0.11 },
      { limit: 7800000, oran: 0.08 },
      { limit: 10800000, oran: 0.05 },
      { limit: 14400000, oran: 0.03 },
      { limit: 18600000, oran: 0.02 },
      { limit: Infinity, oran: 0.01 },
    ];
    
    let toplam = 0;
    let kalanTutar = takipTutari;
    let oncekiLimit = 0;
    
    for (const dilim of dilimler) {
      if (kalanTutar <= 0) break;
      const dilimGenisligi = dilim.limit - oncekiLimit;
      const buDilimdekiTutar = Math.min(kalanTutar, dilimGenisligi);
      toplam += buDilimdekiTutar * dilim.oran;
      kalanTutar -= buDilimdekiTutar;
      oncekiLimit = dilim.limit;
    }
    
    return Math.max(Math.round(toplam * 100) / 100, MAKTU_ICRA_UCRETI);
  }
}
