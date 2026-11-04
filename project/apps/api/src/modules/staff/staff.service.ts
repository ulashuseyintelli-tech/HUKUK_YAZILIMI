import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma, StaffMember } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePersonName } from '../../common/name-match.util';
import { maskTckn } from '../../common/pii-mask.util';
import { AuditService } from '../audit/audit.service';
import { ReactivateStaffDto } from './dto/staff.dto';

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

@Injectable()
export class StaffService {
  constructor(
    private prisma: PrismaService,
    // AuditModule globaldir. Opsiyonel işaret yalnız doğrudan kurulan mevcut unit-test
    // fixture'larını korur; Nest runtime'da provider yoksa DI zaten fail-closed olur.
    private readonly audit?: AuditService,
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
