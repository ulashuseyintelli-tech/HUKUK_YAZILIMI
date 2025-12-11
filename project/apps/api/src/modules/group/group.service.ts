import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService) {}

  // Tüm grupları listele
  async findAll(tenantId: string, clientId?: string) {
    return this.prisma.groupDefinition.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(clientId ? { OR: [{ isGlobal: true }, { clientId }] } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { caseGroups: true } },
      },
    });
  }

  // Grup detayı
  async findOne(tenantId: string, id: string) {
    const group = await this.prisma.groupDefinition.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { caseGroups: true } },
        caseGroups: {
          include: {
            case: {
              select: { id: true, fileNumber: true, executionFileNumber: true },
            },
          },
          take: 10,
        },
      },
    });
    if (!group) throw new NotFoundException('Grup bulunamadı');
    return group;
  }

  // Yeni grup oluştur
  async create(tenantId: string, userId: string, data: any) {
    return this.prisma.groupDefinition.create({
      data: {
        tenantId,
        createdById: userId,
        name: data.name,
        description: data.description,
        isGlobal: data.isGlobal ?? true,
        clientId: data.clientId,
        color: data.color,
      },
    });
  }


  // Grup güncelle
  async update(tenantId: string, id: string, data: any) {
    await this.findOne(tenantId, id);
    return this.prisma.groupDefinition.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        isGlobal: data.isGlobal,
        clientId: data.clientId,
        color: data.color,
      },
    });
  }

  // Grup sil (soft delete)
  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.groupDefinition.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Dosyanın gruplarını getir
  async getCaseGroups(caseId: string) {
    return this.prisma.caseGroup.findMany({
      where: { caseId },
      include: {
        group: { select: { id: true, name: true, color: true, description: true } },
      },
    });
  }

  // Dosyaya grup ata
  async assignGroupToCase(caseId: string, groupId: string, userId: string) {
    return this.prisma.caseGroup.upsert({
      where: { caseId_groupId: { caseId, groupId } },
      update: {},
      create: { caseId, groupId, assignedById: userId },
    });
  }

  // Dosyadan grup çıkar
  async removeGroupFromCase(caseId: string, groupId: string) {
    return this.prisma.caseGroup.delete({
      where: { caseId_groupId: { caseId, groupId } },
    });
  }

  // Toplu grup atama
  async assignGroupsToCases(caseIds: string[], groupId: string, userId: string) {
    const data = caseIds.map((caseId) => ({
      caseId,
      groupId,
      assignedById: userId,
    }));
    return this.prisma.caseGroup.createMany({
      data,
      skipDuplicates: true,
    });
  }
}
