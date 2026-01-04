/**
 * ADMIN SERVICE (v12)
 * 
 * Recipe, params, UI map yönetimi.
 */

import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RecipeRegistryEntry,
  ParamsRegistryEntry,
  UIMapRegistryEntry,
  LockOverrideRequest,
  ChangeLogEntry,
  ApprovalWorkflow,
  AdminRole,
  ROLE_PERMISSIONS,
  PublishState,
} from '../config/admin-panel.config';
import { RECIPES, RECIPE_MAP } from '../recipes';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ==================== PERMISSION CHECK ====================

  checkPermission(role: AdminRole, permission: string): void {
    const permissions = ROLE_PERMISSIONS[role] || [];
    if (!permissions.includes(permission)) {
      throw new ForbiddenException(`Bu işlem için yetkiniz yok: ${permission}`);
    }
  }

  // ==================== RECIPE MANAGEMENT ====================

  async getRecipes(tenantId: string): Promise<RecipeRegistryEntry[]> {
    // Combine static recipes with DB overrides
    const dbRecipes = await this.prisma.icrabotRecipe.findMany({
      where: { tenantId },
      orderBy: { recipeId: 'asc' },
    });

    const dbRecipeMap = new Map(dbRecipes.map(r => [r.recipeId, r]));

    return RECIPES.map(recipe => {
      const dbOverride = dbRecipeMap.get(recipe.recipeId);
      return {
        recipeId: recipe.recipeId,
        version: dbOverride?.version || 1,
        stageTags: recipe.stageTags,
        scope: recipe.scope || 'case',
        triggerType: recipe.trigger.type,
        riskLevel: recipe.audit?.level || 'read_only',
        enabled: dbOverride?.enabled ?? recipe.isActive,
        publishState: (dbOverride?.publishState as PublishState) || 'active',
        yamlContent: dbOverride?.yamlContent || '',
        createdAt: dbOverride?.createdAt || new Date(),
        createdBy: dbOverride?.createdBy || 'system',
        approvedAt: dbOverride?.approvedAt,
        approvedBy: dbOverride?.approvedBy,
        activatedAt: dbOverride?.activatedAt,
        activatedBy: dbOverride?.activatedBy,
        tenantId,
      };
    });
  }

  async getRecipe(recipeId: string, tenantId: string): Promise<RecipeRegistryEntry> {
    const recipe = RECIPE_MAP.get(recipeId);
    if (!recipe) {
      throw new NotFoundException(`Recipe bulunamadı: ${recipeId}`);
    }

    const dbRecipe = await this.prisma.icrabotRecipe.findUnique({
      where: { recipeId_tenantId: { recipeId, tenantId } },
    });

    return {
      recipeId: recipe.recipeId,
      version: dbRecipe?.version || 1,
      stageTags: recipe.stageTags,
      scope: recipe.scope || 'case',
      triggerType: recipe.trigger.type,
      riskLevel: recipe.audit?.level || 'read_only',
      enabled: dbRecipe?.enabled ?? recipe.isActive,
      publishState: (dbRecipe?.publishState as PublishState) || 'active',
      yamlContent: dbRecipe?.yamlContent || '',
      createdAt: dbRecipe?.createdAt || new Date(),
      createdBy: dbRecipe?.createdBy || 'system',
      approvedAt: dbRecipe?.approvedAt,
      approvedBy: dbRecipe?.approvedBy,
      activatedAt: dbRecipe?.activatedAt,
      activatedBy: dbRecipe?.activatedBy,
      tenantId,
    };
  }

  async enableRecipe(recipeId: string, tenantId: string, userId: string): Promise<void> {
    await this.prisma.icrabotRecipe.upsert({
      where: { recipeId_tenantId: { recipeId, tenantId } },
      create: {
        recipeId,
        tenantId,
        enabled: true,
        version: 1,
        publishState: 'active',
        createdBy: userId,
        activatedAt: new Date(),
        activatedBy: userId,
      },
      update: {
        enabled: true,
        activatedAt: new Date(),
        activatedBy: userId,
      },
    });

    await this.logChange({
      entityType: 'recipe',
      entityId: recipeId,
      action: 'enable',
      performedBy: userId,
      tenantId,
    });
  }

  async disableRecipe(recipeId: string, tenantId: string, userId: string): Promise<void> {
    await this.prisma.icrabotRecipe.upsert({
      where: { recipeId_tenantId: { recipeId, tenantId } },
      create: {
        recipeId,
        tenantId,
        enabled: false,
        version: 1,
        publishState: 'active',
        createdBy: userId,
      },
      update: {
        enabled: false,
      },
    });

    await this.logChange({
      entityType: 'recipe',
      entityId: recipeId,
      action: 'disable',
      performedBy: userId,
      tenantId,
    });
  }

  async rollbackRecipe(recipeId: string, targetVersion: number, tenantId: string, userId: string): Promise<void> {
    const history = await this.prisma.icrabotRecipeHistory.findFirst({
      where: { recipeId, tenantId, version: targetVersion },
    });

    if (!history) {
      throw new NotFoundException(`Recipe version bulunamadı: ${recipeId} v${targetVersion}`);
    }

    await this.prisma.icrabotRecipe.update({
      where: { recipeId_tenantId: { recipeId, tenantId } },
      data: {
        yamlContent: history.yamlContent,
        version: targetVersion,
        activatedAt: new Date(),
        activatedBy: userId,
      },
    });

    await this.logChange({
      entityType: 'recipe',
      entityId: recipeId,
      action: 'rollback',
      newValue: JSON.stringify({ version: targetVersion }),
      performedBy: userId,
      tenantId,
    });
  }

  // ==================== PARAMS MANAGEMENT ====================

  async getParamsBundles(tenantId: string): Promise<ParamsRegistryEntry[]> {
    const bundles = await this.prisma.icrabotParams.findMany({
      where: { tenantId },
      orderBy: { bundleId: 'asc' },
    });

    return bundles.map(b => ({
      bundleId: b.bundleId,
      bundleType: b.bundleType as ParamsRegistryEntry['bundleType'],
      version: b.version,
      publishState: b.publishState as PublishState,
      content: b.content as Record<string, unknown>,
      overrides: b.overrides as Record<string, Record<string, unknown>>,
      createdAt: b.createdAt,
      createdBy: b.createdBy,
      approvedAt: b.approvedAt,
      approvedBy: b.approvedBy,
      activatedAt: b.activatedAt,
      activatedBy: b.activatedBy,
      tenantId,
    }));
  }

  async updateParamsBundle(
    bundleId: string,
    content: Record<string, unknown>,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const existing = await this.prisma.icrabotParams.findUnique({
      where: { bundleId_tenantId: { bundleId, tenantId } },
    });

    const newVersion = (existing?.version || 0) + 1;

    // Save to history
    if (existing) {
      await this.prisma.icrabotParamsHistory.create({
        data: {
          bundleId,
          tenantId,
          version: existing.version,
          content: existing.content,
          createdAt: existing.createdAt,
          createdBy: existing.createdBy,
        },
      });
    }

    await this.prisma.icrabotParams.upsert({
      where: { bundleId_tenantId: { bundleId, tenantId } },
      create: {
        bundleId,
        tenantId,
        bundleType: bundleId.split('_')[0],
        version: newVersion,
        publishState: 'draft',
        content,
        createdBy: userId,
      },
      update: {
        version: newVersion,
        publishState: 'draft',
        content,
      },
    });

    await this.logChange({
      entityType: 'params',
      entityId: bundleId,
      action: 'update',
      previousValue: existing ? JSON.stringify(existing.content) : undefined,
      newValue: JSON.stringify(content),
      performedBy: userId,
      tenantId,
    });
  }

  async approveParamsBundle(bundleId: string, tenantId: string, userId: string): Promise<void> {
    await this.prisma.icrabotParams.update({
      where: { bundleId_tenantId: { bundleId, tenantId } },
      data: {
        publishState: 'approved',
        approvedAt: new Date(),
        approvedBy: userId,
      },
    });

    await this.logChange({
      entityType: 'params',
      entityId: bundleId,
      action: 'approve',
      performedBy: userId,
      tenantId,
    });
  }

  async activateParamsBundle(bundleId: string, tenantId: string, userId: string): Promise<void> {
    const bundle = await this.prisma.icrabotParams.findUnique({
      where: { bundleId_tenantId: { bundleId, tenantId } },
    });

    if (!bundle || bundle.publishState !== 'approved') {
      throw new BadRequestException('Params bundle önce onaylanmalı');
    }

    await this.prisma.icrabotParams.update({
      where: { bundleId_tenantId: { bundleId, tenantId } },
      data: {
        publishState: 'active',
        activatedAt: new Date(),
        activatedBy: userId,
      },
    });

    await this.logChange({
      entityType: 'params',
      entityId: bundleId,
      action: 'activate',
      performedBy: userId,
      tenantId,
    });
  }

  // ==================== LOCK OVERRIDE ====================

  async requestLockOverride(
    lockType: string,
    caseId: string,
    reason: string,
    tenantId: string,
    userId: string,
  ): Promise<LockOverrideRequest> {
    const request = await this.prisma.icrabotLockOverrideRequest.create({
      data: {
        lockType,
        caseId,
        reason,
        requestedBy: userId,
        status: 'pending',
        tenantId,
      },
    });

    return {
      requestId: request.id,
      lockType: request.lockType,
      caseId: request.caseId,
      reason: request.reason,
      requestedBy: request.requestedBy,
      requestedAt: request.createdAt,
      status: 'pending',
      tenantId,
    };
  }

  async approveLockOverride(
    requestId: string,
    tenantId: string,
    userId: string,
    note?: string,
  ): Promise<void> {
    const request = await this.prisma.icrabotLockOverrideRequest.findFirst({
      where: { id: requestId, tenantId },
    });

    if (!request) {
      throw new NotFoundException('Override talebi bulunamadı');
    }

    await this.prisma.icrabotLockOverrideRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNote: note,
      },
    });

    // Remove the lock
    await this.prisma.icrabotLock.deleteMany({
      where: {
        lockType: request.lockType,
        caseId: request.caseId,
        tenantId,
      },
    });

    await this.logChange({
      entityType: 'lock',
      entityId: `${request.lockType}:${request.caseId}`,
      action: 'approve',
      performedBy: userId,
      tenantId,
    });
  }

  // ==================== CHANGE LOG ====================

  private async logChange(params: {
    entityType: ChangeLogEntry['entityType'];
    entityId: string;
    action: ChangeLogEntry['action'];
    previousValue?: string;
    newValue?: string;
    performedBy: string;
    tenantId: string;
  }): Promise<void> {
    await this.prisma.icrabotChangeLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        previousValue: params.previousValue,
        newValue: params.newValue,
        performedBy: params.performedBy,
        tenantId: params.tenantId,
      },
    });
  }

  async getChangeLog(
    tenantId: string,
    filters?: {
      entityType?: string;
      entityId?: string;
      performedBy?: string;
      from?: Date;
      to?: Date;
    },
  ): Promise<ChangeLogEntry[]> {
    const logs = await this.prisma.icrabotChangeLog.findMany({
      where: {
        tenantId,
        ...(filters?.entityType && { entityType: filters.entityType }),
        ...(filters?.entityId && { entityId: filters.entityId }),
        ...(filters?.performedBy && { performedBy: filters.performedBy }),
        ...(filters?.from && { performedAt: { gte: filters.from } }),
        ...(filters?.to && { performedAt: { lte: filters.to } }),
      },
      orderBy: { performedAt: 'desc' },
      take: 100,
    });

    return logs.map(log => ({
      changeId: log.id,
      entityType: log.entityType as ChangeLogEntry['entityType'],
      entityId: log.entityId,
      action: log.action as ChangeLogEntry['action'],
      previousValue: log.previousValue,
      newValue: log.newValue,
      performedBy: log.performedBy,
      performedAt: log.performedAt,
      tenantId: log.tenantId,
    }));
  }
}
