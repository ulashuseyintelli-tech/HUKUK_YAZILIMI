/**
 * BUNDLE SERVICE (v14-v16)
 * 
 * DB-backed Recipe/Params/UiMap bundle yönetimi.
 * Draft → Approved → Active yayınlama modeli.
 */

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as yaml from 'js-yaml';
import * as crypto from 'crypto';

export type BundleType = 'recipe' | 'params' | 'uimap';
export type BundleStatus = 'draft' | 'approved' | 'active' | 'archived';

export interface BundleContent {
  recipes?: any[];
  params?: Record<string, any>;
  screens?: any[];
  [key: string]: any;
}

export interface Bundle {
  id: string;
  type: BundleType;
  name: string;
  version: number;
  status: BundleStatus;
  content: BundleContent;
  contentHash: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  tenantId: string;
}

@Injectable()
export class BundleService {
  constructor(private prisma: PrismaService) {}

  // ==================== BUNDLE CRUD ====================

  async createBundle(
    type: BundleType,
    name: string,
    content: string,
    tenantId: string,
    userId: string,
    notes?: string,
  ): Promise<Bundle> {
    const parsed = this.parseContent(content);
    const contentHash = this.hashContent(content);

    const bundle = await this.prisma.icrabotBundle.create({
      data: {
        type,
        name,
        version: 1,
        status: 'draft',
        content: parsed,
        contentHash,
        notes,
        createdBy: userId,
        tenantId,
      },
    });

    return this.mapBundle(bundle);
  }

  async updateBundle(
    id: string,
    content: string,
    tenantId: string,
    userId: string,
    notes?: string,
  ): Promise<Bundle> {
    const existing = await this.prisma.icrabotBundle.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Bundle bulunamadı');
    }

    if (existing.status === 'active') {
      throw new BadRequestException('Aktif bundle güncellenemez. Yeni versiyon oluşturun.');
    }

    const parsed = this.parseContent(content);
    const contentHash = this.hashContent(content);

    const bundle = await this.prisma.icrabotBundle.update({
      where: { id },
      data: {
        content: parsed,
        contentHash,
        notes,
        status: 'draft', // Reset to draft on update
      },
    });

    return this.mapBundle(bundle);
  }

  async getBundles(
    tenantId: string,
    type?: BundleType,
    status?: BundleStatus,
  ): Promise<Bundle[]> {
    const bundles = await this.prisma.icrabotBundle.findMany({
      where: {
        tenantId,
        ...(type && { type }),
        ...(status && { status }),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { version: 'desc' }],
    });

    return bundles.map(this.mapBundle);
  }

  async getBundle(id: string, tenantId: string): Promise<Bundle> {
    const bundle = await this.prisma.icrabotBundle.findFirst({
      where: { id, tenantId },
    });

    if (!bundle) {
      throw new NotFoundException('Bundle bulunamadı');
    }

    return this.mapBundle(bundle);
  }

  async getActiveBundle(type: BundleType, tenantId: string): Promise<Bundle | null> {
    const bundle = await this.prisma.icrabotBundle.findFirst({
      where: { type, status: 'active', tenantId },
      orderBy: { version: 'desc' },
    });

    return bundle ? this.mapBundle(bundle) : null;
  }

  // ==================== BUNDLE LIFECYCLE ====================

  async approveBundle(id: string, tenantId: string, userId: string): Promise<Bundle> {
    const bundle = await this.prisma.icrabotBundle.findFirst({
      where: { id, tenantId },
    });

    if (!bundle) {
      throw new NotFoundException('Bundle bulunamadı');
    }

    if (bundle.status !== 'draft') {
      throw new BadRequestException('Sadece draft bundle onaylanabilir');
    }

    // Validate bundle content
    await this.validateBundle(bundle.type as BundleType, bundle.content as BundleContent);

    const updated = await this.prisma.icrabotBundle.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: userId,
      },
    });

    return this.mapBundle(updated);
  }

  async promoteBundle(id: string, tenantId: string, userId: string): Promise<Bundle> {
    const bundle = await this.prisma.icrabotBundle.findFirst({
      where: { id, tenantId },
    });

    if (!bundle) {
      throw new NotFoundException('Bundle bulunamadı');
    }

    if (bundle.status !== 'approved') {
      throw new BadRequestException('Sadece onaylanmış bundle aktif edilebilir');
    }

    // Archive current active bundle of same type
    await this.prisma.icrabotBundle.updateMany({
      where: {
        type: bundle.type,
        status: 'active',
        tenantId,
        id: { not: id },
      },
      data: { status: 'archived' },
    });

    const updated = await this.prisma.icrabotBundle.update({
      where: { id },
      data: {
        status: 'active',
        activatedAt: new Date(),
        activatedBy: userId,
      },
    });

    return this.mapBundle(updated);
  }

  async archiveBundle(id: string, tenantId: string): Promise<Bundle> {
    const bundle = await this.prisma.icrabotBundle.findFirst({
      where: { id, tenantId },
    });

    if (!bundle) {
      throw new NotFoundException('Bundle bulunamadı');
    }

    if (bundle.status === 'active') {
      throw new BadRequestException('Aktif bundle arşivlenemez. Önce başka bir bundle aktif edin.');
    }

    const updated = await this.prisma.icrabotBundle.update({
      where: { id },
      data: { status: 'archived' },
    });

    return this.mapBundle(updated);
  }

  async cloneBundle(id: string, tenantId: string, userId: string, newName?: string): Promise<Bundle> {
    const source = await this.prisma.icrabotBundle.findFirst({
      where: { id, tenantId },
    });

    if (!source) {
      throw new NotFoundException('Bundle bulunamadı');
    }

    // Find max version for this name
    const maxVersion = await this.prisma.icrabotBundle.aggregate({
      where: { name: newName || source.name, tenantId },
      _max: { version: true },
    });

    const newVersion = (maxVersion._max.version || 0) + 1;

    const bundle = await this.prisma.icrabotBundle.create({
      data: {
        type: source.type,
        name: newName || source.name,
        version: newVersion,
        status: 'draft',
        content: source.content,
        contentHash: source.contentHash,
        notes: `Cloned from ${source.name} v${source.version}`,
        createdBy: userId,
        tenantId,
      },
    });

    return this.mapBundle(bundle);
  }

  // ==================== VALIDATION ====================

  async validateBundle(type: BundleType, content: BundleContent): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    switch (type) {
      case 'recipe':
        if (!content.recipes || !Array.isArray(content.recipes)) {
          errors.push('Recipe bundle must contain "recipes" array');
        } else {
          for (const recipe of content.recipes) {
            if (!recipe.recipe_id) {
              errors.push(`Recipe missing recipe_id`);
            }
          }
        }
        break;

      case 'params':
        // Params can have any structure
        break;

      case 'uimap':
        if (!content.screens || !Array.isArray(content.screens)) {
          errors.push('UI Map bundle must contain "screens" array');
        }
        break;
    }

    if (errors.length > 0) {
      throw new BadRequestException({ errors });
    }

    return { valid: true, errors: [] };
  }

  async validateAllActiveBundles(tenantId: string): Promise<{ valid: boolean; results: Record<BundleType, { valid: boolean; errors: string[] }> }> {
    const types: BundleType[] = ['recipe', 'params', 'uimap'];
    const results: Record<string, { valid: boolean; errors: string[] }> = {};
    let allValid = true;

    for (const type of types) {
      const bundle = await this.getActiveBundle(type, tenantId);
      if (!bundle) {
        results[type] = { valid: false, errors: [`No active ${type} bundle`] };
        allValid = false;
      } else {
        try {
          const validation = await this.validateBundle(type, bundle.content);
          results[type] = validation;
        } catch (e: any) {
          results[type] = { valid: false, errors: e.response?.errors || [e.message] };
          allValid = false;
        }
      }
    }

    return { valid: allValid, results: results as any };
  }

  // ==================== HELPERS ====================

  private parseContent(content: string): BundleContent {
    try {
      // Try YAML first
      return yaml.load(content) as BundleContent;
    } catch {
      try {
        // Try JSON
        return JSON.parse(content);
      } catch {
        throw new BadRequestException('Invalid content format. Must be valid YAML or JSON.');
      }
    }
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private mapBundle(bundle: any): Bundle {
    return {
      id: bundle.id,
      type: bundle.type as BundleType,
      name: bundle.name,
      version: bundle.version,
      status: bundle.status as BundleStatus,
      content: bundle.content as BundleContent,
      contentHash: bundle.contentHash,
      notes: bundle.notes,
      createdAt: bundle.createdAt,
      updatedAt: bundle.updatedAt,
      createdBy: bundle.createdBy,
      tenantId: bundle.tenantId,
    };
  }
}
