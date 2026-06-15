import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import {
  CreateDebtorDto,
  UpdateDebtorDto,
  SearchDebtorsDto,
  CheckDuplicateDto,
  CreateDebtorAddressDto,
  UpdateDebtorAddressDto,
  DebtorType,
} from "./dto/debtor.dto";

// ==================== PR-D4c: BORÇLU COMPLETENESS (global veri eksikliği) ====================
// Client completeness deseninin (computeMissingContactFields + syncContactFollowUpTask) borçlu ikizi.
// Yalnız global borçlu veri eksikliği (istihbarat/tebligat/CaseDebtor DEĞİL).

export const DEBTOR_TASK_DEDUPE_PREFIX = 'OPCOMP:DEBTOR:';

/** Borçlu için completeness-task dedupe anahtarı (tek aktif görev garantisi). */
export function debtorTaskDedupeKey(debtorId: string): string {
  return `${DEBTOR_TASK_DEDUPE_PREFIX}${debtorId}`;
}

// PR-D4e-2: saha istihbaratı (lokasyon doğrulama) görev dedupe — borçlu+adres anchored
// (caseId YOK; aynı debtor+address farklı dosyalarda tek görev). Completeness prefix'iyle çakışmaz.
export const INTEL_LOCATION_DEDUPE_PREFIX = 'INTEL:LOCATION:';
export function intelligenceLocationDedupeKey(debtorId: string, addressId?: string | null): string {
  return `${INTEL_LOCATION_DEDUPE_PREFIX}${debtorId}:${addressId || ''}`;
}

/**
 * Borçluda eksik VERİ alanlarını tür-bazlı hesaplar (saf fonksiyon, test edilebilir).
 * Kural (D4c, makul default): adres = en az 1 debtorAddress (primary şartı YOK);
 * iletişim = telefon VEYA e-posta. Kodlar generic → escalation humanizeMissingFields ile etiketlenir.
 */
export function computeDebtorMissingFields(debtor: {
  type: string;
  tckn?: string | null;
  vkn?: string | null;
  detsisNo?: string | null;
  institutionName?: string | null;
  deceasedName?: string | null;
  phone?: string | null;
  email?: string | null;
  debtorAddresses?: { id: string }[] | null;
  estateHeirs?: { id: string }[] | null;
}): string[] {
  const missing: string[] = [];
  const has = (v?: string | null) => !!(v && String(v).trim());
  const hasContact = has(debtor.phone) || has(debtor.email);
  const hasAddress = (debtor.debtorAddresses?.length || 0) > 0;

  switch (debtor.type) {
    case 'INDIVIDUAL':
      if (!has(debtor.tckn)) missing.push('tckn');
      if (!hasAddress) missing.push('address');
      if (!hasContact) missing.push('contact');
      break;
    case 'COMPANY':
      if (!has(debtor.vkn)) missing.push('vkn');
      if (!hasAddress) missing.push('address');
      if (!hasContact) missing.push('contact');
      break;
    case 'PUBLIC_INSTITUTION':
      if (!has(debtor.detsisNo) && !has(debtor.institutionName)) missing.push('detsisOrName');
      break;
    case 'ESTATE':
      if (!has(debtor.deceasedName)) missing.push('deceasedName');
      if ((debtor.estateHeirs?.length || 0) === 0) missing.push('heirs');
      if (!hasAddress) missing.push('address');
      break;
  }
  return missing;
}

// Types for case debtors (FAZ 1)
// Using inline types instead of @hukuk/types to avoid TypeScript strip-only mode issues

export type ServiceStatus = "NOT_STARTED" | "READY" | "SENT" | "DELIVERED" | "RETURNED" | "MUHTAR" | "ANNOUNCEMENT" | "FAILED" | "UNKNOWN";
export type AssetQueryStatus = "UNKNOWN" | "YES" | "NO" | "PENDING" | "ERROR";
export type DebtorRole = "ASIL_BORCLU" | "MUSTEREK_BORCLU" | "KEFIL" | "AVALIST" | "MIRASCI" | "TEMSILCI" | "DIGER";
export type AlertLevel = "NONE" | "INFO" | "WARN" | "DANGER";

export type DebtorIssueCode =
  | "MISSING_ADDRESS"
  | "MISSING_TCKN"
  | "MISSING_VKN"
  | "NO_CONTACT"
  | "SERVICE_NOT_STARTED"
  | "SERVICE_STUCK"
  | "RETURN_REASON_MISSING"
  | "DELIVERED_DATE_MISSING"
  | "SERVICE_FAILED"
  | "RISK_CONCORDAT"
  | "RISK_BANKRUPTCY"
  | "RISK_ADDRESS_SUSPECT"
  | "STALE_30D"
  | "NO_ASSET_QUERY";

export interface DebtorIssue {
  code: DebtorIssueCode;
  level: AlertLevel;
  label: string;
}

export interface DebtorListItemDTO {
  id: string;
  caseDebtorId: string;
  displayName: string;
  personType: "REAL" | "LEGAL";
  role: DebtorRole;
  identityMasked?: string;
  phoneMasked?: string;
  addressShort?: string;
  serviceStatus: ServiceStatus;
  /** Pre-computed label with date, e.g. "Tebliğ Edildi — 12.01.2026" */
  serviceLabel: string;
  /** Tebliğ tarihi */
  deliveredAt?: string;
  /** Kesinleşme tarihi */
  finalizationDate?: string;
  assets: AssetsDTO;
  alertCount: number;
  alertLevel: AlertLevel;
  issues: DebtorIssue[];
  /** Cross-file: Bu borçlunun başka dosyalarda farklı adresi var mı? */
  hasDifferentAddressInOtherCase?: boolean;
  /** Address research status */
  researchStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXHAUSTED';
}

export interface ServiceDTO {
  status: ServiceStatus;
  channel?: string;
  trackingNo?: string;
  sentAt?: string;
  deliveredAt?: string;
  returnedAt?: string;
  returnReason?: string;
}

export interface AssetsDTO {
  vehicle: AssetQueryStatus;
  realEstate: AssetQueryStatus;
  bank: AssetQueryStatus;
  sgkWage: AssetQueryStatus;
  lastQueryAt?: string;
}

export interface DebtorDetailDTO extends DebtorListItemDTO {
  emailMasked?: string;
  // Full contact info (unmasked) for detail view
  phone?: string;
  email?: string;
  identityNo?: string;
  address?: string;
  // Addresses (Tebligat Kanunu'na uygun)
  addresses?: AddressDTO[];
  selectedAddressId?: string;
  service: ServiceDTO;
  assets: AssetsDTO;
  riskFlags: string[];
  staleDays?: number;
  quickNote?: string;
  issues: DebtorIssue[];
}

// Address DTO for frontend
export interface AddressDTO {
  id: string;
  type: string;
  subType?: string;
  source: string;
  street: string;
  city: string;
  district?: string;
  postalCode?: string;
  fullText: string;
  legalPriority: string;
  canApply21_2: boolean;
  verified: boolean;
  verifiedAt?: string;
  riskFlags: string[];
  isPrimary: boolean;
  tk21_2Applied: boolean;
}

export interface DebtorsSummaryDTO {
  total: number;
  delivered: number;
  pending: number;
  returned: number;
  danger: number;
}

const DebtorIssueLabelMap: Record<DebtorIssueCode, string> = {
  MISSING_ADDRESS: "Adres eksik",
  MISSING_TCKN: "TCKN eksik",
  MISSING_VKN: "VKN eksik",
  NO_CONTACT: "İletişim bilgisi yok",
  SERVICE_NOT_STARTED: "Tebligat başlatılmadı",
  SERVICE_STUCK: "Tebligat takılı (7+ gün)",
  RETURN_REASON_MISSING: "İade sebebi girilmedi",
  DELIVERED_DATE_MISSING: "Tebliğ tarihi eksik",
  SERVICE_FAILED: "Tebligat başarısız",
  RISK_CONCORDAT: "Konkordato riski",
  RISK_BANKRUPTCY: "İflas riski",
  RISK_ADDRESS_SUSPECT: "Adres şüpheli",
  STALE_30D: "30+ gündür işlem yok",
  NO_ASSET_QUERY: "Malvarlığı sorgusu yapılmadı",
};

@Injectable()
export class DebtorService {
  constructor(private prisma: PrismaService) {}

  // ==================== CRUD OPERATIONS ====================

  async findAll(
    tenantId: string,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      type?: string;
      riskLevel?: string;
      city?: string;
    }
  ) {
    const { page = 1, limit = 20, search, type, riskLevel, city } = params || {};

    const where: any = { tenantId };

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { identityNo: { contains: search } },
        { tckn: { contains: search } },
        { vkn: { contains: search } },
        { detsisNo: { contains: search } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ];
    }

    // Type filter
    if (type) {
      where.type = type;
    }

    // Risk level filter
    if (riskLevel) {
      where.riskLevel = riskLevel;
    }

    // City filter (from addresses)
    if (city) {
      where.debtorAddresses = {
        some: { city: { contains: city, mode: "insensitive" } },
      };
    }

    const [debtors, total] = await Promise.all([
      this.prisma.debtor.findMany({
        where,
        include: {
          debtorAddresses: true,
          estateHeirs: true,
          _count: { select: { caseDebtors: true, assets: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.debtor.count({ where }),
    ]);

    // PR-D4d: her satıra ANLIK completeness sinyali (task'tan bağımsız = gerçek veri durumu).
    // page limit 25 olduğundan per-row compute performans sorunu değil.
    const data = debtors.map((d) => {
      const missingFields = computeDebtorMissingFields(d as any);
      return {
        ...d,
        missingFields,
        missingFieldsCount: missingFields.length,
        isComplete: missingFields.length === 0,
      };
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: string, id: string) {
    const debtor = await this.prisma.debtor.findFirst({
      where: { id, tenantId },
      include: {
        debtorAddresses: { orderBy: { isPrimary: "desc" } },
        estateHeirs: true,
        caseDebtors: {
          include: {
            case: { select: { id: true, fileNumber: true, status: true, caseStatus: true } },
            selectedAddress: true,
          },
        },
        assets: true,
        communications: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });

    if (!debtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    return debtor;
  }


  async create(tenantId: string, dto: CreateDebtorDto) {
    // Validate required fields based on type
    this.validateDebtorByType(dto);

    // Check for duplicates
    const duplicate = await this.checkDuplicateInternal(tenantId, dto);
    if (duplicate) {
      throw new ConflictException({
        message: "Bu kimlik numarasına sahip borçlu zaten mevcut",
        existingDebtor: duplicate,
      });
    }

    // Compute name and identityNo
    const { name, identityNo } = this.computeNameAndIdentity(dto);

    // Extract addresses, estateHeirs, and clientConfirmed from dto
    const { addresses, estateHeirs, clientConfirmed, ...debtorData } = dto;

    // Determine addressIntakeMode based on clientConfirmed and addresses
    let addressIntakeMode: 'CLIENT_CONFIRMED' | 'UNKNOWN' | 'NEEDS_CLIENT_REQUEST' = 'UNKNOWN';
    const hasAddresses = addresses && addresses.length > 0;
    
    if (hasAddresses && clientConfirmed) {
      addressIntakeMode = 'CLIENT_CONFIRMED';
    } else if (!hasAddresses) {
      addressIntakeMode = 'NEEDS_CLIENT_REQUEST';
    }
    // else: hasAddresses but not confirmed → UNKNOWN (default)

    // Create debtor with addresses and estate heirs
    const debtor = await this.prisma.debtor.create({
      data: {
        tenantId,
        ...debtorData,
        name,
        identityNo,
        addressIntakeMode,
        debtorAddresses: addresses?.length
          ? {
              create: addresses.map((addr, index) => ({
                ...addr,
                isPrimary: addr.isPrimary ?? index === 0,
                // If clientConfirmed, set addressCategory to DECLARED_CLIENT
                ...(clientConfirmed ? { addressCategory: 'DECLARED_CLIENT' } : {}),
              })),
            }
          : undefined,
        // Tereke için mirasçıları oluştur
        estateHeirs: dto.type === DebtorType.ESTATE && estateHeirs?.length
          ? {
              create: estateHeirs.map((heir) => ({
                name: heir.name,
                tckn: heir.tckn || null,
                address: heir.address || "", // Zorunlu alan
                city: heir.city || null,
                district: heir.district || null,
                shareRatio: heir.shareRatio || null,
                phone: heir.phone || null,
                email: heir.email || null,
              })),
            }
          : undefined,
      },
      include: {
        debtorAddresses: true,
        estateHeirs: true,
      },
    });

    // PR-D4c: completeness görevini senkronla (best-effort).
    await this.syncDebtorTaskByIdSafe(tenantId, debtor.id);

    return debtor;
  }

  async update(tenantId: string, id: string, dto: UpdateDebtorDto) {
    const existing = await this.findOne(tenantId, id);

    // If type is changing, validate new type requirements
    const newType = dto.type || existing.type;
    if (dto.type) {
      this.validateDebtorByType({ ...dto, type: newType } as CreateDebtorDto);
    }

    // Check for duplicates if identity number is changing
    if (dto.tckn || dto.vkn || dto.detsisNo) {
      const duplicate = await this.checkDuplicateInternal(tenantId, {
        type: newType as DebtorType,
        tckn: dto.tckn,
        vkn: dto.vkn,
        detsisNo: dto.detsisNo,
      }, id);
      if (duplicate) {
        throw new ConflictException({
          message: "Bu kimlik numarasına sahip başka bir borçlu mevcut",
          existingDebtor: duplicate,
        });
      }
    }

    // Computed `name` ve `identityNo` TEK KAYNAK türevidir → her update'te mevcut+dto birleşiminden
    // YENİDEN hesaplanır (PR-D1). `??` ile yalnız dto'da gelmeyen alan mevcuttan alınır.
    // PR-D2b: estateHeirs bir RELATION → scalar update'e karışmasın diye dto'dan ayrıştırılır.
    const { estateHeirs, ...debtorDto } = dto as any;
    const updateData: any = { ...debtorDto };
    const merged = {
      type: dto.type ?? existing.type,
      firstName: dto.firstName ?? existing.firstName,
      lastName: dto.lastName ?? existing.lastName,
      companyName: dto.companyName ?? existing.companyName,
      institutionName: dto.institutionName ?? existing.institutionName,
      deceasedName: dto.deceasedName ?? existing.deceasedName,
      tckn: dto.tckn ?? existing.tckn,
      vkn: dto.vkn ?? existing.vkn,
      detsisNo: dto.detsisNo ?? existing.detsisNo,
      deceasedTckn: dto.deceasedTckn ?? existing.deceasedTckn,
    };
    const { name, identityNo } = this.computeNameAndIdentity(merged as CreateDebtorDto);
    updateData.name = name;
    updateData.identityNo = identityNo;

    // PR-D2b: estateHeirs gönderildiyse mirasçı listesini ATOMİK replace et (deleteMany+create
    // + scalar update aynı transaction'da → yarım güncelleme riski yok). Gönderilmezse dokunma.
    let result;
    if (estateHeirs !== undefined) {
      result = await this.prisma.$transaction(async (tx) => {
        await tx.estateHeir.deleteMany({ where: { debtorId: id } });
        return tx.debtor.update({
          where: { id },
          data: {
            ...updateData,
            estateHeirs: {
              create: (estateHeirs as any[]).map((h) => ({
                name: h.name,
                tckn: h.tckn || null,
                address: h.address || "", // Zorunlu alan (şema)
                city: h.city || null,
                district: h.district || null,
                shareRatio: h.shareRatio || null,
                phone: h.phone || null,
                email: h.email || null,
              })),
            },
          },
          include: { debtorAddresses: true, estateHeirs: true },
        });
      });
    } else {
      result = await this.prisma.debtor.update({
        where: { id },
        data: updateData,
        include: { debtorAddresses: true, estateHeirs: true },
      });
    }

    // PR-D4c: completeness görevini senkronla (best-effort).
    await this.syncDebtorTaskByIdSafe(tenantId, id);

    return result;
  }

  async delete(tenantId: string, id: string) {
    const debtor = await this.findOne(tenantId, id);

    // Check for active case associations
    const activeCases = await this.prisma.caseDebtor.count({
      where: {
        debtorId: id,
        case: {
          caseStatus: { in: ["DERDEST", "ISLEMDE", "DERKENAR"] },
        },
      },
    });

    if (activeCases > 0) {
      throw new BadRequestException(
        `Bu borçlu ${activeCases} aktif takipte yer almaktadır. Silmeden önce takiplerden çıkarılmalıdır.`
      );
    }

    return this.prisma.debtor.delete({ where: { id } });
  }

  // ==================== PR-D4c: COMPLETENESS TASK SYNC ====================

  /**
   * Borçlu verisini çekip completeness görevini senkronlar. BEST-EFFORT (sync hatası ana
   * işlemi BOZMAZ). create/update + addAddress/deleteAddress sonrası çağrılır (adres ayrı
   * endpoint'lerle değiştiği için adres-eksiği takılı kalmasın).
   */
  private async syncDebtorTaskByIdSafe(tenantId: string, debtorId: string): Promise<void> {
    try {
      const debtor = await this.prisma.debtor.findFirst({
        where: { id: debtorId, tenantId },
        select: {
          id: true, type: true, tckn: true, vkn: true, detsisNo: true,
          institutionName: true, deceasedName: true, phone: true, email: true,
          debtorAddresses: { select: { id: true } },
          estateHeirs: { select: { id: true } },
        },
      });
      if (debtor) await this.syncDebtorTask(tenantId, debtor as any);
    } catch (e: any) {
      console.error(`[DebtorService] completeness sync hatası (debtor ${debtorId}): ${e?.message}`);
    }
  }

  /**
   * Client completeness deseninin borçlu ikizi: eksik varsa tek-satır deduped DEBTOR_INFO görevi
   * (taskSubType=DEBTOR_INFO, debtorId, escalationLevel STAFF); eksik yoksa açık görevi
   * AUTO_SYSTEM COMPLETED yapar. dedupeKey "OPCOMP:DEBTOR:{debtorId}" → tek aktif görev.
   * <remarks>
   * Çağrıldığı yerler:
   * - DebtorService.create()/update()/addAddress()/deleteAddress() → completeness senkronu
   * </remarks>
   */
  private async syncDebtorTask(
    tenantId: string,
    debtor: { id: string; type: string; [k: string]: any }
  ): Promise<void> {
    const dedupeKey = debtorTaskDedupeKey(debtor.id);
    const existing = await this.prisma.task.findUnique({ where: { dedupeKey } });
    const missing = computeDebtorMissingFields(debtor);

    // Eksik yok → tamamlandı (sistem kapanışı).
    if (missing.length === 0) {
      if (existing && existing.status !== 'COMPLETED' && existing.status !== 'CANCELLED') {
        await this.prisma.task.update({
          where: { id: existing.id },
          data: { status: 'COMPLETED', completedAt: new Date(), resolutionType: 'AUTO_SYSTEM', completedByUserId: null },
        });
      }
      return;
    }

    // Eksik var → tek satır upsert.
    const now = new Date();
    const due = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 gün SLA
    const description = `Eksik borçlu bilgisi: ${missing.join(', ')}`;
    const reopening = !!existing && (existing.status === 'COMPLETED' || existing.status === 'CANCELLED');

    if (existing) {
      await this.prisma.task.update({
        where: { id: existing.id },
        data: {
          missingFields: missing,
          description,
          // Kapalı görevi yeniden aç + SLA/eskalasyon sıfırla + kapanış izini temizle; açık görevse
          // sadece eksik listesini güncelle.
          ...(reopening
            ? { status: 'PENDING', completedAt: null, completedByUserId: null, resolutionType: null, dueDate: due, escalationLevel: 'STAFF', nextFollowUpAt: due }
            : {}),
        },
      });
    } else {
      await this.prisma.task.create({
        data: {
          tenantId,
          debtorId: debtor.id,
          title: 'Borçlu bilgilerini tamamla',
          description,
          status: 'PENDING',
          priority: 'MEDIUM',
          taskCategory: 'OPERATIONAL_COMPLETENESS',
          taskSubType: 'DEBTOR_INFO',
          dedupeKey,
          missingFields: missing,
          dueDate: due,
          escalationLevel: 'STAFF',
          nextFollowUpAt: due,
        },
      });
    }
  }

  // ==================== PR-D4e-2: İSTİHBARAT TETİKLERİ ====================

  /**
   * Saha istihbaratı (LOCATION_VERIFICATION) görevini senkronlar. BEST-EFFORT (ana işlemi BOZMAZ).
   * Mükerrer aktif görev açmaz (dedupe). Kapalı görev + yeni tetik → yeniden açar. SONUÇ YAZMAZ (D4e-3).
   * <remarks>
   * Çağrıldığı yerler:
   * - DebtorService.addAddress() → yeni adres (verified=false) [A]
   * - DebtorService.updateServiceStatus() → DELIVERED+UETS/KEP [B] · RETURNED+MOVED/ADDRESS_NOT_FOUND [C]
   * </remarks>
   * @param checkRecentVerified B kuralı: son 90 gün VERIFIED_PRESENT varsa görev açma.
   */
  private async syncIntelligenceTaskSafe(
    tenantId: string,
    debtorId: string,
    addressId: string | null,
    checkRecentVerified = false
  ): Promise<void> {
    try {
      // B: son 90 gün içinde bu adres VERIFIED_PRESENT ise yeniden teyide gerek yok.
      if (checkRecentVerified && addressId) {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const recent = await this.prisma.debtorIntelligence.findFirst({
          where: { debtorId, addressId, result: 'VERIFIED_PRESENT', createdAt: { gte: ninetyDaysAgo } },
          select: { id: true },
        });
        if (recent) return;
      }

      const dedupeKey = intelligenceLocationDedupeKey(debtorId, addressId);
      const existing = await this.prisma.task.findUnique({ where: { dedupeKey } });

      // Mükerrer aktif görev açma.
      if (existing && (existing.status === 'PENDING' || existing.status === 'IN_PROGRESS')) return;

      const now = new Date();
      const due = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // +3g SLA
      const title = 'Saha teyidi (lokasyon doğrulama)';
      const description = 'Bu borçlu/adres için saha teyidi (fiili lokasyon doğrulama) gerekli.';

      if (existing) {
        // Kapalı görev (COMPLETED/CANCELLED) + yeni tetik → yeniden aç.
        await this.prisma.task.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING', completedAt: null, completedByUserId: null, resolutionType: null,
            dueDate: due, escalationLevel: 'STAFF', nextFollowUpAt: due,
            ...(addressId ? { addressId } : {}),
          },
        });
      } else {
        await this.prisma.task.create({
          data: {
            tenantId,
            debtorId,
            ...(addressId ? { addressId } : {}),
            title,
            description,
            status: 'PENDING',
            priority: 'MEDIUM',
            taskCategory: 'OPERATIONAL_COMPLETENESS',
            taskSubType: 'DEBTOR_INTELLIGENCE',
            dedupeKey,
            dueDate: due,
            escalationLevel: 'STAFF',
            nextFollowUpAt: due,
          },
        });
      }
    } catch (e: any) {
      console.error(`[DebtorService] intelligence sync hatası (debtor ${debtorId}): ${e?.message}`);
    }
  }

  // ==================== DUPLICATE CHECK ====================

  async checkDuplicate(tenantId: string, dto: CheckDuplicateDto) {
    const duplicate = await this.checkDuplicateInternal(tenantId, dto);
    return {
      isDuplicate: !!duplicate,
      existingDebtor: duplicate,
    };
  }

  private async checkDuplicateInternal(
    tenantId: string,
    dto: { type?: DebtorType; tckn?: string; vkn?: string; detsisNo?: string },
    excludeId?: string
  ) {
    const conditions: any[] = [];

    if (dto.tckn) {
      conditions.push({ tckn: dto.tckn });
    }
    if (dto.vkn) {
      conditions.push({ vkn: dto.vkn });
    }
    if (dto.detsisNo) {
      conditions.push({ detsisNo: dto.detsisNo });
    }

    if (conditions.length === 0) return null;

    const where: any = {
      tenantId,
      OR: conditions,
    };

    if (excludeId) {
      where.id = { not: excludeId };
    }

    return this.prisma.debtor.findFirst({
      where,
      select: { id: true, name: true, type: true, identityNo: true },
    });
  }


  // ==================== ADDRESS MANAGEMENT ====================

  async addAddress(tenantId: string, debtorId: string, dto: CreateDebtorAddressDto) {
    await this.findOne(tenantId, debtorId);

    // If this is primary, unset other primaries
    if (dto.isPrimary) {
      await this.prisma.debtorAddress.updateMany({
        where: { debtorId },
        data: { isPrimary: false },
      });
    }

    const created = await this.prisma.debtorAddress.create({
      data: { debtorId, ...dto },
    });
    // PR-D4c: adres eklenince "adres eksik" completeness durumu değişebilir → senkronla.
    await this.syncDebtorTaskByIdSafe(tenantId, debtorId);
    // PR-D4e-2 [A]: yeni adres doğrulanmamış (verified=false) → saha teyidi görevi.
    if (!created.verified) {
      await this.syncIntelligenceTaskSafe(tenantId, debtorId, created.id);
    }
    return created;
  }

  async updateAddress(
    tenantId: string,
    debtorId: string,
    addressId: string,
    dto: UpdateDebtorAddressDto
  ) {
    await this.findOne(tenantId, debtorId);

    const address = await this.prisma.debtorAddress.findFirst({
      where: { id: addressId, debtorId },
    });

    if (!address) {
      throw new NotFoundException("Adres bulunamadı");
    }

    // If setting as primary, unset others
    if (dto.isPrimary) {
      await this.prisma.debtorAddress.updateMany({
        where: { debtorId, id: { not: addressId } },
        data: { isPrimary: false },
      });
    }

    return this.prisma.debtorAddress.update({
      where: { id: addressId },
      data: dto,
    });
  }

  async deleteAddress(tenantId: string, debtorId: string, addressId: string) {
    await this.findOne(tenantId, debtorId);

    const address = await this.prisma.debtorAddress.findFirst({
      where: { id: addressId, debtorId },
    });

    if (!address) {
      throw new NotFoundException("Adres bulunamadı");
    }

    // Check if address is used in any case
    const usedInCases = await this.prisma.caseDebtor.count({
      where: { selectedAddressId: addressId },
    });

    if (usedInCases > 0) {
      throw new BadRequestException(
        "Bu adres aktif takiplerde tebligat adresi olarak seçili. Önce takiplerdeki adresi değiştirin."
      );
    }

    const deleted = await this.prisma.debtorAddress.delete({ where: { id: addressId } });
    // PR-D4c: son adres silinince "adres eksik" completeness görevi yeniden açılabilir → senkronla.
    await this.syncDebtorTaskByIdSafe(tenantId, debtorId);
    return deleted;
  }

  async setPrimaryAddress(tenantId: string, debtorId: string, addressId: string) {
    await this.findOne(tenantId, debtorId);

    const address = await this.prisma.debtorAddress.findFirst({
      where: { id: addressId, debtorId },
    });

    if (!address) {
      throw new NotFoundException("Adres bulunamadı");
    }

    // Unset all primaries and set the new one
    await this.prisma.$transaction([
      this.prisma.debtorAddress.updateMany({
        where: { debtorId },
        data: { isPrimary: false },
      }),
      this.prisma.debtorAddress.update({
        where: { id: addressId },
        data: { isPrimary: true },
      }),
    ]);

    return { success: true };
  }

  // ==================== HELPER METHODS ====================

  private validateDebtorByType(dto: CreateDebtorDto) {
    switch (dto.type) {
      case DebtorType.INDIVIDUAL:
        if (!dto.firstName || !dto.lastName) {
          throw new BadRequestException("Gerçek kişi için ad ve soyad zorunludur");
        }
        break;
      case DebtorType.COMPANY:
        if (!dto.companyName) {
          throw new BadRequestException("Tüzel kişi için şirket adı zorunludur");
        }
        break;
      case DebtorType.PUBLIC_INSTITUTION:
        if (!dto.institutionName) {
          throw new BadRequestException("Kamu kurumu için kurum adı zorunludur");
        }
        break;
      case DebtorType.ESTATE:
        if (!dto.deceasedName) {
          throw new BadRequestException("Tereke için murisin adı zorunludur");
        }
        if (!dto.estateHeirs || dto.estateHeirs.length === 0) {
          throw new BadRequestException("Tereke için en az bir mirasçı girilmelidir");
        }
        break;
    }
  }

  private computeNameAndIdentity(dto: CreateDebtorDto): { name: string; identityNo: string | null } {
    let name = "";
    let identityNo: string | null = null;

    switch (dto.type) {
      case DebtorType.INDIVIDUAL:
        name = `${dto.firstName || ""} ${dto.lastName || ""}`.trim();
        identityNo = dto.tckn || null;
        break;
      case DebtorType.COMPANY:
        name = dto.companyName || "";
        identityNo = dto.vkn || null;
        break;
      case DebtorType.PUBLIC_INSTITUTION:
        name = dto.institutionName || "";
        identityNo = dto.detsisNo || null;
        break;
      case DebtorType.ESTATE:
        // Tereke için isim: "Muris Adı Mirasçıları" formatında
        name = `${dto.deceasedName || ""} Mirasçıları`.trim();
        identityNo = dto.deceasedTckn || null;
        break;
    }

    return { name, identityNo };
  }

  // ==================== STATISTICS ====================

  async getStatistics(tenantId: string) {
    const [total, byType, byRisk, recentlyAdded] = await Promise.all([
      this.prisma.debtor.count({ where: { tenantId } }),
      this.prisma.debtor.groupBy({
        by: ["type"],
        where: { tenantId },
        _count: true,
      }),
      this.prisma.debtor.groupBy({
        by: ["riskLevel"],
        where: { tenantId, riskLevel: { not: null } },
        _count: true,
      }),
      this.prisma.debtor.count({
        where: {
          tenantId,
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      total,
      byType: byType.reduce((acc, item) => ({ ...acc, [item.type]: item._count }), {}),
      byRisk: byRisk.reduce((acc, item) => ({ ...acc, [item.riskLevel || "NONE"]: item._count }), {}),
      recentlyAdded,
    };
  }

  // ==================== CASE DEBTORS (FAZ 1) ====================

  /**
   * Get debtors for a specific case with summary
   * Returns DebtorListItemDTO[] + DebtorsSummaryDTO
   */
  async getDebtorsForCase(tenantId: string, caseId: string): Promise<{
    summary: DebtorsSummaryDTO;
    items: DebtorListItemDTO[];
  }> {
    // Verify case exists and belongs to tenant
    const caseExists = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });

    if (!caseExists) {
      throw new NotFoundException("Takip bulunamadı");
    }

    // Fetch case debtors with debtor details
    const caseDebtors = await this.prisma.caseDebtor.findMany({
      where: { caseId },
      include: {
        debtor: {
          include: {
            debtorAddresses: { where: { isPrimary: true }, take: 1 },
          },
        },
        selectedAddress: true,
      },
      orderBy: [
        { role: "asc" },
        { createdAt: "asc" },
      ],
    });

    // Transform to DTOs and calculate issues
    const items: DebtorListItemDTO[] = [];
    
    for (const cd of caseDebtors) {
      const debtor = cd.debtor;
      const address = cd.selectedAddress || debtor.debtorAddresses[0];
      const issues = this.calculateDebtorIssues(cd, debtor, address);
      const alertLevel = this.getMaxAlertLevel(issues);
      const serviceStatus = (cd.serviceStatus as ServiceStatus) || "NOT_STARTED";

      // Kesinleşme tarihi hesapla (tebliğ + 7 gün - ilamsız icra için ödeme emrine itiraz süresi)
      const finalizationDate = cd.deliveredAt 
        ? new Date(cd.deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      // Check if debtor has different address in other cases (cross-file)
      let hasDifferentAddressInOtherCase = false;
      if (debtor.identityNo) {
        const otherCaseAddresses = await this.prisma.debtorAddress.findMany({
          where: {
            debtor: {
              identityNo: debtor.identityNo,
              tenantId,
              id: { not: debtor.id }, // Different debtor record (same person, different case)
            },
          },
          select: { fullText: true },
          take: 5,
        });
        
        if (otherCaseAddresses.length > 0 && address?.fullText) {
          // Check if any address is different
          hasDifferentAddressInOtherCase = otherCaseAddresses.some(
            (a) => a.fullText && a.fullText !== address.fullText
          );
        }
      }

      // Get address research status
      let researchStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXHAUSTED' = 'NOT_STARTED';
      const research = await this.prisma.addressResearch.findUnique({
        where: { caseDebtorId: cd.id },
        select: { status: true },
      });
      if (research) {
        researchStatus = research.status as typeof researchStatus;
      }

      items.push({
        id: debtor.id,
        caseDebtorId: cd.id,
        displayName: debtor.name,
        personType: this.mapDebtorTypeToPersonType(debtor.type),
        role: cd.role as DebtorRole,
        identityMasked: this.maskIdentity(debtor.identityNo, debtor.type),
        phoneMasked: this.maskPhone(debtor.phone),
        addressShort: address ? `${address.district || ""}/${address.city || ""}`.replace(/^\//, "") : undefined,
        serviceStatus,
        serviceLabel: this.computeServiceLabel(serviceStatus, cd),
        deliveredAt: cd.deliveredAt?.toISOString(),
        finalizationDate,
        assets: {
          vehicle: (cd.assetVehicle as AssetQueryStatus) || "UNKNOWN",
          realEstate: (cd.assetRealEstate as AssetQueryStatus) || "UNKNOWN",
          bank: (cd.assetBank as AssetQueryStatus) || "UNKNOWN",
          sgkWage: (cd.assetSgkWage as AssetQueryStatus) || "UNKNOWN",
          lastQueryAt: cd.assetLastQueryAt?.toISOString(),
        },
        alertCount: issues.length,
        alertLevel,
        issues,
        hasDifferentAddressInOtherCase,
        researchStatus,
      });
    }

    // Calculate summary
    const summary: DebtorsSummaryDTO = {
      total: items.length,
      delivered: items.filter((i) => i.serviceStatus === "DELIVERED").length,
      pending: items.filter((i) => 
        ["NOT_STARTED", "READY", "SENT"].includes(i.serviceStatus)
      ).length,
      returned: items.filter((i) => i.serviceStatus === "RETURNED").length,
      danger: items.filter((i) => i.alertLevel === "DANGER").length,
    };

    return { summary, items };
  }

  /**
   * Get detailed debtor info for drawer
   */
  async getCaseDebtorDetail(tenantId: string, caseId: string, caseDebtorId: string): Promise<DebtorDetailDTO> {
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { 
        id: caseDebtorId, 
        caseId,
        case: { tenantId },
      },
      include: {
        debtor: {
          include: {
            debtorAddresses: { orderBy: { isPrimary: "desc" } },
          },
        },
        selectedAddress: true,
      },
    });

    if (!caseDebtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    const debtor = caseDebtor.debtor;
    const address = caseDebtor.selectedAddress || debtor.debtorAddresses[0];
    const issues = this.calculateDebtorIssues(caseDebtor, debtor, address);
    const alertLevel = this.getMaxAlertLevel(issues);
    const serviceStatus = (caseDebtor.serviceStatus as ServiceStatus) || "NOT_STARTED";

    return {
      id: debtor.id,
      caseDebtorId: caseDebtor.id,
      displayName: debtor.name,
      personType: this.mapDebtorTypeToPersonType(debtor.type),
      role: caseDebtor.role as DebtorRole,
      identityMasked: this.maskIdentity(debtor.identityNo, debtor.type),
      phoneMasked: this.maskPhone(debtor.phone),
      emailMasked: this.maskEmail(debtor.email),
      // Full contact info for detail view
      phone: debtor.phone || undefined,
      email: debtor.email || undefined,
      identityNo: debtor.identityNo || undefined,
      address: address ? `${address.street || ""}, ${address.district || ""} / ${address.city || ""}`.replace(/^, /, "").replace(/ \/ $/, "") : undefined,
      addressShort: address ? `${address.district || ""}/${address.city || ""}`.replace(/^\//, "") : undefined,
      // Addresses (Tebligat Kanunu'na uygun)
      addresses: debtor.debtorAddresses.map((addr) => ({
        id: addr.id,
        type: addr.type,
        subType: addr.subType || undefined,
        source: addr.source,
        street: addr.street,
        city: addr.city,
        district: addr.district || undefined,
        postalCode: addr.postalCode || undefined,
        fullText: addr.fullText || `${addr.street}, ${addr.district || ""} ${addr.city}`.trim(),
        legalPriority: addr.legalPriority,
        canApply21_2: addr.canApply21_2,
        verified: addr.verified,
        verifiedAt: addr.verifiedAt?.toISOString(),
        riskFlags: (addr.riskFlags || []) as string[],
        isPrimary: addr.isPrimary,
        tk21_2Applied: addr.tk21_2Applied || false,
      })),
      selectedAddressId: caseDebtor.selectedAddressId || undefined,
      serviceStatus,
      serviceLabel: this.computeServiceLabel(serviceStatus, caseDebtor),
      alertCount: issues.length,
      alertLevel,
      service: {
        status: serviceStatus,
        channel: caseDebtor.serviceChannel as any,
        trackingNo: caseDebtor.trackingNo || undefined,
        sentAt: caseDebtor.sentAt?.toISOString(),
        deliveredAt: caseDebtor.deliveredAt?.toISOString(),
        returnedAt: caseDebtor.returnedAt?.toISOString(),
        returnReason: caseDebtor.returnReason as any,
      },
      assets: {
        vehicle: (caseDebtor.assetVehicle as AssetQueryStatus) || "UNKNOWN",
        realEstate: (caseDebtor.assetRealEstate as AssetQueryStatus) || "UNKNOWN",
        bank: (caseDebtor.assetBank as AssetQueryStatus) || "UNKNOWN",
        sgkWage: (caseDebtor.assetSgkWage as AssetQueryStatus) || "UNKNOWN",
        lastQueryAt: caseDebtor.assetLastQueryAt?.toISOString(),
      },
      riskFlags: this.extractRiskFlags(debtor, debtor.debtorAddresses, caseDebtor.selectedAddressId || undefined),
      staleDays: this.calculateStaleDays(caseDebtor.updatedAt),
      quickNote: caseDebtor.quickNote || undefined,
      issues,
    };
  }

  /**
   * Update quick note for a case debtor
   */
  async updateQuickNote(
    tenantId: string,
    caseId: string,
    caseDebtorId: string,
    userId: string,
    text: string
  ): Promise<{ quickNote: string | null; updatedAt: string }> {
    // Verify access
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId, caseId, case: { tenantId } },
    });

    if (!caseDebtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    // Validate length
    if (text && text.length > 240) {
      throw new BadRequestException("Not en fazla 240 karakter olabilir");
    }

    const updated = await this.prisma.caseDebtor.update({
      where: { id: caseDebtorId },
      data: {
        quickNote: text || null,
        quickNoteUpdatedAt: new Date(),
        quickNoteUpdatedBy: userId,
      },
    });

    return {
      quickNote: updated.quickNote,
      updatedAt: updated.quickNoteUpdatedAt?.toISOString() || new Date().toISOString(),
    };
  }

  // ==================== ISSUE CALCULATION ====================

  private calculateDebtorIssues(
    caseDebtor: any,
    debtor: any,
    address: any
  ): DebtorIssue[] {
    const issues: DebtorIssue[] = [];

    // Address check
    if (!address) {
      issues.push({
        code: "MISSING_ADDRESS",
        level: "DANGER",
        label: DebtorIssueLabelMap.MISSING_ADDRESS,
      });
    }

    // Identity check based on type
    if (debtor.type === "INDIVIDUAL" && !debtor.tckn) {
      issues.push({
        code: "MISSING_TCKN",
        level: "WARN",
        label: DebtorIssueLabelMap.MISSING_TCKN,
      });
    }
    if (debtor.type === "COMPANY" && !debtor.vkn) {
      issues.push({
        code: "MISSING_VKN",
        level: "WARN",
        label: DebtorIssueLabelMap.MISSING_VKN,
      });
    }

    // Contact check
    if (!debtor.phone && !debtor.email) {
      issues.push({
        code: "NO_CONTACT",
        level: "INFO",
        label: DebtorIssueLabelMap.NO_CONTACT,
      });
    }

    // Service status checks
    const status = caseDebtor.serviceStatus || "NOT_STARTED";
    
    if (status === "NOT_STARTED") {
      issues.push({
        code: "SERVICE_NOT_STARTED",
        level: "DANGER",
        label: DebtorIssueLabelMap.SERVICE_NOT_STARTED,
      });
    }

    if (status === "SENT" && caseDebtor.sentAt) {
      const daysSinceSent = Math.floor(
        (Date.now() - new Date(caseDebtor.sentAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceSent > 7) {
        issues.push({
          code: "SERVICE_STUCK",
          level: "WARN",
          label: DebtorIssueLabelMap.SERVICE_STUCK,
        });
      }
    }

    if (status === "RETURNED" && !caseDebtor.returnReason) {
      issues.push({
        code: "RETURN_REASON_MISSING",
        level: "WARN",
        label: DebtorIssueLabelMap.RETURN_REASON_MISSING,
      });
    }

    if (status === "DELIVERED" && !caseDebtor.deliveredAt) {
      issues.push({
        code: "DELIVERED_DATE_MISSING",
        level: "DANGER",
        label: DebtorIssueLabelMap.DELIVERED_DATE_MISSING,
      });
    }

    if (status === "FAILED") {
      issues.push({
        code: "SERVICE_FAILED",
        level: "DANGER",
        label: DebtorIssueLabelMap.SERVICE_FAILED,
      });
    }

    // Risk flags
    if (debtor.riskLevel === "COK_YUKSEK") {
      issues.push({
        code: "RISK_BANKRUPTCY",
        level: "DANGER",
        label: DebtorIssueLabelMap.RISK_BANKRUPTCY,
      });
    }

    return issues;
  }

  private getMaxAlertLevel(issues: DebtorIssue[]): AlertLevel {
    if (issues.some((i) => i.level === "DANGER")) return "DANGER";
    if (issues.some((i) => i.level === "WARN")) return "WARN";
    if (issues.some((i) => i.level === "INFO")) return "INFO";
    return "NONE";
  }

  // ==================== MASKING HELPERS ====================

  private maskIdentity(identityNo: string | null, type: string): string | undefined {
    if (!identityNo) return undefined;
    const prefix = type === "COMPANY" ? "VKN" : "TCKN";
    if (identityNo.length <= 4) return `${prefix}: ${identityNo}`;
    return `${prefix}: ${identityNo.slice(0, 2)}****${identityNo.slice(-2)}`;
  }

  private maskPhone(phone: string | null): string | undefined {
    if (!phone) return undefined;
    if (phone.length <= 4) return phone;
    return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
  }

  private maskEmail(email: string | null): string | undefined {
    if (!email) return undefined;
    const [local, domain] = email.split("@");
    if (!domain) return email;
    const maskedLocal = local.length > 2 ? `${local[0]}***${local.slice(-1)}` : local;
    return `${maskedLocal}@${domain}`;
  }

  private mapDebtorTypeToPersonType(type: string): "REAL" | "LEGAL" {
    return type === "INDIVIDUAL" || type === "ESTATE" ? "REAL" : "LEGAL";
  }

  private extractRiskFlags(debtor: any, addresses?: any[], selectedAddressId?: string): string[] {
    const flags: string[] = [];
    // Only add flags based on actual debtor status, not risk level
    if (debtor.status === "BANKRUPT" || debtor.bankruptcyStatus) flags.push("BANKRUPTCY");
    if (debtor.status === "CONCORDAT" || debtor.concordatStatus) flags.push("CONCORDAT");
    if (debtor.status === "DECEASED" || debtor.isDeceased) flags.push("DECEASED");
    if (debtor.type === "COMPANY" && debtor.status === "CLOSED") flags.push("COMPANY_CLOSED");
    
    // Add ADDRESS_SUSPECT only if the selected/active address has risk flags
    if (addresses && selectedAddressId) {
      const activeAddress = addresses.find(a => a.id === selectedAddressId);
      if (activeAddress?.riskFlags?.includes("ADDRESS_SUSPECT")) {
        flags.push("ADDRESS_SUSPECT");
      }
    }
    return flags;
  }

  private calculateStaleDays(updatedAt: Date): number {
    return Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));
  }

  /**
   * Compute service label with date for display
   * e.g. "Tebliğ Edildi — 12.01.2026" or "İade — Adres Bulunamadı"
   */
  private computeServiceLabel(status: ServiceStatus, caseDebtor: any): string {
    const formatDate = (date: Date | null | undefined): string => {
      if (!date) return "";
      return new Date(date).toLocaleDateString("tr-TR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    };

    const returnReasonLabels: Record<string, string> = {
      ADDRESS_NOT_FOUND: "Adres Bulunamadı",
      MOVED: "Taşınmış",
      REFUSED: "Reddetti",
      DECEASED: "Vefat",
      COMPANY_CLOSED: "Şirket Kapandı",
      UNCLAIMED: "Alınmadı",
      OTHER: "Diğer",
    };

    switch (status) {
      case "NOT_STARTED":
        return "Tebligat Başlatılmadı";
      case "READY":
        return "Hazırlandı";
      case "SENT":
        const sentDate = formatDate(caseDebtor.sentAt);
        const trackingNo = caseDebtor.trackingNo;
        if (trackingNo) {
          return `Gönderildi — ${trackingNo.slice(0, 6)}...`;
        }
        return sentDate ? `Gönderildi — ${sentDate}` : "Gönderildi";
      case "DELIVERED":
        const deliveredDate = formatDate(caseDebtor.deliveredAt);
        return deliveredDate ? `Tebliğ Edildi — ${deliveredDate}` : "Tebliğ Edildi";
      case "RETURNED":
        const reason = caseDebtor.returnReason;
        const reasonLabel = reason ? returnReasonLabels[reason] || reason : "";
        return reasonLabel ? `İade — ${reasonLabel}` : "İade";
      case "MUHTAR":
        const muhtarDate = formatDate(caseDebtor.deliveredAt);
        return muhtarDate ? `Muhtara — ${muhtarDate}` : "Muhtara";
      case "ANNOUNCEMENT":
        const announcementDate = formatDate(caseDebtor.deliveredAt);
        return announcementDate ? `İlan — ${announcementDate}` : "İlan";
      case "FAILED":
        return "Başarısız";
      default:
        return "Bilinmiyor";
    }
  }

  // ==================== FAZ 2: TEBLİGAT YÖNETİMİ ====================

  /**
   * Valid state transitions for service status
   */
  private readonly SERVICE_TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
    NOT_STARTED: ["READY", "FAILED"],
    READY: ["SENT", "FAILED"],
    SENT: ["DELIVERED", "RETURNED", "MUHTAR", "FAILED"],
    DELIVERED: [], // Terminal state
    RETURNED: ["READY", "FAILED"], // Can retry with new address
    MUHTAR: ["DELIVERED", "FAILED"],
    ANNOUNCEMENT: ["DELIVERED", "FAILED"],
    FAILED: ["READY"], // Can retry
    UNKNOWN: ["NOT_STARTED", "READY", "SENT", "DELIVERED", "RETURNED", "MUHTAR", "ANNOUNCEMENT", "FAILED"],
  };

  /**
   * Check if a status transition is valid
   */
  private isValidTransition(from: ServiceStatus, to: ServiceStatus): boolean {
    const allowed = this.SERVICE_TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  /**
   * Get allowed transitions from current status
   */
  private getAllowedTransitions(from: ServiceStatus): ServiceStatus[] {
    return this.SERVICE_TRANSITIONS[from] || [];
  }

  /**
   * Update service status for a case debtor
   */
  async updateServiceStatus(
    tenantId: string,
    caseId: string,
    caseDebtorId: string,
    userId: string,
    data: {
      status: ServiceStatus;
      channel?: string;
      trackingNo?: string;
      sentAt?: string;
      deliveredAt?: string;
      returnedAt?: string;
      returnReason?: string;
      note?: string;
      directEntry?: boolean;
      addressId?: string; // Tebligat yapılan adres ID'si
    }
  ): Promise<DebtorDetailDTO> {
    // Verify access
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId, caseId, case: { tenantId } },
      include: {
        debtor: {
          include: {
            debtorAddresses: true,
          },
        },
      },
    });

    if (!caseDebtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    const currentStatus = (caseDebtor.serviceStatus as ServiceStatus) || "NOT_STARTED";
    const newStatus = data.status;

    // Direct entry mode allows skipping intermediate states
    const allowedDirectEntryStatuses: ServiceStatus[] = ["DELIVERED", "RETURNED", "MUHTAR", "ANNOUNCEMENT"];
    const isDirectEntryAllowed = data.directEntry && allowedDirectEntryStatuses.includes(newStatus);

    // Validate state transition (skip if direct entry mode)
    if (!isDirectEntryAllowed && !this.isValidTransition(currentStatus, newStatus)) {
      throw new ConflictException({
        code: "INVALID_STATUS_TRANSITION",
        message: `${currentStatus} → ${newStatus} geçişi geçersiz`,
        from: currentStatus,
        to: newStatus,
        allowed: this.getAllowedTransitions(currentStatus),
      });
    }

    // Parse dates
    const sentAt = data.sentAt ? new Date(data.sentAt) : null;
    const deliveredAt = data.deliveredAt ? new Date(data.deliveredAt) : null;
    const returnedAt = data.returnedAt ? new Date(data.returnedAt) : null;

    // Determine actionDate based on status
    const actionDate = deliveredAt || returnedAt || sentAt || new Date();

    // Map frontend channel to Prisma enum (DebtorNotificationMode)
    const channelMapping: Record<string, string> = {
      PHYSICAL: "NORMAL",
      NORMAL: "NORMAL",
      UETS: "UETS",
      KEP: "KEP",
      ILANEN: "ILANEN",
      UNKNOWN: "NORMAL",
    };
    const mappedChannel = data.channel ? channelMapping[data.channel] || "NORMAL" : null;

    // Get address info for history recording
    let addressId: string | null = null;
    let addressType: string | null = null;
    let addressText: string | null = null;

    // Use provided addressId or fall back to selectedAddressId
    const targetAddressId = data.addressId || caseDebtor.selectedAddressId;
    
    if (targetAddressId) {
      const address = caseDebtor.debtor.debtorAddresses.find(a => a.id === targetAddressId);
      if (address) {
        addressId = address.id;
        addressType = address.type;
        addressText = [address.street, address.district, address.city].filter(Boolean).join(", ");
      }
    }

    try {
      // Update case debtor
      await this.prisma.caseDebtor.update({
        where: { id: caseDebtorId },
        data: {
          serviceStatus: newStatus,
          serviceChannel: mappedChannel as any || caseDebtor.serviceChannel,
          trackingNo: data.trackingNo || caseDebtor.trackingNo,
          sentAt: sentAt || caseDebtor.sentAt,
          deliveredAt: deliveredAt || caseDebtor.deliveredAt,
          returnedAt: returnedAt || caseDebtor.returnedAt,
          returnReason: data.returnReason as any || caseDebtor.returnReason,
        },
      });

      // Create history record with address info (non-blocking)
      try {
        await this.prisma.serviceHistory.create({
          data: {
            caseDebtorId,
            fromStatus: currentStatus,
            toStatus: newStatus,
            channel: mappedChannel as any || null,
            trackingNo: data.trackingNo || null,
            actionDate,
            returnReason: data.returnReason as any || null,
            note: data.note || null,
            createdBy: userId,
            // Address snapshot for TK compliance
            addressId,
            addressType: addressType as any || null,
            addressText,
          },
        });
      } catch (historyError) {
        console.error("ServiceHistory create error:", historyError);
        // Don't fail the main operation
      }

      // PR-D4e-2: tebligat sonucuna göre saha istihbaratı tetiği (best-effort, ana işlemi bozmaz).
      const debtorIdForIntel = caseDebtor.debtor.id;
      // [B] e-tebligat (UETS/KEP) BAŞARILI + adres var → son 90g VERIFIED_PRESENT yoksa görev.
      if (newStatus === "DELIVERED" && (mappedChannel === "UETS" || mappedChannel === "KEP") && addressId) {
        await this.syncIntelligenceTaskSafe(tenantId, debtorIdForIntel, addressId, true);
      }
      // [C] İADE (taşınmış / adres bulunamadı) → fiili lokasyon teyidi.
      if (newStatus === "RETURNED" && (data.returnReason === "MOVED" || data.returnReason === "ADDRESS_NOT_FOUND")) {
        await this.syncIntelligenceTaskSafe(tenantId, debtorIdForIntel, addressId);
      }

      // Return updated detail
      return this.getCaseDebtorDetail(tenantId, caseId, caseDebtorId);
    } catch (error) {
      console.error("updateServiceStatus error:", error);
      throw error;
    }
  }

  /**
   * Get service history for a case debtor
   */
  async getServiceHistory(
    tenantId: string,
    caseId: string,
    caseDebtorId: string
  ): Promise<{
    id: string;
    fromStatus: ServiceStatus;
    toStatus: ServiceStatus;
    channel?: string;
    trackingNo?: string;
    actionDate?: string;
    returnReason?: string;
    note?: string;
    createdAt: string;
    createdBy?: string;
    // Address info (TK compliance)
    addressId?: string;
    addressType?: string;
    addressText?: string;
  }[]> {
    // Verify access
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId, caseId, case: { tenantId } },
    });

    if (!caseDebtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    const history = await this.prisma.serviceHistory.findMany({
      where: { caseDebtorId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return history.map((h) => ({
      id: h.id,
      fromStatus: (h.fromStatus || "UNKNOWN") as ServiceStatus,
      toStatus: h.toStatus as ServiceStatus,
      channel: h.channel || undefined,
      trackingNo: h.trackingNo || undefined,
      actionDate: h.actionDate?.toISOString(),
      returnReason: h.returnReason || undefined,
      note: h.note || undefined,
      createdAt: h.createdAt.toISOString(),
      createdBy: h.createdBy || undefined,
      // Address info (TK compliance)
      addressId: h.addressId || undefined,
      addressType: h.addressType || undefined,
      addressText: h.addressText || undefined,
    }));
  }

  /**
   * Start a new service attempt (after RETURNED)
   * Resets status to READY and clears tracking info
   */
  async startNewServiceAttempt(
    tenantId: string,
    caseId: string,
    caseDebtorId: string,
    userId: string,
    newAddressId?: string
  ): Promise<DebtorDetailDTO> {
    const caseDebtor = await this.prisma.caseDebtor.findFirst({
      where: { id: caseDebtorId, caseId, case: { tenantId } },
    });

    if (!caseDebtor) {
      throw new NotFoundException("Borçlu bulunamadı");
    }

    const currentStatus = (caseDebtor.serviceStatus as ServiceStatus) || "NOT_STARTED";

    // Only allow from RETURNED or FAILED
    if (!["RETURNED", "FAILED"].includes(currentStatus)) {
      throw new BadRequestException(
        "Yeni tebligat denemesi sadece iade veya başarısız durumdan başlatılabilir"
      );
    }

    // Update with history
    await this.prisma.$transaction(async (tx) => {
      // Create history record
      await tx.serviceHistory.create({
        data: {
          caseDebtorId,
          fromStatus: currentStatus,
          toStatus: "READY",
          actionDate: new Date(),
          note: "Yeni tebligat denemesi başlatıldı",
          createdBy: userId,
        },
      });

      // Reset service fields
      await tx.caseDebtor.update({
        where: { id: caseDebtorId },
        data: {
          serviceStatus: "READY",
          trackingNo: null,
          sentAt: null,
          deliveredAt: null,
          returnedAt: null,
          returnReason: null,
          selectedAddressId: newAddressId || caseDebtor.selectedAddressId,
        },
      });
    });

    return this.getCaseDebtorDetail(tenantId, caseId, caseDebtorId);
  }
}
