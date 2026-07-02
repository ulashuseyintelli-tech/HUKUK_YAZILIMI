import { Injectable, NotFoundException, ConflictException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { LawyerRole, LawyerRank } from "@prisma/client";
import { normalizePersonName } from "@/common/name-match.util";
import { AuditService } from "../audit/audit.service";

// K1-4b: Office Approval delegation flag'ini (canApproveOfficeActions) değiştirme yetkisi olan aktör.
// H2: aynı actor, yetki/rütbe alanlarını (lawyerRank/defaultPermissions/permissionsLocked/
// canModifyOtherPermissions) değiştirme yetkisi için de kullanılır.
//  - userId: truthful @CurrentUser("id").  role: @CurrentUser("role") (ADMIN kısa-yolu).
//  - Yalnız ADMIN VEYA linkli PARTNER avukat bu alanları değiştirebilir (assertActorIsAdminOrLinkedPartner).
export interface LawyerUpdateActor {
  userId?: string;
  role?: string;
}

// Rol'e göre varsayılan unvan/sıfat
const DEFAULT_TITLES: Record<string, string> = {
  OWNER: "Av.",        // Büro sahibi avukat
  PARTNER: "Av.",      // Ortak avukat
  EMPLOYEE: "Av.",     // Çalışan avukat
  INTERN: "Stj. Av.",  // Stajyer avukat
};

// Avukat için görüntüleme adı oluştur (Unvan Ad Soyad)
// Dilekçeler, evraklar ve listelerde kullanılır
// Örnek: "Av. Ulaş Hüseyin Telli", "Stj. Av. Mehmet Yılmaz"
export function getLawyerDisplayName(lawyer: { 
  name: string; 
  surname: string; 
  title?: string | null;
  role?: LawyerRole | string;
}): string {
  const fullName = `${lawyer.name} ${lawyer.surname}`.trim();
  
  // Önce özel title varsa onu kullan, yoksa role'e göre varsayılan
  const title = lawyer.title || DEFAULT_TITLES[lawyer.role as string] || "Av.";
  
  return `${title} ${fullName}`;
}

// Mevcut unvan seçenekleri (UI'da dropdown için)
export const TITLE_OPTIONS = [
  { value: "Av.", label: "Av. (Avukat)" },
  { value: "Stj. Av.", label: "Stj. Av. (Stajyer Avukat)" },
  { value: "Huk. Müş.", label: "Huk. Müş. (Hukuk Müşaviri)" },
  { value: "İcra Kat.", label: "İcra Kat. (İcra Katibi)" },
  { value: "Sek.", label: "Sek. (Sekreter)" },
  { value: "Muh.", label: "Muh. (Muhasebeci)" },
  { value: "Arş.", label: "Arş. (Arşiv Sorumlusu)" },
  { value: "", label: "(Unvansız)" },
];

// Avukat nesnesine displayName ekle
export function withDisplayName<T extends { name: string; surname: string; title?: string | null; role?: LawyerRole | string }>(lawyer: T): T & { displayName: string } {
  return {
    ...lawyer,
    displayName: getLawyerDisplayName(lawyer),
  };
}

// Avukat listesine displayName ekle
export function withDisplayNames<T extends { name: string; surname: string; title?: string | null; role?: LawyerRole | string }>(lawyers: T[]): (T & { displayName: string })[] {
  return lawyers.map(withDisplayName);
}

@Injectable()
export class LawyerService {
  // K1-4b: AuditService @Global (AuditModule) — ek import gerekmez; office-approval delegation değişimini loglar.
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // Tüm avukatları getir (displayName ile birlikte)
  async findAll(tenantId: string, search?: string, includeInactive = false) {
    const where: any = { tenantId };

    if (!includeInactive) {
      where.isActive = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { surname: { contains: search, mode: "insensitive" } },
        { barNumber: { contains: search, mode: "insensitive" } },
        { tckn: { contains: search, mode: "insensitive" } },
      ];
    }

    const lawyers = await this.prisma.lawyer.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    // Her avukata displayName ekle (Av. Ad Soyad)
    return withDisplayNames(lawyers);
  }

  // Varsayılan avukatları getir (yeni takiplerde otomatik seçilecekler)
  async findDefaults(tenantId: string) {
    const lawyers = await this.prisma.lawyer.findMany({
      where: {
        tenantId,
        isActive: true,
        isDefaultForNewCases: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    return withDisplayNames(lawyers);
  }

  // Tek avukat getir
  async findOne(tenantId: string, id: string) {
    const lawyer = await this.prisma.lawyer.findFirst({
      where: { id, tenantId },
    });

    if (!lawyer) {
      throw new NotFoundException("Avukat bulunamadı");
    }

    return withDisplayName(lawyer);
  }

  // Avukat oluştur
  async create(
    tenantId: string,
    data: {
      name: string;
      surname: string;
      tckn?: string;
      gender?: string;
      barNumber?: string;
      barCity?: string;
      tbbNo?: string;
      vergiDairesi?: string;
      vergiNo?: string;
      email?: string;
      phone?: string;
      mobilePhone?: string;
      whatsappPhone?: string;
      fax?: string;
      address?: string;
      city?: string;
      district?: string;
      bankName?: string;
      branchName?: string;
      iban?: string;
      isInHouseCounsel?: boolean;
      isEmployee?: boolean;
      role?: LawyerRole;
      title?: string; // Unvan/Sıfat (Av., Stj. Av., Huk. Müş., vb.)
      canSign?: boolean;
      canAppearInUyap?: boolean;
      canBeResponsible?: boolean;
      isDefaultForNewCases?: boolean;
      // Yeni alanlar
      lawyerRank?: LawyerRank;
      defaultPermissions?: any;
      permissionsLocked?: boolean;
      canModifyOtherPermissions?: boolean;
    }
  ) {
    // PR-AUDIT: duplicate guard — aynı baro no/TCKN VEYA aynı ad-soyad → yeni AÇMA, mevcut döndür.
    // (Eskiden guard yoktu → "Ulaş Hüseyin Telli" gibi mükerrer avukat açılıyordu → yetki/atama karışıklığı.)
    const wantName = normalizePersonName(data.name, data.surname);
    const allLawyers = await this.prisma.lawyer.findMany({ where: { tenantId } });
    const dup = allLawyers.find(
      (l) =>
        (data.barNumber && l.barNumber === data.barNumber) ||
        (data.tckn && l.tckn === data.tckn) ||
        (!!wantName && normalizePersonName(l.name, l.surname) === wantName),
    );
    if (dup) {
      const wasReactivated = (dup as any).isActive === false;
      if (wasReactivated) {
        await this.prisma.lawyer.update({ where: { id: dup.id }, data: { isActive: true } });
      }
      return { ...(dup as any), isActive: true, _existingReturned: true, _reactivated: wasReactivated };
    }

    // Office'i al veya oluştur
    let office = await this.prisma.office.findUnique({
      where: { tenantId },
    });

    if (!office) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });
      office = await this.prisma.office.create({
        data: {
          tenantId,
          name: tenant?.name || "Hukuk Bürosu",
        },
      });
    }

    // Sıralama için mevcut en yüksek sortOrder'ı bul
    const maxSort = await this.prisma.lawyer.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });

    const lawyer = await this.prisma.lawyer.create({
      data: {
        tenantId,
        officeId: office.id,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
        ...data,
      },
    });

    return withDisplayName(lawyer);
  }

  // Avukat güncelle
  async update(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      surname?: string;
      tckn?: string;
      gender?: string;
      barNumber?: string;
      barCity?: string;
      tbbNo?: string;
      vergiDairesi?: string;
      vergiNo?: string;
      email?: string;
      phone?: string;
      mobilePhone?: string;
      whatsappPhone?: string;
      fax?: string;
      address?: string;
      city?: string;
      district?: string;
      bankName?: string;
      branchName?: string;
      iban?: string;
      isInHouseCounsel?: boolean;
      isEmployee?: boolean;
      role?: LawyerRole;
      title?: string; // Unvan/Sıfat (Av., Stj. Av., Huk. Müş., vb.)
      canSign?: boolean;
      canAppearInUyap?: boolean;
      canBeResponsible?: boolean;
      isDefaultForNewCases?: boolean;
      sortOrder?: number;
      isActive?: boolean;
      // Yeni alanlar — H2: yalnız ADMIN/PARTNER yazabilir (assertCanManagePrivilegedFields).
      lawyerRank?: LawyerRank;
      defaultPermissions?: any;
      permissionsLocked?: boolean;
      canModifyOtherPermissions?: boolean;
      // PR-U1: isim benzerliği review'ını bilinçli geç ("Benzerliğe rağmen güncelle").
      confirmSimilarNameUpdate?: boolean;
      // K1-4b: Office Approval delegation flag. YALNIZ ADMIN/PARTNER yazabilir (assertCanManageOfficeApprovalDelegation);
      // değer DEĞİŞİRSE AuditLog yazılır. Approver eligibility runtime'da ayrıca kontrol edilir (aktif+linkli+same-tenant).
      canApproveOfficeActions?: boolean;
    },
    actor?: LawyerUpdateActor,
  ) {
    // Avukatın bu tenant'a ait olduğunu kontrol et
    const existing = await this.findOne(tenantId, id);

    // PR-U1: UPDATE-PATH DUPLICATE GUARD. create guard'ı vardı ama edit yan kapısı açıktı
    // (örn. "Ulaş Telli" açıp sonra "Hüseyin" ekleyerek mükerrer üretmek). Self (id) HARİÇ,
    // yalnız AKTİF diğer kayıtlara bakılır. confirmSimilarNameUpdate yalnız İSİM review'ını geçer
    // (kimlik collision'ı GEÇMEZ). Yalnız ilgili alan GERÇEKTEN değişince tetiklenir.
    const mergedTckn = data.tckn ?? existing.tckn;
    const mergedBar = data.barNumber ?? existing.barNumber;
    const tcknChanged = data.tckn !== undefined && data.tckn !== existing.tckn;
    const barChanged = data.barNumber !== undefined && data.barNumber !== existing.barNumber;

    if (tcknChanged || barChanged) {
      const others = await this.prisma.lawyer.findMany({
        where: { tenantId, isActive: true, id: { not: id } },
      });
      const idDup = others.find(
        (l) => (mergedTckn && l.tckn === mergedTckn) || (mergedBar && l.barNumber === mergedBar),
      );
      if (idDup) {
        throw new ConflictException({
          code: "DUPLICATE_IDENTITY",
          message: "Bu kimlik/baro numarasına sahip başka bir avukat mevcut",
          existingLawyer: { id: idDup.id, name: `${idDup.name} ${idDup.surname}`.replace(/\s+/g, " ").trim() },
        });
      }
    }

    const wantName = normalizePersonName(data.name ?? existing.name, data.surname ?? existing.surname);
    const nameChanged = wantName !== normalizePersonName(existing.name, existing.surname);
    if (nameChanged && !data.confirmSimilarNameUpdate && wantName) {
      const others = await this.prisma.lawyer.findMany({
        where: { tenantId, isActive: true, id: { not: id } },
      });
      const candidates = others
        .filter((l) => normalizePersonName(l.name, l.surname) === wantName)
        .map((l) => ({ id: l.id, name: `${l.name} ${l.surname}`.replace(/\s+/g, " ").trim() }));
      if (candidates.length > 0) {
        throw new ConflictException({
          code: "SIMILAR_NAME_REVIEW",
          message: "Benzer isimli avukat mevcut. Benzerliğe rağmen bu kaydı güncelleyebilir veya vazgeçebilirsiniz.",
          candidates,
        });
      }
    }

    // confirmSimilarNameUpdate transient → prisma'ya YAZILMAZ.
    // K1-4b: canApproveOfficeActions'ı generic write'tan AYIR; yalnız DEĞİŞİYORSA yetki kontrolü + audit ile yaz.
    // H2: yetki/rütbe alanlarını (lawyerRank/defaultPermissions/permissionsLocked/canModifyOtherPermissions) da
    // AYNI ADMIN/PARTNER kapısına al — önceden bu alanlar generic write'a düz geçip herhangi bir JWT sahibi
    // tarafından değiştirilebiliyordu (yetki yükseltme).
    const {
      confirmSimilarNameUpdate,
      canApproveOfficeActions,
      lawyerRank,
      defaultPermissions,
      permissionsLocked,
      canModifyOtherPermissions,
      ...writeData
    } = data;

    // H2 GUARD: rütbe/yetki alanlarından biri payload'da VARSA, generic write'a girmeden ADMIN/PARTNER doğrula.
    const wantsPrivilegedFieldChange =
      lawyerRank !== undefined ||
      defaultPermissions !== undefined ||
      permissionsLocked !== undefined ||
      canModifyOtherPermissions !== undefined;

    if (wantsPrivilegedFieldChange) {
      await this.assertCanManagePrivilegedFields(actor, tenantId);
      if (lawyerRank !== undefined) (writeData as { lawyerRank?: LawyerRank }).lawyerRank = lawyerRank;
      if (defaultPermissions !== undefined) (writeData as { defaultPermissions?: unknown }).defaultPermissions = defaultPermissions;
      if (permissionsLocked !== undefined) (writeData as { permissionsLocked?: boolean }).permissionsLocked = permissionsLocked;
      if (canModifyOtherPermissions !== undefined) {
        (writeData as { canModifyOtherPermissions?: boolean }).canModifyOtherPermissions = canModifyOtherPermissions;
      }
    }

    let delegationChange: { from: boolean; to: boolean } | null = null;
    if (
      canApproveOfficeActions !== undefined &&
      canApproveOfficeActions !== (existing as { canApproveOfficeActions?: boolean }).canApproveOfficeActions
    ) {
      // K1-4b GUARD: office-approval delegation'ı yalnız ADMIN veya linkli PARTNER avukat değiştirebilir.
      await this.assertCanManageOfficeApprovalDelegation(actor, tenantId);
      (writeData as { canApproveOfficeActions?: boolean }).canApproveOfficeActions = canApproveOfficeActions;
      delegationChange = {
        from: !!(existing as { canApproveOfficeActions?: boolean }).canApproveOfficeActions,
        to: canApproveOfficeActions,
      };
    }

    const lawyer = await this.prisma.lawyer.update({
      where: { id },
      data: writeData,
    });

    // K1-4b: delegation GERÇEKTEN değiştiyse olgusal AuditLog (entityType LAWYER; ham PII yok, yalnız from/to bool).
    if (delegationChange) {
      await this.audit.log({
        tenantId,
        action: "LAWYER_OFFICE_APPROVAL_DELEGATION_CHANGED",
        entityType: "LAWYER",
        entityId: id,
        userId: actor?.userId, // truthful actor
        metadata: { lawyerId: id, canApproveOfficeActions: delegationChange },
      });
    }

    return withDisplayName(lawyer);
  }

  /**
   * ADMIN VEYA aktif + same-tenant + linkli PARTNER avukat mı? K1-4b (canApproveOfficeActions) ve
   * H2 (lawyerRank/defaultPermissions/permissionsLocked/canModifyOtherPermissions) yetki-alanı
   * guard'larının PAYLAŞTIĞI tek otorite kuralı; hata mesajları çağıran tarafından verilir.
   */
  private async assertActorIsAdminOrLinkedPartner(
    actor: LawyerUpdateActor | undefined,
    tenantId: string,
    messages: { noActor: string; unauthorized: string },
  ): Promise<void> {
    if (!actor?.userId) {
      throw new ForbiddenException(messages.noActor);
    }
    if (actor.role === "ADMIN") return; // ADMIN kısa-yolu (lawyer zaten tenant-scoped findOne ile alındı)
    const actorUser = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { tenantId: true, isActive: true, lawyer: { select: { lawyerRank: true } } },
    });
    if (
      actorUser &&
      actorUser.isActive &&
      actorUser.tenantId === tenantId &&
      actorUser.lawyer?.lawyerRank === "PARTNER"
    ) {
      return;
    }
    throw new ForbiddenException(messages.unauthorized);
  }

  /**
   * K1-4b — Office Approval delegation (canApproveOfficeActions) DEĞİŞTİRME yetkisi.
   * YALNIZ: ADMIN (User.role) VEYA aktif + same-tenant + linkli PARTNER avukat. Diğer herkes (staff/non-PARTNER/linksiz) → 403.
   * NOT: bu YALNIZ flag'i değiştirme yetkisidir; bir avukatın approver GEÇERLİLİĞİ runtime'da
   *      OfficeApprovalService.assertApproverEligible (aktif+linkli+same-tenant+[PARTNER∨canApprove]) ile ayrıca denetlenir.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - LawyerService.update() → canApproveOfficeActions DEĞİŞTİĞİNDE (PUT/PATCH /lawyers/:id; actor=@CurrentUser).
   * /// </remarks>
   */
  private async assertCanManageOfficeApprovalDelegation(
    actor: LawyerUpdateActor | undefined,
    tenantId: string,
  ): Promise<void> {
    return this.assertActorIsAdminOrLinkedPartner(actor, tenantId, {
      noActor: "Office approval delegation değiştirme yetkisi yok (kimlik çözülemedi).",
      unauthorized: "Office approval delegation yalnız PARTNER veya ADMIN tarafından değiştirilebilir.",
    });
  }

  /**
   * H2 — Yetki/rütbe alanları (lawyerRank, defaultPermissions, permissionsLocked,
   * canModifyOtherPermissions) DEĞİŞTİRME yetkisi. YALNIZ: ADMIN (User.role) VEYA aktif +
   * same-tenant + linkli PARTNER avukat — canApproveOfficeActions ile AYNI otorite kuralı
   * (assertActorIsAdminOrLinkedPartner ile paylaşılır).
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - LawyerService.update() → lawyerRank/defaultPermissions/permissionsLocked/
   * ///    canModifyOtherPermissions alanlarından biri payload'da VARSA (PUT/PATCH /lawyers/:id;
   * ///    actor=@CurrentUser). Önceden bu alanlar guard'sız generic write'a geçiyordu (H2).
   * /// </remarks>
   */
  private async assertCanManagePrivilegedFields(
    actor: LawyerUpdateActor | undefined,
    tenantId: string,
  ): Promise<void> {
    return this.assertActorIsAdminOrLinkedPartner(actor, tenantId, {
      noActor: "Yetki/rütbe alanlarını değiştirme yetkisi yok (kimlik çözülemedi).",
      unauthorized: "Yetki/rütbe alanları yalnız PARTNER veya ADMIN tarafından değiştirilebilir.",
    });
  }

  // Avukat sil (kalıcı silme)
  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);

    // Önce CaseLawyer ilişkilerini sil
    await this.prisma.caseLawyer.deleteMany({
      where: { lawyerId: id },
    });

    // Sonra avukatı kalıcı olarak sil
    return this.prisma.lawyer.delete({
      where: { id },
    });
  }

  // Avukat sıralamasını güncelle
  async updateOrder(tenantId: string, lawyerIds: string[]) {
    const updates = lawyerIds.map((id, index) =>
      this.prisma.lawyer.updateMany({
        where: { id, tenantId },
        data: { sortOrder: index },
      })
    );

    await this.prisma.$transaction(updates);

    return this.findAll(tenantId);
  }

  // Varsayılan avukatları ayarla
  async setDefaults(tenantId: string, lawyerIds: string[]) {
    // Önce tüm varsayılanları kaldır
    await this.prisma.lawyer.updateMany({
      where: { tenantId },
      data: { isDefaultForNewCases: false },
    });

    // Seçilenleri varsayılan yap
    if (lawyerIds.length > 0) {
      await this.prisma.lawyer.updateMany({
        where: { id: { in: lawyerIds }, tenantId },
        data: { isDefaultForNewCases: true },
      });
    }

    return this.findAll(tenantId);
  }
}
