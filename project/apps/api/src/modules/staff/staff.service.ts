import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { revokeK73ForSubjectInTx } from '../client/client-special-category-access';
import { PermissionGrantEffect, PermissionGrantScope, Prisma, StaffMember } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePersonName } from '../../common/name-match.util';
import { maskTckn } from '../../common/pii-mask.util';
import { AuditService } from '../audit/audit.service';
import { WorkScopePermissionService } from '../work-scope-permission/work-scope-permission.service';
import { WORK_SCOPE_VIEW_ALL_KEYS } from '../work-scope-permission/work-scope-permission.constants';
import { ReactivateStaffDto, ReopenStaffAccountDto } from './dto/staff.dto';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { expireContactGrantsInTx, readContactReopenGrants } from '../office/office-contact-account-reopen';

export interface StaffDeactivateAuditActor {
  userId: string;
  role: string;
  requestId: string;
}

/** O-5: yeniden etkinleştirme de pasifleştirme ile aynı denetim bağlamını ister (aktör + rol + istek kimliği). */
export type StaffReactivateAuditActor = StaffDeactivateAuditActor;

/**
 * O-5: yeniden etkinleştirmede yöneticinin AÇIKÇA belirlediği alanlar (ReactivateStaffDto ile birebir).
 * Kimlik, iletişim, hesap bağı ve sıra bu kümeye girmez.
 */
const STAFF_REACTIVATION_FIELDS = [
  'staffType',
  'canCreateCase',
  'canEditCase',
  'canGenerateDocuments',
  'canApproveDocuments',
  'canSeeFinance',
  'canApproveFinance',
  'canPrepareCollectionDisposition',
  'canSendNotifications',
  'isDefaultForNewCases',
] as const;
type StaffReactivationValues = Pick<StaffMember, (typeof STAFF_REACTIVATION_FIELDS)[number]>;

const pickReactivationValues = (src: StaffReactivationValues): StaffReactivationValues =>
  Object.fromEntries(STAFF_REACTIVATION_FIELDS.map((k) => [k, src[k]])) as unknown as StaffReactivationValues;

type StaffContextReader = Pick<Prisma.TransactionClient, 'caseStaff' | 'case' | 'user'>;

/** O-5: yeniden etkinleştirmenin etkisi — onay öncesinde ve sonrasında GERÇEK durumla gösterilir. */
export interface StaffReactivationContext {
  /** Kartın bağlı giriş hesabı; bu işlem hesabı, rolü ve büro geneli grantleri DEĞİŞTİRMEZ. */
  linkedAccount: { exists: boolean; isActive: boolean };
  /** Pasifleştirmede silinmeyen dosya atamaları (CaseStaff); kart etkinleşince yeniden etkili olur. */
  caseAssignmentCount: number;
  /** Personelin dosya sorumlusu olduğu dosyalar (Case.responsibleStaffId). */
  responsibleCaseCount: number;
}

/** O-5b: hesap açmanın uygulanamadığı durumlar (inceleme ve yazım AYNI yüklemi kullanır). */
export type StaffAccountReopenBlockReason =
  | 'STAFF_INACTIVE' // kart pasif: önce O-5 yeniden etkinleştirme
  | 'NO_LINKED_ACCOUNT' // karta bağlı giriş hesabı yok
  | 'ACCOUNT_ALREADY_ACTIVE' // hesap zaten açık
  | 'ACCOUNT_PENDING_INVITE'; // parolasız bekleyen davet hesabı: açma değil davet yolu

/** O-5b: yönetici onay ekranının gördüğü inceleme (kişisel veri, parola özeti ve TCKN içermez). */
export interface StaffAccountReopenReview {
  staffId: string;
  reopenable: boolean;
  reason: StaffAccountReopenBlockReason | null;
  account: { role: string; isActive: boolean; hasPassword: boolean } | null;
  /** Üç F02 anahtarındaki GLOBAL, bitmemiş ALLOW kayıtları (ileri tarihliler dahil). */
  allowGrants: Array<{ id: string; permissionKey: string; validFrom: string; validUntil: string | null; startsInFuture: boolean }>;
  /** G1/G2 iletişim yazma izinleri F02 görüntüleme kümesine katılmaz. */
  contactAllowGrants: StaffAccountReopenReview['allowGrants'];
  contactDenyKeys: string[];
  /** Bilgi: açık ret (DENY) taşıyan anahtarlar; hesap açma bunlara DOKUNMAZ. */
  denyKeys: string[];
  /** Onayın bağlandığı içerik parmak izi; uygulanamıyorsa null. */
  reviewFingerprint: string | null;
}

type AccountReopenState = {
  review: StaffAccountReopenReview;
  userId: string | null;
  userUpdatedAt: Date | null;
  tokenVersion: number | null;
  contactOfficeId: string | null;
};

type AccountReopenReader = Pick<Prisma.TransactionClient, 'staffMember' | 'user' | 'permissionGrant'>;

@Injectable()
export class StaffService {
  constructor(
    private prisma: PrismaService,
    // AuditModule globaldir. Opsiyonel işaret yalnız doğrudan kurulan mevcut unit-test
    // fixture'larını korur; Nest runtime'da provider yoksa DI zaten fail-closed olur.
    private readonly audit?: AuditService,
    // O-5b: StaffModule WorkScopePermissionModule'ü içe aktarır. @Optional yalnız doğrudan kurulan
    // test fixture'ları içindir; yoksa hesap açma aynı servisi yerel olarak kurar (aynı kilit + denetim).
    @Optional() private readonly workScope?: WorkScopePermissionService,
    // Existing direct-construction fixtures without contact grants keep their constructor contract.
    @Optional() private readonly officeApproval?: OfficeApprovalService,
  ) {}

  /**
   * CANDIDATE-F1 (WAVE 3, RATIFIED — Personnel List Masked Default): personel LİSTE yüzeyinde
   * hassas alanı (tckn) varsayılan maskele. Null/undefined/boş KORUNUR (sentinel üretilmez —
   * ham maskTckn null'da '[NO_TCKN]' döndürürdü). Yalnız liste projeksiyonu; detail (findOne),
   * create/update, duplicate-guard sorguları ve response shape DEĞİŞMEZ.
   */
  private maskListRow<T extends { tckn: string | null }>(row: T): T {
    return { ...row, tckn: row.tckn == null || row.tckn === '' ? row.tckn : maskTckn(row.tckn) };
  }

  // Tüm personeli listele
  async findAll(tenantId: string) {
    const rows = await this.prisma.staffMember.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ staffType: 'asc' }, { sortOrder: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map((row) => this.maskListRow(row));
  }

  // Tek personel getir
  //
  // P5-B04 (S3, owner-ratified): detay yüzeyi de liste ile AYNI tckn maskesini uygular
  // (önceden raw dönüyordu — herhangi bir authenticated tenant kullanıcısı ham TCKN
  // okuyabiliyordu). CANDIDATE-F1 kaydındaki "findOne DEĞİŞMEZ" cümlesi o task'in kapsam
  // sınırıydı, kalıcı sözleşme değil; S3 bunu açıkça genişletir. Ölçülen hiçbir tüketici
  // findOne'dan ham TCKN okumuyor (P5-B03 §5 — endpoint'in web/API tüketicisi yok).
  async findOne(id: string, tenantId: string) {
    const row = await this.prisma.staffMember.findFirst({
      where: { id, tenantId },
      include: { caseAssignments: true },
    });
    return row ? this.maskListRow(row) : row;
  }

  /**
   * Yeni personel ekle.
   *
   * Mükerrer politikası (PR-S — duplicate-handling kontratı):
   * - KESİN kimlik (TCKN/e-posta) eşleşmesi, AKTİF kart → kesin duplicate: yeni AÇMA, mevcut döndür
   *   + transient `_existingReturned` bayrağı (`_reactivated: false`).
   * - O-5 (owner 05.11.2026, C politikası): kimlik eşleşmesi yalnız PASİF kartta → HİÇBİR YAZIM
   *   YAPILMAZ; 409 STAFF_REACTIVATION_REVIEW { code, message, staff } döner. Önceden kart burada
   *   sessizce etkinleşiyor, ESKİ izinler ve yeni dosyalara otomatik atama geri geliyor, formdaki
   *   değerler yazılmıyor ve denetim kaydı oluşmuyordu. Yeniden etkinleştirme artık yalnız
   *   yöneticinin izinleri gözden geçirip açıkça gönderdiği `reactivate()` ile olur (create yetkisi
   *   yaşam döngüsü kararını İÇERMEZ — LawyerService B3 / CLIENT R1A emsali).
   *   Aynı kimlik hem aktif hem pasif kartta varsa AKTİF kart döner (pasif kart açılmaz).
   * - Kimlik YOK + SADECE ad-soyad eşleşmesi → SESSİZ MERGE YASAK: 409 SIMILAR_NAME_REVIEW
   *   { code, message, candidates } döner → frontend review-dialog açar (insan kararı).
   *   İki farklı kimliksiz "Fatih engin" meşru olabilir.
   * - `forceCreate=true` ("Ayrı kişi olarak kaydet") → isim review'unu bilinçli geçer; kimlik
   *   eşleşmesini geçmez (TCKN/e-posta hâlâ kesin duplicate sayılır).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - StaffController.create() → POST /staff (ayarlar > ofis > personel ekle)
   * </remarks>
   */
  async create(tenantId: string, data: any) {
    const wantName = normalizePersonName(data.firstName, data.lastName);
    const all = await this.prisma.staffMember.findMany({ where: { tenantId } });

    // 1) KESİN kimlik (TCKN/e-posta) → aktif kartı kullan + bildir; pasif kart YAZIMSIZ incelemeye
    //    gider (O-5). forceCreate bunu GEÇMEZ.
    const identityMatches = all.filter(
      (s) =>
        (data.tckn && s.tckn === data.tckn) ||
        (data.email && s.email === data.email),
    );
    const activeMatch = identityMatches.find((s) => s.isActive);
    if (activeMatch) {
      return { ...(activeMatch as any), isActive: true, _existingReturned: true, _reactivated: false };
    }
    if (identityMatches.length > 0) {
      const inactive = identityMatches[0];
      const context = await this.readReactivationContext(this.prisma, tenantId, inactive);
      throw new ConflictException({
        code: 'STAFF_REACTIVATION_REVIEW',
        message:
          'Bu TCKN veya e-posta ile pasif bir personel kaydı var. Kayıt yeniden etkinleştirilmedi ve hiçbir değişiklik yapılmadı; izinleri gözden geçirerek ayrıca yeniden etkinleştirin.',
        // Yalnız gözden geçirme için gereken alanlar: ad, tür, izinler ve etki. TCKN / e-posta /
        // telefon / hesap kimliği GİRMEZ (istemci zaten kimliği yazdı; yanıt veriyi genişletmez).
        staff: {
          id: inactive.id,
          firstName: inactive.firstName,
          lastName: inactive.lastName,
          ...pickReactivationValues(inactive),
          ...context,
        },
      });
    }

    // 2) Kimlik YOK + sadece ad-soyad eşleşmesi + forceCreate yok → review (sessiz merge yasak).
    if (!data.forceCreate && wantName) {
      const candidates = all
        .filter((s) => normalizePersonName(s.firstName, s.lastName) === wantName)
        .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.replace(/\s+/g, ' ').trim() }));
      if (candidates.length > 0) {
        throw new ConflictException({
          code: 'SIMILAR_NAME_REVIEW',
          message:
            'Benzer isimli personel mevcut. Mevcut kayıt kullanılabilir veya ayrı kişi olarak yeni kayıt açılabilir.',
          candidates,
        });
      }
    }

    // 3) Yeni kayıt (forceCreate veya hiç eşleşme yok). forceCreate prisma'ya YAZILMAZ (alanlar açıkça map'lenir).
    const office = await this.prisma.office.findUnique({ where: { tenantId } });

    return this.prisma.staffMember.create({
      data: {
        tenantId,
        officeId: office?.id,
        firstName: data.firstName,
        lastName: data.lastName,
        tckn: data.tckn,
        email: data.email,
        phone: data.phone,
        mobilePhone: data.mobilePhone,
        whatsappPhone: data.whatsappPhone,
        staffType: data.staffType || 'DIGER',
        canCreateCase: data.canCreateCase || false,
        canEditCase: data.canEditCase || false,
        canGenerateDocuments: data.canGenerateDocuments || false,
        canApproveDocuments: data.canApproveDocuments || false,
        canSeeFinance: data.canSeeFinance || false,
        canApproveFinance: data.canApproveFinance || false,
        canPrepareCollectionDisposition: data.canPrepareCollectionDisposition || false,
        canSendNotifications: data.canSendNotifications || false,
        isDefaultForNewCases: data.isDefaultForNewCases || false,
        sortOrder: data.sortOrder || 0,
      },
    });
  }

  /** Personel güncelle. Çağıran: StaffController.update (PUT). */
  async update(id: string, tenantId: string, data: any) {
    // Önce bu personelin bu tenant'a ait olduğunu kontrol et
    const existing = await this.prisma.staffMember.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Personel bulunamadı');

    // Echo-only compatibility: a normal profile update never writes lifecycle state.
    if (data.isActive !== undefined) {
      if (typeof data.isActive !== 'boolean') {
        throw new BadRequestException({ code: 'INVALID_PROFILE_ACTIVE_UPDATE', message: 'isActive yalnız boolean olabilir.' });
      }
      if (data.isActive !== existing.isActive) {
        throw new BadRequestException({ code: 'PROFILE_LIFECYCLE_CHANGE_NOT_ALLOWED', message: 'Profil güncellemesi aktiflik durumunu değiştiremez; ayrı lifecycle işlemi gerekir.' });
      }
    }

    // P5-B04: liste/detay yanıtları maskeli TCKN taşır (örn. 123****01) ve ölçülen tüketici
    // (cases/new StaffDetailModal — P5-B03 §5 site #8) satırın TAMAMINI geri PUT eder.
    // Maskeli değer "değişiklik" sayılıp (a) DUPLICATE_IDENTITY'yi yanlış tetiklemesin,
    // (b) persist edilip GERÇEK TCKN'yi EZMESİN (veri kaybı) diye '*' içeren tckn
    // no-change sayılır. Gerçek TCKN 11 hane rakamdır — '*' asla meşru değer değildir.
    if (typeof data?.tckn === 'string' && data.tckn.includes('*')) {
      data = { ...data, tckn: undefined };
    }

    // PR-U3: UPDATE-PATH DUPLICATE GUARD (önce HİÇ yoktu → edit ile mükerrer üretilebiliyordu).
    // Self (id) HARİÇ, yalnız AKTİF diğer kayıtlar. confirmSimilarNameUpdate yalnız İSİM review'ını
    // geçer (kimlik block'unu GEÇMEZ). Yalnız ilgili alan GERÇEKTEN değişince tetiklenir.
    const mergedTckn = data.tckn ?? existing.tckn;
    const tcknChanged = data.tckn !== undefined && data.tckn !== existing.tckn;
    if (tcknChanged && mergedTckn) {
      const others = await this.prisma.staffMember.findMany({
        where: { tenantId, isActive: true, id: { not: id } },
      });
      const idDup = others.find((s) => s.tckn === mergedTckn);
      if (idDup) {
        throw new ConflictException({
          code: 'DUPLICATE_IDENTITY',
          message: 'Bu TCKN ile kayıtlı başka bir personel mevcut',
          existingStaff: { id: idDup.id, name: `${idDup.firstName} ${idDup.lastName}`.replace(/\s+/g, ' ').trim() },
        });
      }
    }

    const wantName = normalizePersonName(data.firstName ?? existing.firstName, data.lastName ?? existing.lastName);
    const nameChanged = wantName !== normalizePersonName(existing.firstName, existing.lastName);
    if (nameChanged && !data.confirmSimilarNameUpdate && wantName) {
      const others = await this.prisma.staffMember.findMany({
        where: { tenantId, isActive: true, id: { not: id } },
      });
      const candidates = others
        .filter((s) => normalizePersonName(s.firstName, s.lastName) === wantName)
        .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.replace(/\s+/g, ' ').trim() }));
      if (candidates.length > 0) {
        throw new ConflictException({
          code: 'SIMILAR_NAME_REVIEW',
          message: 'Benzer isimli personel mevcut. Benzerliğe rağmen bu kaydı güncelleyebilir veya vazgeçebilirsiniz.',
          candidates,
        });
      }
    }

    // Sadece gönderilen alanları güncelle (undefined olanları atla).
    // NOT: confirmSimilarNameUpdate map'lenmediği için prisma'ya YAZILMAZ.
    const updateData: any = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.tckn !== undefined) updateData.tckn = data.tckn;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.mobilePhone !== undefined) updateData.mobilePhone = data.mobilePhone;
    if (data.whatsappPhone !== undefined) updateData.whatsappPhone = data.whatsappPhone;
    if (data.staffType !== undefined) updateData.staffType = data.staffType;
    if (data.canCreateCase !== undefined) updateData.canCreateCase = data.canCreateCase;
    if (data.canEditCase !== undefined) updateData.canEditCase = data.canEditCase;
    if (data.canGenerateDocuments !== undefined) updateData.canGenerateDocuments = data.canGenerateDocuments;
    if (data.canApproveDocuments !== undefined) updateData.canApproveDocuments = data.canApproveDocuments;
    if (data.canSeeFinance !== undefined) updateData.canSeeFinance = data.canSeeFinance;
    if (data.canApproveFinance !== undefined) updateData.canApproveFinance = data.canApproveFinance;
    if (data.canPrepareCollectionDisposition !== undefined) updateData.canPrepareCollectionDisposition = data.canPrepareCollectionDisposition;
    if (data.canSendNotifications !== undefined) updateData.canSendNotifications = data.canSendNotifications;
    if (data.isDefaultForNewCases !== undefined) updateData.isDefaultForNewCases = data.isDefaultForNewCases;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

    return this.prisma.staffMember.update({
      where: { id },
      data: updateData,
    });
  }

  // Personel sil (soft delete)
  //
  // CANDIDATE-A (OFF/OD-14, WAVE 1 — RATIFIED Contract): bağlı UserAccount varsa AYNI transaction
  // içinde deaktive edilir — mevcut per-request enforcement'ı (auth.service.ts:validateUser())
  // tetikler. Fail-closed + atomic: count!==1 (tenant uyuşmazlığı veya bütünlük sorunu) → TÜM
  // transaction (StaffMember write dahil) rollback edilir; "best-effort" YASAK (ratifikasyon kararı).
  /**
   * Çağrıldığı yerler:
   * - StaffController.remove() → DELETE /staff/:id
   */
  async remove(id: string, tenantId: string, actor?: StaffDeactivateAuditActor) {
    // Nest runtime global AuditService'i enjekte eder. Doğrudan kurulan HTTP fixture'ı
    // actor taşıyorsa aynı mevcut consumer API'sini Prisma adapter üzerinde kur; audit'siz
    // mutationa izin verme. Actor ve AuditService'in ikisinin de olmaması yalnız legacy
    // doğrudan unit-test fixture'larının mevcut sözleşmesini korur.
    if (!actor && this.audit) {
      throw new ConflictException('Personel pasifleştirme denetim bağlamı eksik; işlem iptal edildi.');
    }
    if (actor && (!actor.userId || !actor.role || !actor.requestId)) {
      throw new ConflictException('Personel pasifleştirme aktör, rol veya istek kimliği eksik; işlem iptal edildi.');
    }
    const auditConsumer = actor ? (this.audit ?? new AuditService(this.prisma)) : undefined;

    const existing = await this.prisma.staffMember.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Personel bulunamadı');

    return this.prisma.$transaction(async (tx) => {
      if (existing.userId) {
        if (!actor?.userId) throw new ConflictException('Özel veri yetki kaldırma aktörü eksik; pasifleştirme iptal edildi.');
        await revokeK73ForSubjectInTx(tx, tenantId, existing.userId, actor.userId, 'STAFF_DEACTIVATED');
        const userResult = await tx.user.updateMany({
          where: { id: existing.userId, tenantId },
          data: { isActive: false },
        });
        if (userResult.count !== 1) {
          throw new ConflictException(
            'Bağlı kullanıcı hesabı deaktive edilemedi (tenant uyuşmazlığı veya veri bütünlüğü sorunu); pasifleştirme iptal edildi.'
          );
        }
      }

      const deactivated = await tx.staffMember.update({
        where: { id },
        data: { isActive: false },
      });

      if (actor && auditConsumer) {
        await auditConsumer.logInTransaction(tx, {
          tenantId,
          action: 'STAFF_DEACTIVATE',
          entityType: 'STAFF',
          entityId: id,
          userId: actor.userId,
          actorType: 'USER',
          decisionResult: 'SUCCESS',
          reasonCode: 'OFFICE_F01_AUTHORIZED',
          correlationId: actor.requestId,
          requestId: actor.requestId,
          policyRef: 'OFFICE-GOVERNANCE:OFF-INV-08',
          policyVersion: '2026-08-13',
          oldValues: { isActive: existing.isActive },
          newValues: { isActive: false },
          metadata: {
            actorRole: actor.role,
            authoritySource: 'OFFICE_F01_AUTHORIZATION_GUARD',
            linkedUserAccountDeactivated: Boolean(existing.userId),
            softDelete: true,
          },
        });
      }

      return deactivated;
    });
  }

  /**
   * O-5 (owner 05.11.2026, C politikası): pasif personeli yöneticinin gözden geçirdiği izinlerle
   * yeniden etkinleştir.
   *
   * - İzinler YALNIZ doğrulanmış gövdeden (ReactivateStaffDto) alınır; eski karttan sessizce
   *   devralınmaz. Kimlik, iletişim, hesap bağı ve sıra değişmez.
   * - Bağlı giriş hesabı, rolü ve büro geneli grantler (PermissionGrant) DEĞİŞMEZ; dosya
   *   atamaları (CaseStaff) ve dosya sorumluluğu silinmez. Yanıt bunların GERÇEK durumunu döner.
   * - Koşullu yazım: güncelleme, kararın verildiği duruma (aynı tenant + pasif + okunan
   *   updatedAt) bağlıdır. Kayıt bu arada değiştiyse ya da eşzamanlı ikinci istek geldiyse
   *   count 0 → 409; tek güncelleme ve tek denetim kaydı oluşur.
   * - STAFF_REACTIVATE denetimi AYNI transaction'da yazılır; logInTransaction hata yutmaz →
   *   denetim yazılamazsa yeniden etkinleştirme de geri alınır.
   * - Başka AKTİF kart aynı TCKN / e-postayı taşıyorsa 409 DUPLICATE_IDENTITY (iki aktif kimlik oluşmaz).
   *
   * Çağrıldığı yerler:
   * - StaffController.reactivate() → POST /staff/:id/reactivate (OfficeF01AuthorizationGuard)
   */
  async reactivate(id: string, tenantId: string, data: ReactivateStaffDto, actor: StaffReactivateAuditActor) {
    if (!actor || !actor.userId || !actor.role || !actor.requestId) {
      throw new ConflictException('Personel yeniden etkinleştirme aktör, rol veya istek kimliği eksik; işlem iptal edildi.');
    }
    const auditConsumer = this.audit ?? new AuditService(this.prisma);
    const next = pickReactivationValues(data as unknown as StaffReactivationValues);

    const existing = await this.prisma.staffMember.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Personel bulunamadı');
    if (existing.isActive) {
      throw new ConflictException({
        code: 'STAFF_ALREADY_ACTIVE',
        message: 'Personel zaten etkin; yeniden etkinleştirme yapılmadı.',
      });
    }

    const identity: Prisma.StaffMemberWhereInput[] = [
      ...(existing.tckn ? [{ tckn: existing.tckn }] : []),
      ...(existing.email ? [{ email: existing.email }] : []),
    ];
    if (identity.length > 0) {
      const activeDuplicate = await this.prisma.staffMember.findFirst({
        where: { tenantId, isActive: true, id: { not: id }, OR: identity },
        select: { id: true, firstName: true, lastName: true },
      });
      if (activeDuplicate) {
        throw new ConflictException({
          code: 'DUPLICATE_IDENTITY',
          message: 'Bu TCKN veya e-posta ile kayıtlı başka bir etkin personel var; yeniden etkinleştirme yapılmadı.',
          existingStaff: {
            id: activeDuplicate.id,
            name: `${activeDuplicate.firstName} ${activeDuplicate.lastName}`.replace(/\s+/g, ' ').trim(),
          },
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.staffMember.updateMany({
        where: { id, tenantId, isActive: false, updatedAt: existing.updatedAt },
        data: { ...next, isActive: true },
      });
      if (count !== 1) {
        throw new ConflictException({
          code: 'STAFF_REACTIVATION_CONFLICT',
          message: 'Personel kaydı bu arada değişti ya da başka bir istekle etkinleştirildi; yeniden etkinleştirme uygulanmadı. Kaydı yeniden açıp tekrar deneyin.',
        });
      }

      const context = await this.readReactivationContext(tx, tenantId, existing);

      await auditConsumer.logInTransaction(tx, {
        tenantId,
        action: 'STAFF_REACTIVATE',
        entityType: 'STAFF',
        entityId: id,
        userId: actor.userId,
        actorType: 'USER',
        decisionResult: 'SUCCESS',
        reasonCode: 'OFFICE_F01_AUTHORIZED',
        correlationId: actor.requestId,
        requestId: actor.requestId,
        policyRef: 'OFFICE-GOVERNANCE:O-5',
        policyVersion: '2026-11-05',
        // Yalnız yaşam döngüsü + izin değerleri; ad, kimlik ve iletişim verisi GİRMEZ.
        oldValues: { isActive: false, ...pickReactivationValues(existing) },
        newValues: { isActive: true, ...next },
        metadata: {
          actorRole: actor.role,
          authoritySource: 'OFFICE_F01_AUTHORIZATION_GUARD',
          reviewedReactivation: true,
          linkedUserAccountExists: context.linkedAccount.exists,
          linkedUserAccountActive: context.linkedAccount.isActive,
          linkedUserAccountChanged: false,
          caseAssignmentCount: context.caseAssignmentCount,
          responsibleCaseCount: context.responsibleCaseCount,
        },
      });

      const updated = await tx.staffMember.findFirst({ where: { id, tenantId } });
      if (!updated) throw new NotFoundException('Personel bulunamadı');
      return { staff: this.maskListRow(updated), ...context };
    });
  }

  /** O-5: yeniden etkinleştirmenin gerçek etkisi (salt okuma; hesap / grant / atama YAZILMAZ). */
  private async readReactivationContext(
    db: StaffContextReader,
    tenantId: string,
    staff: Pick<StaffMember, 'id' | 'userId'>,
  ): Promise<StaffReactivationContext> {
    // Sıralı okuma: interactive transaction içinde aynı bağlantı paylaşılır.
    const caseAssignmentCount = await db.caseStaff.count({ where: { staffMemberId: staff.id } });
    const responsibleCaseCount = await db.case.count({ where: { tenantId, responsibleStaffId: staff.id } });
    const user = staff.userId
      ? await db.user.findFirst({ where: { id: staff.userId, tenantId }, select: { isActive: true } })
      : null;
    return {
      linkedAccount: { exists: !!user, isActive: user?.isActive === true },
      caseAssignmentCount,
      responsibleCaseCount,
    };
  }

  /**
   * O-5b (owner 05.11.2026, A politikası): yeniden etkinleştirilmiş personelin KAPALI giriş hesabını açma İNCELEMESİ
   * (salt okuma). Yetki: F01 kapısı (controller) + GÜNCEL DB rolü ADMIN (burada — büro geneli izin yazma kuralı; F01
   * kapısı ADMIN olmayan PARTNER/MANAGER/delege avukatı da geçirir). Yanıt parola özeti, e-posta ya da TCKN taşımaz.
   *
   * Çağrıldığı yerler:
   * - StaffController.accountReopenReview() → GET /staff/:id/account-reopen-review
   */
  async reviewAccountReopen(id: string, tenantId: string, actorUserId: string): Promise<StaffAccountReopenReview> {
    await this.assertCurrentAdmin(this.prisma, tenantId, actorUserId);
    return (await this.readAccountReopenState(this.prisma, tenantId, id, new Date())).review;
  }

  /**
   * O-5b (owner 05.11.2026, A politikası): etkin personel kartına bağlı, parolası olan KAPALI giriş hesabını yöneticinin
   * gözden geçirdiği haliyle açar. Hepsi TEK transaction'da (biri başarısızsa hiçbiri yazılmaz):
   *  1. grant / revoke ile AYNI danışma kilidi (WorkScopePermissionService.lockPersonInTx);
   *  2. güncel DB rolü ADMIN (aynı tx; ön kontrol);
   *  3. kilit sırası pasifleştirmeyle aynı: User satırları (sıralı) → personel kartı. Yazıma esas yetki kararı User
   *     kilitleri ALINDIKTAN SONRA yeniden okunur: istek kilitte beklerken aktörün rolü kaldırılır ya da hesabı kapatılırsa
   *     kilit açıldığında 403 olur ve hiçbir şey yazılmaz;
   *  4. inceleme yeniden okunur; uygulanamıyorsa 409 STAFF_ACCOUNT_REOPEN_NOT_APPLICABLE, parmak izi tutmuyorsa
   *     409 STAFF_ACCOUNT_REVIEW_STALE (yalnız kimlik listesi değil: içerik, süre ve updatedAt parmak izine girer);
   *  5. hesap koşullu açılır ve tokenVersion 1 artar → pasifleştirmeden önce verilmiş JWT'ler reddedilir;
   *  6. seçilmeyen F02 GLOBAL ALLOW kayıtları sona erer (DENY ve F02 dışı izinler DEĞİŞMEZ);
   *  7. açık parola sıfırlama belirteçleri iptal edilir;
   *  8. STAFF_ACCOUNT_REOPEN denetimi (+ anahtar başına PERMISSION_GRANT denetimi).
   * Rol, parola, kimlik alanları, kart izinleri ve dosya atamaları DEĞİŞMEZ.
   *
   * Çağrıldığı yerler:
   * - StaffController.reopenAccount() → POST /staff/:id/account-reopen (OfficeF01AuthorizationGuard)
   */
  async reopenAccount(id: string, tenantId: string, data: ReopenStaffAccountDto, actor: StaffReactivateAuditActor) {
    if (!actor || !actor.userId || !actor.role || !actor.requestId) {
      throw new ConflictException('Hesap açma aktör, rol veya istek kimliği eksik; işlem iptal edildi.');
    }
    const auditConsumer = this.audit ?? new AuditService(this.prisma);
    const workScope = this.workScope ?? new WorkScopePermissionService(this.prisma, auditConsumer);
    const person = { personType: 'staff' as const, personId: id };
    const keep = [...data.keepGrantIds];

    return this.prisma.$transaction(
      async (tx) => {
        await workScope.lockPersonInTx(tx, tenantId, person);
        await this.assertCurrentAdmin(tx, tenantId, actor.userId);

        const pre = await tx.staffMember.findFirst({ where: { id, tenantId }, select: { userId: true } });
        if (!pre) throw new NotFoundException('Personel bulunamadı');
        const users = [...new Set([actor.userId, ...(pre.userId ? [pre.userId] : [])])].sort();
        // Only the added contact path needs F01's Lawyer -> User locking; retain the original F02-only path.
        const hasContactGrants = (await readContactReopenGrants(tx, tenantId, pre.userId, new Date())).length > 0;
        if (hasContactGrants) await tx.$queryRaw`SELECT "id" FROM "Lawyer" WHERE "userId" = ${actor.userId} FOR SHARE`;
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "tenantId" = ${tenantId} AND "id" IN (${Prisma.join(users)}) ORDER BY "id" FOR UPDATE`;
        // Yazıma esas yetki kararı: aktörün User satırı artık bu transaction'ın kilidinde; kilit beklenirken commit olan rol
        // kaldırma / pasifleştirme burada görülür (READ COMMITTED yeni anlık görüntü) ve commit'e kadar değişemez.
        await this.assertCurrentAdmin(tx, tenantId, actor.userId);
        await tx.$queryRaw`SELECT "id" FROM "StaffMember" WHERE "tenantId" = ${tenantId} AND "id" = ${id} FOR UPDATE`;

        const now = new Date();
        const state = await this.readAccountReopenState(tx, tenantId, id, now);
        if (state.userId !== pre.userId) throw this.reopenConflict();
        if (!state.review.reopenable || !state.userId || !state.userUpdatedAt || state.tokenVersion === null || !state.review.account) {
          throw new ConflictException({
            code: 'STAFF_ACCOUNT_REOPEN_NOT_APPLICABLE',
            reason: state.review.reason,
            message: 'Bu kartın giriş hesabı şu an açılamaz; hiçbir şey yazılmadı.',
          });
        }
        if (state.review.reviewFingerprint !== data.reviewFingerprint) {
          throw new ConflictException({
            code: 'STAFF_ACCOUNT_REVIEW_STALE',
            message: 'Hesap ya da büro geneli izinler inceleme sonrasında değişti; hiçbir şey yazılmadı. İncelemeyi yenileyin.',
          });
        }
        const reviewedIds = state.review.allowGrants.map((g) => g.id);
        if (keep.some((g) => !reviewedIds.includes(g))) {
          throw new BadRequestException({
            code: 'STAFF_ACCOUNT_REOPEN_UNKNOWN_GRANT',
            message: 'Korunacak izinlerden biri incelemede yok; hiçbir şey yazılmadı.',
          });
        }
        const expireIds = reviewedIds.filter((g) => !keep.includes(g));
        const contactIds = state.review.contactAllowGrants.map(g => g.id);
        if (contactIds.length && !Array.isArray(data.keepContactGrantIds)) {
          throw new ConflictException({ code: 'STAFF_CONTACT_REVIEW_REQUIRED', message: 'İletişim yazma izinlerini ayrıca gözden geçirin; hiçbir şey yazılmadı.' });
        }
        const contactKeep = data.keepContactGrantIds ?? [];
        if (!Array.isArray(contactKeep) || contactKeep.some(g => typeof g !== 'string' || !contactIds.includes(g)) || new Set(contactKeep).size !== contactKeep.length) {
          throw new BadRequestException('Korunacak iletişim izni bu inceleme grubunda yok; hiçbir şey yazılmadı.');
        }
        if (contactIds.length) {
          if (!this.officeApproval || !await this.officeApproval.isF01ActorAuthorized(actor.userId, tenantId, undefined, { write: true, db: tx })) {
            throw new ForbiddenException('İletişim izinleri için güncel F01 yazma yetkisi gerekir.');
          }
          if (contactKeep.length) {
            const office = await tx.office.findUnique({ where: { tenantId }, select: { id: true } });
            if (!office || state.contactOfficeId !== office.id || state.review.account.role === 'VIEWER'
              || state.review.contactAllowGrants.some(g => contactKeep.includes(g.id) && g.validUntil === null)) {
              throw new ConflictException('İletişim izni için büro, rol veya sonlu bitiş doğrulanamadı; hiçbir şey yazılmadı.');
            }
          }
        }
        const contactExpire = contactIds.filter(g => !contactKeep.includes(g));
        const userId = state.userId;

        const opened = await tx.user.updateMany({
          where: { id: userId, tenantId, isActive: false, passwordHash: { not: null }, updatedAt: state.userUpdatedAt },
          data: { isActive: true, tokenVersion: { increment: 1 } },
        });
        if (opened.count !== 1) throw this.reopenConflict();

        const expiredGrantCount = await workScope.expireAllowGrantsInTx(tx, {
          tenantId, actorUserId: actor.userId, person, subjectUserId: userId, grantIds: expireIds, now, requestId: actor.requestId,
        });
        const expiredContactGrantCount = await expireContactGrantsInTx(tx, auditConsumer, {
          tenantId, actorUserId: actor.userId, staffId: id, subjectUserId: userId, ids: contactExpire, now, requestId: actor.requestId,
        });
        const revoked = await tx.passwordResetToken.updateMany({
          where: { tenantId, userId, consumedAt: null, revokedAt: null, expiresAt: { gt: now } },
          data: { revokedAt: now },
        });

        await auditConsumer.logInTransaction(tx, {
          tenantId,
          action: 'STAFF_ACCOUNT_REOPEN',
          entityType: 'USER',
          entityId: userId,
          userId: actor.userId,
          actorType: 'USER',
          decisionResult: 'SUCCESS',
          reasonCode: 'OFFICE_F01_AND_CURRENT_ADMIN_AUTHORIZED',
          correlationId: actor.requestId,
          requestId: actor.requestId,
          policyRef: 'OFFICE-GOVERNANCE:O-5b',
          policyVersion: '2026-11-05',
          // Yalnız yaşam döngüsü; ad, e-posta, parola ve kimlik verisi GİRMEZ.
          oldValues: { isActive: false, tokenVersion: state.tokenVersion },
          newValues: { isActive: true, tokenVersion: state.tokenVersion + 1 },
          metadata: {
            actorRole: actor.role,
            authoritySource: 'OFFICE_F01_AUTHORIZATION_GUARD+CURRENT_DB_ADMIN',
            staffId: id,
            reviewFingerprint: data.reviewFingerprint,
            keptGrantIds: keep,
            expiredGrantIds: expireIds,
            keptContactGrantIds: contactKeep,
            expiredContactGrantIds: contactExpire,
            revokedResetTokenCount: revoked.count,
            sessionsInvalidated: true,
            roleChanged: false,
            passwordChanged: false,
            denyGrantsChanged: false,
          },
        });

        return {
          staffId: id,
          account: { isActive: true, role: state.review.account.role },
          keptGrantCount: keep.length,
          expiredGrantCount,
          ...(contactIds.length ? { keptContactGrantCount: contactKeep.length, expiredContactGrantCount } : {}),
          revokedResetTokenCount: revoked.count,
          sessionsInvalidated: true,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15_000, maxWait: 10_000 },
    );
  }

  private reopenConflict(): ConflictException {
    return new ConflictException({
      code: 'STAFF_ACCOUNT_REOPEN_CONFLICT',
      message: 'Hesap kaydı bu arada değişti; hiçbir şey yazılmadı. İncelemeyi yenileyin.',
    });
  }

  /** O-5b yetkisi: yalnız GÜNCEL DB rolü ADMIN, aktif, aynı kiracı (token iddiası değil). */
  private async assertCurrentAdmin(db: Pick<Prisma.TransactionClient, 'user'>, tenantId: string, actorUserId: string): Promise<void> {
    const actor =
      typeof actorUserId === 'string' && actorUserId.length > 0
        ? await db.user.findFirst({ where: { id: actorUserId, tenantId, isActive: true, role: 'ADMIN' }, select: { id: true } })
        : null;
    if (!actor) {
      throw new ForbiddenException({
        code: 'STAFF_ACCOUNT_REOPEN_ADMIN_REQUIRED',
        message: 'Giriş hesabını açmak ve büro geneli izinleri gözden geçirmek için güncel ADMIN rolü gerekir.',
      });
    }
  }

  /** O-5b: inceleme ve yazımın ORTAK okuması; parmak izi kart + hesap + ALLOW satırlarının tam içeriğinden üretilir. */
  private async readAccountReopenState(
    db: AccountReopenReader,
    tenantId: string,
    staffId: string,
    now: Date,
  ): Promise<AccountReopenState> {
    // Sıralı okuma: interactive transaction içinde aynı bağlantı paylaşılır.
    const card = await db.staffMember.findFirst({
      where: { id: staffId, tenantId },
      select: { id: true, isActive: true, updatedAt: true, userId: true, officeId: true },
    });
    if (!card) throw new NotFoundException('Personel bulunamadı');
    const user = card.userId
      ? await db.user.findFirst({
          where: { id: card.userId, tenantId },
          select: { id: true, role: true, isActive: true, tokenVersion: true, updatedAt: true, passwordHash: true },
        })
      : null;
    const hasPassword = !!user && user.passwordHash !== null;
    const reason: StaffAccountReopenBlockReason | null = !card.isActive
      ? 'STAFF_INACTIVE'
      : !user
        ? 'NO_LINKED_ACCOUNT'
        : user.isActive
          ? 'ACCOUNT_ALREADY_ACTIVE'
          : !hasPassword
            ? 'ACCOUNT_PENDING_INVITE'
            : null;

    // "Bitmemiş" = süresiz ya da bitişi gelecekte; başlangıcı gelecekte olan (ileri tarihli) kayıtlar da DAHİL.
    const notEnded = { OR: [{ validUntil: null }, { validUntil: { gt: now } }] };
    const subject = user
      ? { tenantId, subjectUserId: user.id, permissionKey: { in: [...WORK_SCOPE_VIEW_ALL_KEYS] }, scope: PermissionGrantScope.GLOBAL, ...notEnded }
      : null;
    const allow = subject
      ? await db.permissionGrant.findMany({
          where: { ...subject, effect: PermissionGrantEffect.ALLOW },
          orderBy: { id: 'asc' },
          select: { id: true, permissionKey: true, effect: true, scope: true, validFrom: true, validUntil: true, updatedAt: true, grantedByUserId: true },
        })
      : [];
    const deny = subject
      ? await db.permissionGrant.findMany({ where: { ...subject, effect: PermissionGrantEffect.DENY }, select: { permissionKey: true } })
      : [];
    const contactRows = await readContactReopenGrants(db, tenantId, user?.id ?? null, now);
    const contactAllow = contactRows.filter(g => g.effect === 'ALLOW');

    const iso = (d: Date | null) => (d ? d.toISOString() : null);
    const reviewFingerprint =
      reason === null && user
        ? createHash('sha256')
            .update(
              JSON.stringify({
                v: 1,
                card: { id: card.id, isActive: card.isActive, updatedAt: card.updatedAt.toISOString(), userId: card.userId },
                // Parola / parola durumu parmak izine GİRMEZ: parmak izi yalnız "açılabilir" (parolası olan) hesapta üretilir;
                // parola değişikliği updatedAt ve tokenVersion'ı zaten değiştirir.
                account: {
                  id: user.id, role: user.role, isActive: user.isActive, tokenVersion: user.tokenVersion,
                  updatedAt: user.updatedAt.toISOString(),
                },
                allow: allow.map((g) => ({
                  id: g.id, permissionKey: g.permissionKey, effect: g.effect, scope: g.scope, validFrom: g.validFrom.toISOString(),
                  validUntil: iso(g.validUntil), updatedAt: g.updatedAt.toISOString(), grantedByUserId: g.grantedByUserId,
                })),
                ...(contactRows.length ? { contactOfficeId: card.officeId, contacts: contactRows.map(g => ({
                  ...g, validFrom: iso(g.validFrom), validUntil: iso(g.validUntil), updatedAt: iso(g.updatedAt),
                })) } : {}),
              }),
            )
            .digest('hex')
        : null;

    return {
      review: {
        staffId: card.id,
        reopenable: reason === null,
        reason,
        account: user ? { role: user.role, isActive: user.isActive, hasPassword } : null,
        allowGrants: allow.map((g) => ({
          id: g.id, permissionKey: g.permissionKey, validFrom: g.validFrom.toISOString(), validUntil: iso(g.validUntil),
          startsInFuture: g.validFrom > now,
        })),
        denyKeys: [...new Set(deny.map((d) => d.permissionKey))].sort(),
        contactAllowGrants: contactAllow.map(g => ({ id: g.id, permissionKey: g.permissionKey, validFrom: g.validFrom.toISOString(),
          validUntil: iso(g.validUntil), startsInFuture: g.validFrom > now })),
        contactDenyKeys: [...new Set(contactRows.filter(g => g.effect === 'DENY').map(g => g.permissionKey))].sort(),
        reviewFingerprint,
      },
      userId: user?.id ?? null,
      userUpdatedAt: user?.updatedAt ?? null,
      tokenVersion: user?.tokenVersion ?? null,
      contactOfficeId: card.officeId ?? null,
    };
  }

  // Personel türüne göre listele
  async findByType(tenantId: string, staffType: any) {
    const rows = await this.prisma.staffMember.findMany({
      where: { tenantId, staffType, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map((row) => this.maskListRow(row));
  }

  // Sıralama güncelle
  async updateOrder(tenantId: string, staffIds: string[]) {
    // Her personelin sırasını güncelle
    const updates = staffIds.map((id, index) =>
      this.prisma.staffMember.updateMany({
        where: { id, tenantId },
        data: { sortOrder: index },
      })
    );
    await Promise.all(updates);
    return { success: true };
  }
}
