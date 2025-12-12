import { Injectable } from '@nestjs/common';
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
    if (!existing) throw new Error('Personel bulunamadı');

    return this.prisma.staffMember.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        tckn: data.tckn,
        email: data.email,
        phone: data.phone,
        staffType: data.staffType,
        canCreateCase: data.canCreateCase,
        canEditCase: data.canEditCase,
        canGenerateDocuments: data.canGenerateDocuments,
        canApproveDocuments: data.canApproveDocuments,
        canSeeFinance: data.canSeeFinance,
        canApproveFinance: data.canApproveFinance,
        canSendNotifications: data.canSendNotifications,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });
  }

  // Personel sil (soft delete)
  async remove(id: string, tenantId: string) {
    const existing = await this.prisma.staffMember.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new Error('Personel bulunamadı');

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
}
