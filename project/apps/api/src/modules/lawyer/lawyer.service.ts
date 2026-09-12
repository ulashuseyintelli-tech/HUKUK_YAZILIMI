import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { LawyerRole, LawyerRank, Prisma } from "@prisma/client";
import { normalizePersonName } from "@/common/name-match.util";
import { maskTckn, maskIban } from "@/common/pii-mask.util";
import { AuditService } from "../audit/audit.service";
import { OfficeApprovalService } from "../office-approval/office-approval.service";
import type { AuditActor } from "@/modules/client/client.service";
import { toPublicLawyer, toPublicLawyers } from "./lawyer-public-projection";
import { projectF01Lawyer, F01ProjectionAccess } from "../office/office-f01-projection";
import { UpdateLawyerDto, validateLawyerUpdateInput } from "./dto/update-lawyer.dto";
import { LAWYER_CREATE_PERSIST_FIELDS } from "./dto/create-lawyer.dto";
import { partyDb, runPartyWrite, type PartyWriteTxContext } from "@/common/party-write-tx";

// K1-4b: Office Approval delegation flag'ini (canApproveOfficeActions) değiştirme yetkisi olan aktör.
// H2: aynı actor, yetki/rütbe alanlarını (lawyerRank/defaultPermissions/permissionsLocked/
// canModifyOtherPermissions) değiştirme yetkisi için de kullanılır.
//  - userId: truthful @CurrentUser("id").  role: @CurrentUser("role") (ADMIN kısa-yolu).
//  - Yalnız ADMIN VEYA linkli PARTNER avukat bu alanları değiştirebilir (assertActorIsAdminOrLinkedPartner).
// AK-2: create'te ayrıcalıklı DEĞER atama (PARTNER/MANAGER rütbesi, canModifyOtherPermissions=true,
// permissionsLocked=true) da aynı kurala bağlıdır.
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
  // L1A: OfficeApprovalService deactivate capability-gate için (ClientService.assertCanManageLifecycle ile birebir desen).
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
  ) {}

  /** F01 response boundary for Lawyer mutation and secondary consumers. */
  private async projectLawyerResponse(
    tenantId: string,
    row: Record<string, unknown>,
    actor?: LawyerUpdateActor,
  ): Promise<Record<string, unknown>> {
    const publicLawyer = toPublicLawyer(row);
    if (!actor?.userId || typeof this.officeApproval?.isF01ActorAuthorized !== "function") {
      return publicLawyer as Record<string, unknown>;
    }

    const targetOfficeId = typeof publicLawyer.officeId === "string" ? publicLawyer.officeId : undefined;
    const authorized = await this.officeApproval.isF01ActorAuthorized(
      actor.userId,
      tenantId,
      targetOfficeId,
    );
    const access: F01ProjectionAccess = authorized ? "AUTHORIZED_S0_S1" : "PUBLIC_S0_ONLY";
    return projectF01Lawyer(publicLawyer as Record<string, unknown>, access) as Record<string, unknown>;
  }

  /**
   * CANDIDATE-F1 (WAVE 3, RATIFIED — Personnel List Masked Default): avukat LİSTE yüzeyinde
   * hassas alanları (tckn, iban, deprecated identityNo) varsayılan maskele. Null/undefined/boş
   * KORUNUR (sentinel üretilmez). Yalnız liste projeksiyonu; detail (findOne), create/update,
   * duplicate-guard sorguları, search WHERE ve response shape/displayName DEĞİŞMEZ.
   */
  private maskListRow<
    T extends { tckn: string | null; iban: string | null; identityNo: string | null },
  >(row: T): T {
    const m = (v: string | null, fn: (s: string) => string) =>
      v == null || v === "" ? v : fn(v);
    return {
      ...row,
      tckn: m(row.tckn, maskTckn),
      iban: m(row.iban, maskIban),
      identityNo: m(row.identityNo, maskTckn),
    };
  }

  // Tüm avukatları getir (displayName ile birlikte)
  async findAll(
    tenantId: string,
    search?: string,
    includeInactive = false,
    actor?: { userId?: string; role?: string },
  ): Promise<any[]> {
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
    // P01: credential alanlari (uyapToken/eSignatureSerial) public yanittan CIKARILIR.
    const projected = toPublicLawyers(withDisplayNames(lawyers.map((l) => this.maskListRow(l))));
    if (!actor?.userId) return projected;

    const authorized = await this.officeApproval.isF01ActorAuthorized(actor.userId, tenantId);
    const access: F01ProjectionAccess = authorized ? 'AUTHORIZED_S0_S1' : 'PUBLIC_S0_ONLY';
    return projected.map((row) => projectF01Lawyer(row as Record<string, unknown>, access));
  }

  // Varsayılan avukatları getir (yeni takiplerde otomatik seçilecekler)
  async findDefaults(
    tenantId: string,
    actor?: { userId?: string; role?: string },
  ): Promise<any[]> {
    const lawyers = await this.prisma.lawyer.findMany({
      where: {
        tenantId,
        isActive: true,
        isDefaultForNewCases: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    // P01: credential alanlari (uyapToken/eSignatureSerial) public yanittan CIKARILIR.
    const projected = toPublicLawyers(withDisplayNames(lawyers.map((l) => this.maskListRow(l))));
    if (!actor?.userId) return projected;

    const authorized = await this.officeApproval.isF01ActorAuthorized(actor.userId, tenantId);
    const access: F01ProjectionAccess = authorized ? 'AUTHORIZED_S0_S1' : 'PUBLIC_S0_ONLY';
    return projected.map((row) => projectF01Lawyer(row as Record<string, unknown>, access));
  }

  // Tek avukat getir
  async findOne(
    tenantId: string,
    id: string,
    actor?: { userId?: string; role?: string },
  ): Promise<any> {
    const lawyer = await this.prisma.lawyer.findFirst({
      where: { id, tenantId },
    });

    if (!lawyer) {
      throw new NotFoundException("Avukat bulunamadı");
    }

    // F01: HTTP detail okumaları actor-bound projection'dan geçer. Actor
    // verilmemiş legacy/internal çağrılar credential containment ile sınırlı
    // kalır; yeni alanlar sessizce genişletilmez.
    const publicLawyer = toPublicLawyer(withDisplayName(lawyer));
    if (!actor?.userId) return publicLawyer;

    const authorized = await this.officeApproval.isF01ActorAuthorized(
      actor.userId,
      tenantId,
      lawyer.officeId ?? undefined,
    );
    const access: F01ProjectionAccess = authorized ? 'AUTHORIZED_S0_S1' : 'PUBLIC_S0_ONLY';
    return projectF01Lawyer(publicLawyer as Record<string, unknown>, access);
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
    },
    actor?: LawyerUpdateActor,
    // AK-2: YALNIZ audit atfı (dosya içi / seed oluşturmada isteği yapan kullanıcı). Yetki (H2) ve
    // yanıt projeksiyonu bundan ETKİLENMEZ — ikisi de yalnız `actor` ile yapılır.
    attribution?: { userId?: string },
    // DAR ATOMİKLİK (owner GO 2026-09-12): POST /cases satır içi avukatı, dosya yazmalarıyla AYNI
    // transaction'a katılır. VERİLMEZSE davranış BİREBİR eskisi gibidir (kendi $transaction'ı).
    txCtx?: PartyWriteTxContext,
  ) {
    // Yazma yolundaki İLGİLİ OKUMALAR da ortak transaction'dan yapılır: aksi hâlde dış transaction'ın
    // henüz commit edilmemiş satırı görülmez ve transaction sürerken havuzdan ikinci bağlantı istenir.
    const db = partyDb(this.prisma, txCtx);

    // AK-2 (owner GO 2026-09-10): ayrıcalıklı DEĞERLE oluşturma, update'in H2 otorite kuralına
    // bağlıdır (ADMIN veya aktif + aynı tenant + bağlı PARTNER). Kontrol HER yazmadan ÖNCE yapılır:
    // mükerrer etkinleştirme ve ofis oluşturma da yazmadır; ret hâlinde hiçbiri gerçekleşmez ve
    // ayrıcalıklı değer SESSİZCE düşürülmez. Ortak transaction'da da AYNEN korunur (owner GO
    // 2026-09-12: "yazma anındaki yetki ve ayrıcalıklı yeniden etkinleştirme denetimleri korunacak").
    if (this.isPrivilegedLawyerCreate(data)) {
      await this.assertCanAssignPrivilegedFieldsOnCreate(actor, tenantId, db);
    }

    // PR-AUDIT: duplicate guard — aynı baro no/TCKN VEYA aynı ad-soyad → yeni AÇMA, mevcut döndür.
    // (Eskiden guard yoktu → "Ulaş Hüseyin Telli" gibi mükerrer avukat açılıyordu → yetki/atama karışıklığı.)
    const dup = await this.findDuplicateLawyer(tenantId, data, db);
    if (dup) {
      const wasInactive = (dup as any).isActive === false;
      let reactivated = false;
      if (wasInactive) {
        // AK-2 (owner GO 2026-09-10, mükerrer yeniden etkinleştirme): istek değerlerinden BAĞIMSIZ olarak
        // yeniden etkinleşecek kaydın MEVCUT ayrıcalığı değerlendirilir. Ayrıcalıklı kaydı yalnız H2
        // otoritesi (ADMIN veya aktif + aynı tenant + bağlı PARTNER) yeniden etkinleştirir; kontrol HER
        // yazmadan ÖNCE yapılır — yetkisiz istekte hiçbir yazma olmaz. Atıf yetki SAYILMAZ.
        const privileged = this.isPrivilegedLawyerRecord(dup);
        if (privileged) {
          await this.assertCanReactivatePrivilegedLawyer(actor, tenantId, db);
        }
        // CLIENT R1A deseni: `dup` transaction DIŞINDA okundu → yazma, yetki kararının verildiği DURUMA
        // (tenant + isActive:false + değerlendirilen ayrıcalık değerleri) koşullu. Kayıt bu arada
        // değiştiyse count 0 olur: ne bayrak çevrilir ne audit yazılır. logInTransaction hata YUTMAZ →
        // audit yazılamazsa yeniden etkinleştirme de geri alınır.
        // DAR ATOMİKLİK: ortak transaction verildiyse İKİNCİ bir $transaction AÇILMAZ (Prisma iç içe
        // interactive transaction desteklemez) → yeniden etkinleştirme dosya oluşturma düşerse GERİ ALINIR.
        reactivated = await runPartyWrite(this.prisma, txCtx, async (tx) => {
          const { count } = await tx.lawyer.updateMany({
            where: {
              id: dup.id,
              tenantId,
              isActive: false,
              lawyerRank: dup.lawyerRank,
              canModifyOtherPermissions: dup.canModifyOtherPermissions,
              permissionsLocked: dup.permissionsLocked,
              canApproveOfficeActions: dup.canApproveOfficeActions,
            },
            data: { isActive: true },
          });
          if (count === 0) return false;
          const auditUserId = actor?.userId || attribution?.userId || undefined;
          await this.audit.logInTransaction(tx, {
            tenantId,
            action: "LAWYER_REACTIVATE",
            entityType: "LAWYER",
            entityId: dup.id,
            userId: auditUserId,
            actorType: auditUserId ? "USER" : "SYSTEM",
            // Yalnız yeniden etkinleşen kaydın yetki-ilgili değerleri; kimlik, ad ve iletişim verisi GİRMEZ.
            metadata: {
              reactivatedFromDuplicate: true,
              privileged,
              lawyerRank: dup.lawyerRank,
              canModifyOtherPermissions: dup.canModifyOtherPermissions,
              permissionsLocked: dup.permissionsLocked,
              canApproveOfficeActions: dup.canApproveOfficeActions,
            },
          });
          return true;
        });
      }
      // Eşzamanlı değişimde (count 0) yanıt kaydın GERÇEK durumunu gösterir; aksi hâlde kayıt aktiftir.
      const current =
        wasInactive && !reactivated
          ? ((await db.lawyer.findFirst({ where: { id: dup.id, tenantId } })) ?? dup)
          : { ...(dup as any), isActive: true };
      // P01: duplicate/reactivate dali da ayni response boundary'den gecer.
      return this.projectLawyerResponse(
        tenantId,
        { ...(current as any), _existingReturned: true, _reactivated: reactivated },
        actor,
      );
    }

    // Sıralama için mevcut en yüksek sortOrder'ı bul
    const maxSort = await db.lawyer.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });

    // OFFICE-FB0105: gövde ARTIK spread EDİLMEZ. Eskiden `...data` en sonda spread ediliyordu;
    // bu hem credential alanlarının (uyapToken/eSignatureSerial/uyapUsername) yazılmasına, hem de
    // güvenilen `tenantId`/`officeId`/`sortOrder` değerlerinin gövdeden EZİLMESİNE izin veriyordu.
    // Allow-list `update` yolundaki `writeData` deseniyle aynıdır ve HTTP dışı çağıranları da
    // (seed.service `as any`, case.service) kapsar.
    const createData: Record<string, unknown> = {};
    for (const field of LAWYER_CREATE_PERSIST_FIELDS) {
      const value = (data as Record<string, unknown>)[field];
      if (value !== undefined) createData[field] = value;
    }

    // AK-2: avukat satırı ve LAWYER_CREATE audit'i AYNI transaction'da yazılır. logInTransaction
    // hata YUTMAZ → audit yazılamazsa transaction geri alınır, avukat kaydı kalıcılaşmaz.
    // AK-2 ARDIL ("ofis oto-oluşturmanın transaction dışında kalması"): ofis kaydı da ARTIK bu
    // transaction içinde alınır/oluşturulur. Eskiden tx DIŞINDA yaratılıyordu; avukat create'i ya da
    // audit yazması düşünce avukat geri alınıyor, yeni açılmış ofis satırı KALICI oluyordu (hiçbir
    // avukatı olmayan artık ofis kaydı). Artık tx geri alınırsa ofis de geri alınır.
    // DAR ATOMİKLİK (owner GO 2026-09-12): ortak transaction verildiyse ofis + avukat + audit
    // satırları DOSYA yazmalarıyla aynı transaction'a katılır; dosya düşerse üçü de geri alınır.
    const lawyer = await runPartyWrite(this.prisma, txCtx, async (tx) => {
      // Office'i al veya oluştur (tx içinde)
      let office = await tx.office.findUnique({
        where: { tenantId },
      });

      if (!office) {
        const tenant = await tx.tenant.findUnique({
          where: { id: tenantId },
        });
        office = await tx.office.create({
          data: {
            tenantId,
            name: tenant?.name || "Hukuk Bürosu",
          },
        });
      }

      const created = await tx.lawyer.create({
        data: {
          ...createData,
          // Sunucu denetimindeki alanlar SONDA: gövde bunları ezemez.
          tenantId,
          officeId: office.id,
          sortOrder: (maxSort._max.sortOrder || 0) + 1,
        } as Prisma.LawyerUncheckedCreateInput,
      });
      const auditUserId = actor?.userId || attribution?.userId || undefined;
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: "LAWYER_CREATE",
        entityType: "LAWYER",
        entityId: created.id,
        userId: auditUserId,
        actorType: auditUserId ? "USER" : "SYSTEM",
        // Yalnız yetki-ilgili alanların KALICI değerleri. Kimlik, iletişim, banka verisi ve
        // gövdenin tamamı audit'e GİRMEZ.
        metadata: {
          lawyerRank: created.lawyerRank,
          canModifyOtherPermissions: created.canModifyOtherPermissions,
          permissionsLocked: created.permissionsLocked,
        },
      });
      return created;
    });

    // P01: credential alanlari public yanittan CIKARILIR.
    return this.projectLawyerResponse(tenantId, withDisplayName(lawyer) as Record<string, unknown>, actor);
  }

  /** Avukat güncelle. Çağıranlar: LawyerController.update (PUT), LawyerController.patch (PATCH). */
  async update(
    tenantId: string,
    id: string,
    data: UpdateLawyerDto,
    actor?: LawyerUpdateActor,
  ) {
    // Avukatın bu tenant'a ait olduğunu kontrol et
    const existing = await this.findOne(tenantId, id);

    // Direct service consumers obey the same runtime DTO contract as HTTP callers.
    data = await validateLawyerUpdateInput(data, UpdateLawyerDto);
    if (data.isActive !== undefined) {
      if (data.isActive !== existing.isActive) {
        throw new BadRequestException({ code: "PROFILE_LIFECYCLE_CHANGE_NOT_ALLOWED", message: "Profil güncellemesi aktiflik durumunu değiştiremez; ayrı lifecycle işlemi gerekir." });
      }
    }
    // CANDIDATE-H1 (RATIFIED): edit-safe IBAN update guard. IBAN alanı ya OMIT edilir (mevcut değer
    // korunur — Prisma undefined-skip) ya da geçerli tam değer girilir. Maskeli ('*') / boş / whitespace /
    // null / non-string REDDEDİLİR (400) — maskeli read-model değerinin round-trip'le gerçek IBAN üstüne
    // yazılması önlenir. Kasıtlı silme desteklenmez; DTO bu alanın ret sözleşmesini burada tutar.
    if (data.iban !== undefined) {
      const ibanValue: unknown = data.iban;
      if (typeof ibanValue !== "string" || ibanValue.trim() === "" || ibanValue.includes("*")) {
        throw new BadRequestException({
          code: "INVALID_IBAN_UPDATE",
          message:
            "IBAN güncellemek için geçerli tam değer girin. Boş, boşluk, maskeli veya null değer kabul edilmez; değiştirmek istemiyorsanız alanı göndermeyin.",
        });
      }
    }

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

    // Explicit profile allow-map. Identity/relation fields never reach Prisma.
    // isActive is NEVER written here, even for an unchanged echo: a concurrent
    // DELETE must not be undone by a stale form value. confirmSimilarNameUpdate is transient.
    const writeData: Prisma.LawyerUpdateInput = {};
    if (data.name !== undefined) writeData.name = data.name;
    if (data.surname !== undefined) writeData.surname = data.surname;
    if (data.tckn !== undefined) writeData.tckn = data.tckn;
    if (data.gender !== undefined) writeData.gender = data.gender;
    if (data.barNumber !== undefined) writeData.barNumber = data.barNumber;
    if (data.barCity !== undefined) writeData.barCity = data.barCity;
    if (data.tbbNo !== undefined) writeData.tbbNo = data.tbbNo;
    if (data.vergiDairesi !== undefined) writeData.vergiDairesi = data.vergiDairesi;
    if (data.vergiNo !== undefined) writeData.vergiNo = data.vergiNo;
    if (data.email !== undefined) writeData.email = data.email;
    if (data.phone !== undefined) writeData.phone = data.phone;
    if (data.mobilePhone !== undefined) writeData.mobilePhone = data.mobilePhone;
    if (data.whatsappPhone !== undefined) writeData.whatsappPhone = data.whatsappPhone;
    if (data.fax !== undefined) writeData.fax = data.fax;
    if (data.address !== undefined) writeData.address = data.address;
    if (data.city !== undefined) writeData.city = data.city;
    if (data.district !== undefined) writeData.district = data.district;
    if (data.bankName !== undefined) writeData.bankName = data.bankName;
    if (data.branchName !== undefined) writeData.branchName = data.branchName;
    if (data.iban !== undefined) writeData.iban = data.iban;
    if (data.isInHouseCounsel !== undefined) writeData.isInHouseCounsel = data.isInHouseCounsel;
    if (data.isEmployee !== undefined) writeData.isEmployee = data.isEmployee;
    if (data.role !== undefined) writeData.role = data.role;
    if (data.title !== undefined) writeData.title = data.title;
    if (data.canSign !== undefined) writeData.canSign = data.canSign;
    if (data.canAppearInUyap !== undefined) writeData.canAppearInUyap = data.canAppearInUyap;
    if (data.canBeResponsible !== undefined) writeData.canBeResponsible = data.canBeResponsible;
    if (data.isDefaultForNewCases !== undefined) writeData.isDefaultForNewCases = data.isDefaultForNewCases;
    if (data.sortOrder !== undefined) writeData.sortOrder = data.sortOrder;

    // K1-4b: canApproveOfficeActions'ı generic write'tan AYIR; yalnız DEĞİŞİYORSA yetki kontrolü + audit ile yaz.
    // H2: yetki/rütbe alanlarını (lawyerRank/defaultPermissions/permissionsLocked/canModifyOtherPermissions) da
    // AYNI ADMIN/PARTNER kapısına al — önceden bu alanlar generic write'a düz geçip herhangi bir JWT sahibi
    // tarafından değiştirilebiliyordu (yetki yükseltme).
    const {
      canApproveOfficeActions,
      lawyerRank,
      defaultPermissions,
      permissionsLocked,
      canModifyOtherPermissions,
    } = data;

    // H2 GUARD: rütbe/yetki alanlarından biri payload'da VARSA, generic write'a girmeden ADMIN/PARTNER doğrula.
    const wantsPrivilegedFieldChange =
      lawyerRank !== undefined ||
      defaultPermissions !== undefined ||
      permissionsLocked !== undefined ||
      canModifyOtherPermissions !== undefined;

    if (wantsPrivilegedFieldChange) {
      await this.assertCanManagePrivilegedFields(actor, tenantId);
      if (lawyerRank !== undefined) writeData.lawyerRank = lawyerRank;
      // Preserve the former raw-null write's JSON null (not SQL NULL) semantics.
      if (defaultPermissions !== undefined) writeData.defaultPermissions = defaultPermissions === null ? Prisma.JsonNull : defaultPermissions;
      if (permissionsLocked !== undefined) writeData.permissionsLocked = permissionsLocked;
      if (canModifyOtherPermissions !== undefined) {
        writeData.canModifyOtherPermissions = canModifyOtherPermissions;
      }
    }

    let delegationChange: { from: boolean; to: boolean } | null = null;
    if (
      canApproveOfficeActions !== undefined &&
      canApproveOfficeActions !== (existing as { canApproveOfficeActions?: boolean }).canApproveOfficeActions
    ) {
      // K1-4b GUARD: office-approval delegation'ı yalnız ADMIN veya linkli PARTNER avukat değiştirebilir.
      await this.assertCanManageOfficeApprovalDelegation(actor, tenantId);
      writeData.canApproveOfficeActions = canApproveOfficeActions;
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

    // P01: credential alanlari public yanittan CIKARILIR.
    return this.projectLawyerResponse(tenantId, withDisplayName(lawyer) as Record<string, unknown>, actor);
  }

  /**
   * ADMIN VEYA aktif + same-tenant + linkli PARTNER avukat mı? K1-4b (canApproveOfficeActions) ve
   * H2 (lawyerRank/defaultPermissions/permissionsLocked/canModifyOtherPermissions) yetki-alanı
   * guard'larının PAYLAŞTIĞI tek otorite kuralı; hata mesajları çağıran tarafından verilir.
   * AK-2: create'teki ayrıcalıklı değer kontrolü (assertCanAssignPrivilegedFieldsOnCreate) da bunu kullanır.
   * AK-2: mükerrer daldaki ayrıcalıklı yeniden etkinleştirme kontrolü (assertCanReactivatePrivilegedLawyer) da.
   */
  private async assertActorIsAdminOrLinkedPartner(
    actor: LawyerUpdateActor | undefined,
    tenantId: string,
    messages: { noActor: string; unauthorized: string },
    // DAR ATOMİKLİK: ortak transaction içinde çağrıldığında yetki okuması da AYNI client'tan yapılır
    // (transaction sürerken ikinci bağlantı istenmez). Verilmezse servisin kendi prisma client'ı.
    db: any = this.prisma,
  ): Promise<void> {
    if (!actor?.userId) {
      throw new ForbiddenException(messages.noActor);
    }
    if (actor.role === "ADMIN") return; // ADMIN kısa-yolu (lawyer zaten tenant-scoped findOne ile alındı)
    const actorUser = await db.user.findUnique({
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

  /**
   * AK-2 — avukat OLUŞTURMADA ayrıcalıklı DEĞER var mı? Alan gönderilmezse şema varsayılanı
   * (LAWYER / false / false) yazılır ve ayrıcalıksızdır. UI create'te dört alanı HER ZAMAN
   * gönderdiği için update'teki "alan varsa" kuralı burada KULLANILMAZ — yoksa normal şablonlar
   * (Avukat / Yetkili Avukat / Stajyer) da reddedilirdi.
   * `defaultPermissions` kural DIŞIDIR: sunucuda yetki girdisi değildir (dosya yetkisi
   * CaseLawyer.casePermissions'tan okunur). Eski `role` (LawyerRole) de rütbe DEĞİLDİR.
   * Metin "true" ayrıcalıklı sayılmaz ama kalıcılaşamaz da: HTTP'de DTO 400 verir (örtük dönüşüm
   * yok), HTTP dışı çağıranda Prisma boolean sütuna metni reddeder.
   */
  private isPrivilegedLawyerCreate(data: {
    lawyerRank?: LawyerRank;
    permissionsLocked?: boolean;
    canModifyOtherPermissions?: boolean;
  }): boolean {
    return (
      data.lawyerRank === "PARTNER" ||
      data.lawyerRank === "MANAGER" ||
      data.canModifyOtherPermissions === true ||
      data.permissionsLocked === true
    );
  }

  /**
   * AK-2 — ayrıcalıklı değerle avukat OLUŞTURMA yetkisi. Otorite kuralı update'in H2 kuralıyla
   * AYNIDIR (assertActorIsAdminOrLinkedPartner); yalnız mesaj oluşturma bağlamını söyler.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - LawyerService.create() → isPrivilegedLawyerCreate(data) doğruysa, HER yazmadan ÖNCE
   * ///    (POST /lawyers; actor=@CurrentUser). İç çağıranların `attribution`ı yetki SAYILMAZ.
   * /// </remarks>
   */
  private async assertCanAssignPrivilegedFieldsOnCreate(
    actor: LawyerUpdateActor | undefined,
    tenantId: string,
    db: any = this.prisma,
  ): Promise<void> {
    return this.assertActorIsAdminOrLinkedPartner(actor, tenantId, {
      noActor: "Yetki/rütbe alanlarıyla avukat oluşturma yetkisi yok (kimlik çözülemedi).",
      unauthorized:
        "PARTNER/MANAGER rütbesi, izin değiştirme ve izin kilidi yalnız PARTNER veya ADMIN tarafından atanabilir.",
    }, db);
  }

  /**
   * AK-2 — mükerrer dalda yeniden etkinleşecek KAYDIN mevcut ayrıcalığı var mı? Create gövdesinden farklı
   * olarak `canApproveOfficeActions` da sayılır: create bu bayrağı hiç persist etmez, ama mevcut kayıt onu
   * taşıyabilir (update'te K1-4b ile aynı ADMIN/PARTNER kuralıyla atanır) ve F01 aktörlüğü ile ofis onay
   * yetkisini doğrudan belirler. `defaultPermissions` ve eski `role` (LawyerRole) yetki girdisi değildir.
   */
  private isPrivilegedLawyerRecord(row: {
    lawyerRank?: LawyerRank | null;
    canModifyOtherPermissions?: boolean | null;
    permissionsLocked?: boolean | null;
    canApproveOfficeActions?: boolean | null;
  }): boolean {
    return (
      row.lawyerRank === "PARTNER" ||
      row.lawyerRank === "MANAGER" ||
      row.canModifyOtherPermissions === true ||
      row.permissionsLocked === true ||
      row.canApproveOfficeActions === true
    );
  }

  /**
   * AK-2 — pasif AYRICALIKLI avukatı yeniden etkinleştirme yetkisi. Otorite kuralı update'in H2 kuralıyla
   * AYNIDIR (assertActorIsAdminOrLinkedPartner); yalnız mesaj yeniden etkinleştirme bağlamını söyler.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - LawyerService.create() → mükerrer dal, eşleşen kayıt pasif VE isPrivilegedLawyerRecord ise, HER
   * ///    yazmadan ÖNCE (POST /lawyers, POST /cases dosya içi avukat, seed). Atıf yetki SAYILMAZ.
   * /// </remarks>
   */
  private async assertCanReactivatePrivilegedLawyer(
    actor: LawyerUpdateActor | undefined,
    tenantId: string,
    db: any = this.prisma,
  ): Promise<void> {
    return this.assertActorIsAdminOrLinkedPartner(actor, tenantId, {
      noActor: "Ayrıcalıklı pasif avukatı yeniden etkinleştirme yetkisi yok (kimlik çözülemedi).",
      unauthorized:
        "Eşleşen kayıt ayrıcalıklı (PARTNER/MANAGER, izin değiştirme, izin kilidi veya ofis onayı) pasif bir avukat; yeniden etkinleştirme yalnız PARTNER veya ADMIN tarafından yapılabilir.",
    }, db);
  }

  /**
   * PR-AUDIT mükerrer araması — create ve `assertCreateAuthorized` ön kontrolünün ORTAK kaynağı: aynı baro no /
   * TCKN VEYA aynı normalize ad-soyad. Tenant-kapsamlı; aktif ve pasif kayıtları birlikte tarar.
   */
  private async findDuplicateLawyer(
    tenantId: string,
    data: { name: string; surname: string; barNumber?: string | null; tckn?: string | null },
    db: any = this.prisma,
  ) {
    const wantName = normalizePersonName(data.name, data.surname);
    const allLawyers = await db.lawyer.findMany({ where: { tenantId } });
    return (
      allLawyers.find(
        (l: { name: string; surname: string; barNumber?: string | null; tckn?: string | null }) =>
          (data.barNumber && l.barNumber === data.barNumber) ||
          (data.tckn && l.tckn === data.tckn) ||
          (!!wantName && normalizePersonName(l.name, l.surname) === wantName),
      ) ?? null
    );
  }

  /**
   * AK-1a / AK-2 — create'in YETKİ kararlarını YAZMA YAPMADAN verir: ayrıcalıklı istek değeri (H2) ve mükerrer
   * pasif AYRICALIKLI kayıt (H2). Çok adımlı çağıranlar reddi İLK kalıcı yazmadan önce almak için kullanır;
   * create kendi kontrollerini yine uygular (koşullu yazma dahil).
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - CaseService.resolveInlinePartiesInTx() → POST /cases dosya içi avukat, inline müvekkil yazılmadan ÖNCE.
   * /// </remarks>
   */
  async assertCreateAuthorized(
    tenantId: string,
    data: {
      name: string;
      surname: string;
      barNumber?: string;
      tckn?: string;
      lawyerRank?: LawyerRank;
      permissionsLocked?: boolean;
      canModifyOtherPermissions?: boolean;
    },
    actor?: LawyerUpdateActor,
    // DAR ATOMİKLİK: ön kontrol ortak transaction içinde çağrıldığında yetki okumaları da AYNI
    // client'tan yapılır (AK-1a/AK-2 kararı ile create AYNI snapshot üzerinde konuşur).
    txCtx?: PartyWriteTxContext,
  ): Promise<void> {
    const db = partyDb(this.prisma, txCtx);
    if (this.isPrivilegedLawyerCreate(data)) {
      await this.assertCanAssignPrivilegedFieldsOnCreate(actor, tenantId, db);
    }
    const dup = await this.findDuplicateLawyer(tenantId, data, db);
    if (dup && dup.isActive === false && this.isPrivilegedLawyerRecord(dup)) {
      await this.assertCanReactivatePrivilegedLawyer(actor, tenantId, db);
    }
  }

  /**
   * L1A (owner-locked 2026-07-02) — Lawyer artık kalıcı kimlik: fiziksel silme YOK.
   * ClientService.remove() / DebtorService.assertCanManageDebtorLifecycle ile BİREBİR desen
   * (reuse, yeni altyapı YOK): PARTNER veya canApproveOfficeActions=true delege avukat.
   * CaseLawyer/PowerOfAttorney/Case.responsibleLawyer ilişkilerine DOKUNULMAZ — bu da
   * önceden var olan (geçmişli avukatlarda hard-delete'i FK hatasıyla çökerten) latent
   * hatayı yan etki olarak kapatır.
   */
  private async assertCanManageLawyerLifecycle(userId: string | undefined, tenantId: string): Promise<void> {
    if (!userId || !(await this.officeApproval.isApproverEligible(userId, tenantId))) {
      throw new ForbiddenException(
        "Avukat kaydını pasifleştirme yetkiniz yok (PARTNER veya yetkilendirilmiş avukat gerekir)"
      );
    }
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - LawyerController.delete() → DELETE /lawyers/:id (userId req.user.id'den; body.replacementLawyerId
  ///   opsiyonel — Task L1A + H1 sorumluluk devri)
  ///
  /// Task L1A: bu artık fiziksel silme DEĞİL, isActive=false pasifleştirmedir. Zaten pasif olan
  /// bir kayıt için idempotent şekilde tekrar uygulanır (ClientService.remove() ile birebir);
  /// ayrı bir "already inactive" dalı YOK — no-op görünümü updateMany'nin doğal sonucu.
  ///
  /// H1: avukat HERHANGİ bir dosyada CaseLawyer.isResponsible=true ise replacementLawyerId ZORUNLUDUR
  /// (aynı tenant + aktif + o dosyalara ZATEN atanmış olmalı — otomatik CaseLawyer ataması YAPILMAZ,
  /// LegalResponsibleLawyerService/WP-1d-5-4 ile AYNI kısıt). Devir + pasifleştirme AYNI transaction'da;
  /// dosya hiçbir anda sorumlusuz kalmaz. LegalResponsibleLawyerService.changeLegalResponsibleLawyer()
  /// BİLEREK çağrılmaz: kendi transaction'ını açıyor (nested-tx sorunu), ADMIN-only guard'ı var (bu akış
  /// PARTNER/delege yetkisiyle çalışır) ve tek-case+reason-zorunlu tasarlanmış (bu akış çoklu-case).
  /// Yerine AYNI state-transition deseni (clear-before-set, isResponsible⇔role coupling) ve AYNI audit
  /// şekli (entityType CASE_LAWYER, newValues.isResponsible, metadata.caseId) tekrarlanır —
  /// responsibility-history.service.ts bu YAPISAL şekle bakar, changeType string'ine değil.
  /// </remarks>
  async delete(tenantId: string, id: string, actor?: AuditActor, replacementLawyerId?: string) {
    const existing = await this.findOne(tenantId, id);

    // L1A: pasifleştirme yetkisi — transaction'dan ÖNCE (yetkisiz aktör hiçbir yazma yapmaz).
    await this.assertCanManageLawyerLifecycle(actor?.userId, tenantId);

    // H1: sorumlu olduğu dosyalar — transaction'dan ÖNCE tespit + replacement doğrulaması (eksik/geçersiz
    // replacement hiçbir yazma yapmadan reddedilir).
    const responsibleCaseLawyers = await this.prisma.caseLawyer.findMany({
      where: { lawyerId: id, isResponsible: true },
      select: { id: true, caseId: true },
    });

    let transferPlan: { oldCaseLawyerId: string; newCaseLawyerId: string; caseId: string }[] = [];
    if (responsibleCaseLawyers.length > 0) {
      if (!replacementLawyerId) {
        throw new BadRequestException(
          "Bu avukat bir veya daha fazla dosyada sorumlu; pasifleştirmeden önce yeni sorumlu avukat (replacementLawyerId) seçilmelidir."
        );
      }
      if (replacementLawyerId === id) {
        throw new BadRequestException("Yeni sorumlu avukat, pasifleştirilen avukatın kendisi olamaz.");
      }
      const candidate = await this.prisma.lawyer.findFirst({
        where: { id: replacementLawyerId, tenantId },
        select: { id: true, isActive: true },
      });
      if (!candidate) {
        throw new BadRequestException("Yeni sorumlu avukat bulunamadı veya bu tenant'a ait değil.");
      }
      if (!candidate.isActive) {
        throw new BadRequestException("Yeni sorumlu avukat aktif olmalıdır.");
      }

      const caseIds = responsibleCaseLawyers.map((cl) => cl.caseId);
      const replacementCaseLawyers = await this.prisma.caseLawyer.findMany({
        where: { caseId: { in: caseIds }, lawyerId: replacementLawyerId },
        select: { id: true, caseId: true },
      });
      const replacementByCaseId = new Map(replacementCaseLawyers.map((cl) => [cl.caseId, cl.id]));
      const missingCaseIds = caseIds.filter((caseId) => !replacementByCaseId.has(caseId));
      if (missingCaseIds.length > 0) {
        throw new BadRequestException({
          message: "Yeni sorumlu avukat aşağıdaki dosyalara henüz atanmamış; önce dosyalara ekleyin.",
          code: "REPLACEMENT_NOT_ASSIGNED_TO_CASES",
          caseIds: missingCaseIds,
        });
      }

      transferPlan = responsibleCaseLawyers.map((cl) => ({
        oldCaseLawyerId: cl.id,
        newCaseLawyerId: replacementByCaseId.get(cl.caseId)!,
        caseId: cl.caseId,
      }));
    }

    // L1A: soft-deactivate (+ H1: sorumluluk devri) + audit AYNI transaction (old snapshot deactivate
    // ÖNCESİ alındı; dosya hiçbir anda sorumlusuz kalmaz — clear-before-set sırası, partial unique
    // index case_lawyer_one_responsible_per_case ile aynı tx içinde tutarlı).
    const deactivated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.lawyer.updateMany({
        where: { id, tenantId },
        data: { isActive: false },
      });
      if (count === 0) throw new NotFoundException("Avukat bulunamadı");

      // CANDIDATE-A (OFF/OD-14, WAVE 1 — RATIFIED Contract): bağlı UserAccount varsa AYNI transaction
      // içinde deaktive edilir — mevcut per-request enforcement'ı (auth.service.ts:validateUser())
      // tetikler. Fail-closed + atomic: count!==1 (tenant uyuşmazlığı veya bütünlük sorunu) → TÜM
      // transaction (Lawyer write dahil) rollback edilir; "best-effort" YASAK (ratifikasyon kararı —
      // aksi hâl kapatılmaya çalışılan riski veri bütünlüğü bozulduğunda sessizce yeniden üretirdi).
      if (existing.userId) {
        const userResult = await tx.user.updateMany({
          where: { id: existing.userId, tenantId },
          data: { isActive: false },
        });
        if (userResult.count !== 1) {
          throw new ConflictException(
            "Bağlı kullanıcı hesabı deaktive edilemedi (tenant uyuşmazlığı veya veri bütünlüğü sorunu); pasifleştirme iptal edildi."
          );
        }
      }

      for (const t of transferPlan) {
        await tx.caseLawyer.update({
          where: { id: t.oldCaseLawyerId },
          data: { isResponsible: false, role: "ASSIGNED" },
        });
        await tx.caseLawyer.update({
          where: { id: t.newCaseLawyerId },
          data: { isResponsible: true, role: "RESPONSIBLE" },
        });
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: "UPDATE",
          entityType: "CASE_LAWYER",
          entityId: t.newCaseLawyerId,
          userId: actor?.userId,
          oldValues: { isResponsible: false, lawyerId: replacementLawyerId },
          newValues: { isResponsible: true, role: "RESPONSIBLE", lawyerId: replacementLawyerId },
          metadata: {
            caseId: t.caseId,
            changeType: "LEGAL_RESPONSIBLE_LAWYER_CHANGED",
            previousLawyerId: id,
            newLawyerId: replacementLawyerId,
            source: "LAWYER_DEACTIVATE_TRANSFER",
          },
        });
      }

      await this.audit.logInTransaction(tx, {
        tenantId,
        action: "LAWYER_DEACTIVATE",
        entityType: "LAWYER",
        entityId: id,
        userId: actor?.userId,
        metadata: {
          softDelete: true,
          oldSnapshot: {
            name: existing.name,
            surname: existing.surname,
            barNumberMasked: existing.barNumber ? `****${String(existing.barNumber).slice(-4)}` : null,
            lawyerRank: existing.lawyerRank,
            wasActive: existing.isActive,
          },
          ...(transferPlan.length > 0
            ? {
                responsibilityTransfer: {
                  replacementLawyerId,
                  caseCount: transferPlan.length,
                  caseIds: transferPlan.map((t) => t.caseId),
                },
              }
            : {}),
        },
      });

      // F01: lifecycle yaniti de actor-bound projection'dan geçer.
      const deactivatedRow = { ...existing, isActive: false };
      return deactivatedRow;
    });

    return this.projectLawyerResponse(
      tenantId,
      deactivated as Record<string, unknown>,
      actor as LawyerUpdateActor,
    );
  }

  // Avukat sıralamasını güncelle
  async updateOrder(tenantId: string, lawyerIds: string[], actor?: LawyerUpdateActor) {
    const updates = lawyerIds.map((id, index) =>
      this.prisma.lawyer.updateMany({
        where: { id, tenantId },
        data: { sortOrder: index },
      })
    );

    await this.prisma.$transaction(updates);

    return this.findAll(tenantId, undefined, false, actor);
  }

  // Varsayılan avukatları ayarla
  async setDefaults(tenantId: string, lawyerIds: string[], actor?: LawyerUpdateActor) {
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

    return this.findAll(tenantId, undefined, false, actor);
  }
}
