import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService) {}

  /** Çağıranlar: create/update; clientId yalnız aynı kiracıdaki müvekkile bağlanabilir. */
  private async assertClientTenant(tx: Prisma.TransactionClient, tenantId: string, clientId: unknown) {
    if (clientId === undefined || clientId === null) return;
    if (typeof clientId !== 'string' || !clientId) throw new BadRequestException('Geçersiz müvekkil');
    const client = await tx.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true } });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');
  }

  /** Çağıranlar: getCaseGroups, assignGroupToCase, removeGroupFromCase. */
  private async assertCaseTenant(tx: Prisma.TransactionClient, tenantId: string, caseId: string) {
    const record = await tx.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
    if (!record) throw new NotFoundException('Dosya bulunamadı');
  }

  /** Çağıranlar: assignGroupToCase, removeGroupFromCase, assignGroupsToCases. */
  private async assertGroupTenant(tx: Prisma.TransactionClient, tenantId: string, groupId: string) {
    const group = await tx.groupDefinition.findFirst({ where: { id: groupId, tenantId }, select: { id: true } });
    if (!group) throw new NotFoundException('Grup bulunamadı');
  }

  // Çağıran: GroupController.findAll → GET /groups.
  async findAll(tenantId: string, clientId?: string) {
    return this.prisma.groupDefinition.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(clientId ? { OR: [{ isGlobal: true }, { clientId }] } : {}),
      },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { caseGroups: { where: { case: { tenantId } } } } },
      },
    });
  }

  // Çağıranlar: GroupController.findOne → GET /groups/:id; GroupService.delete.
  async findOne(tenantId: string, id: string) {
    const group = await this.prisma.groupDefinition.findFirst({
      where: { id, tenantId },
      include: {
        _count: { select: { caseGroups: { where: { case: { tenantId } } } } },
        caseGroups: {
          where: { case: { tenantId } },
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

  // Çağıran: GroupController.create → POST /groups.
  async create(tenantId: string, userId: string, data: any) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertClientTenant(tx, tenantId, data.clientId);
      return tx.groupDefinition.create({
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
    });
  }


  // Çağıran: GroupController.update → PUT /groups/:id.
  async update(tenantId: string, id: string, data: any) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertClientTenant(tx, tenantId, data.clientId);
      const group = await tx.groupDefinition.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!group) throw new NotFoundException('Grup bulunamadı');
      return tx.groupDefinition.update({
        where: { id, tenantId },
        data: {
          name: data.name,
          description: data.description,
          isGlobal: data.isGlobal,
          clientId: data.clientId,
          color: data.color,
        },
      });
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

  // Çağıran: CaseGroupController.getCaseGroups → GET /cases/:caseId/groups.
  async getCaseGroups(tenantId: string, caseId: string) {
    await this.assertCaseTenant(this.prisma, tenantId, caseId);
    return this.prisma.caseGroup.findMany({
      where: { caseId, case: { tenantId }, group: { tenantId } },
      include: {
        group: { select: { id: true, name: true, color: true, description: true } },
      },
    });
  }

  // Çağıran: CaseGroupController.assignGroup → POST /cases/:caseId/groups/:groupId.
  async assignGroupToCase(tenantId: string, caseId: string, groupId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCaseTenant(tx, tenantId, caseId);
      await this.assertGroupTenant(tx, tenantId, groupId);
      return tx.caseGroup.upsert({
        where: { caseId_groupId: { caseId, groupId } },
        update: {},
        create: { caseId, groupId, assignedById: userId },
      });
    });
  }

  // Çağıran: CaseGroupController.removeGroup → DELETE /cases/:caseId/groups/:groupId.
  async removeGroupFromCase(tenantId: string, caseId: string, groupId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertCaseTenant(tx, tenantId, caseId);
      await this.assertGroupTenant(tx, tenantId, groupId);
      return tx.caseGroup.delete({
        where: { caseId_groupId: { caseId, groupId } },
      });
    });
  }

  // Dış çağıranı yok; mevcut toplu atama servis sınırı, tenant bağlamı zorunlu.
  async assignGroupsToCases(tenantId: string, caseIds: string[], groupId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertGroupTenant(tx, tenantId, groupId);
      const ids = [...new Set(caseIds)];
      if (ids.some((id) => typeof id !== 'string' || !id)) throw new BadRequestException('Geçersiz dosya');
      const count = await tx.case.count({ where: { tenantId, id: { in: ids } } });
      if (count !== ids.length) throw new NotFoundException('Dosya bulunamadı');
      const data = caseIds.map((caseId) => ({
        caseId,
        groupId,
        assignedById: userId,
      }));
      return tx.caseGroup.createMany({
        data,
        skipDuplicates: true,
      });
    });
  }
}
