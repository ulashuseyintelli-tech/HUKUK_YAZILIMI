import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

  // Yeni personel ekle
  async create(tenantId: string, data: any) {
    // Office ID'yi bul
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

    // Sadece gönderilen alanları güncelle (undefined olanları atla)
    const updateData: any = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.tckn !== undefined) updateData.tckn = data.tckn;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
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
