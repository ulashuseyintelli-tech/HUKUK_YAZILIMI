import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePersonName } from '../../common/name-match.util';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  // Tüm personeli listele
  async findAll(tenantId: string) {
    return this.prisma.staffMember.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ staffType: 'asc' }, { sortOrder: 'asc' }, { firstName: 'asc' }],
    });
  }

  // Tek personel getir
  async findOne(id: string, tenantId: string) {
    return this.prisma.staffMember.findFirst({
      where: { id, tenantId },
      include: { caseAssignments: true },
    });
  }

  /**
   * Yeni personel ekle.
   *
   * Mükerrer politikası (PR-S — duplicate-handling kontratı):
   * - KESİN kimlik (TCKN/e-posta) eşleşmesi → kesin duplicate: yeni AÇMA, mevcut döndür
   *   (soft-deleted ise reactivate) + transient `_existingReturned`/`_reactivated` bayrağı.
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

    // 1) KESİN kimlik (TCKN/e-posta) → mevcut kullan + bildir (gerekirse reactivate). forceCreate bunu GEÇMEZ.
    const identityMatch = all.find(
      (s) =>
        (data.tckn && s.tckn === data.tckn) ||
        (data.email && s.email === data.email),
    );
    if (identityMatch) {
      const wasReactivated = identityMatch.isActive === false;
      if (wasReactivated) {
        await this.prisma.staffMember.update({ where: { id: identityMatch.id }, data: { isActive: true } });
      }
      return { ...(identityMatch as any), isActive: true, _existingReturned: true, _reactivated: wasReactivated };
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
        canSendNotifications: data.canSendNotifications || false,
        isDefaultForNewCases: data.isDefaultForNewCases || false,
        sortOrder: data.sortOrder || 0,
      },
    });
  }

  // Personel güncelle
  async update(id: string, tenantId: string, data: any) {
    // Önce bu personelin bu tenant'a ait olduğunu kontrol et
    const existing = await this.prisma.staffMember.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Personel bulunamadı');

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
    if (data.canSendNotifications !== undefined) updateData.canSendNotifications = data.canSendNotifications;
    if (data.isDefaultForNewCases !== undefined) updateData.isDefaultForNewCases = data.isDefaultForNewCases;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.staffMember.update({
      where: { id },
      data: updateData,
    });
  }

  // Personel sil (soft delete)
  async remove(id: string, tenantId: string) {
    const existing = await this.prisma.staffMember.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Personel bulunamadı');

    return this.prisma.staffMember.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Personel türüne göre listele
  async findByType(tenantId: string, staffType: any) {
    return this.prisma.staffMember.findMany({
      where: { tenantId, staffType, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { firstName: 'asc' }],
    });
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
