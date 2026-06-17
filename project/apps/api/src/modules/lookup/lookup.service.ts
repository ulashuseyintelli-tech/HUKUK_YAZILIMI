import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type LookupType = 'takipTuru' | 'asama' | 'risk' | 'borcluTipi' | 'durumEtiketi' | 'mahiyetTipi';

@Injectable()
export class LookupService {
  constructor(private prisma: PrismaService) {}

  private getModel(type: LookupType) {
    const models: Record<LookupType, any> = {
      takipTuru: this.prisma.lookupTakipTuru,
      asama: this.prisma.lookupAsama,
      risk: this.prisma.lookupRisk,
      borcluTipi: this.prisma.lookupBorcluTipi,
      durumEtiketi: this.prisma.lookupDurumEtiketi,
      mahiyetTipi: this.prisma.lookupMahiyetTipi,
    };
    const model = models[type];
    if (!model) throw new BadRequestException(`Geçersiz lookup tipi: ${type}`);
    return model;
  }

  async findAll(tenantId: string, type: LookupType, includeInactive = false) {
    const model = this.getModel(type) as any;
    
    // Takip türü için varsayılan değerleri de getir
    if (type === 'takipTuru') {
      return this.prisma.lookupTakipTuru.findMany({
        where: {
          tenantId,
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          sortOrder: true,
          isActive: true,
          defaultMahiyetTipiId: true,
          defaultBorcluTipiId: true,
        },
      });
    }
    
    return model.findMany({
      where: {
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(tenantId: string, type: LookupType, id: string) {
    const model = this.getModel(type) as any;
    const item = await model.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(`${type} bulunamadı`);
    return item;
  }

  async create(tenantId: string, type: LookupType, data: any) {
    const model = this.getModel(type) as any;

    // RFA-005: soft-delete + @@unique([tenantId, code]) çakışması. Silinen (isActive=false) bir code
    // yeniden create edilince eskiden Prisma P2002 → ham 500 oluyordu. (tenantId, code) ile inactive
    // dahil mevcut kaydı ara:
    //  - active varsa → 409 ConflictException (sessiz overwrite YOK)
    //  - soft-deleted varsa → AYNI id'yi reactivate + editable alanları yeni payload ile güncelle
    //  - hiç yoksa → düz create (mevcut davranış)
    // code ve tenantId DEĞİŞMEZ. Generic servis tek-kaynak → 6 lookup modelini birden kapsar.
    if (data?.code) {
      const existing = await model.findFirst({ where: { tenantId, code: data.code } });
      if (existing) {
        if (existing.isActive) {
          throw new ConflictException({
            code: 'DUPLICATE_LOOKUP_CODE',
            message: `Bu kod (${data.code}) zaten kayıtlı`,
            existingId: existing.id,
          });
        }
        // soft-deleted → reactivate. code/tenantId/id güncellenmez; editable alanlar yeni payload'tan.
        const { code: _code, tenantId: _tenantId, id: _id, isActive: _isActive, ...editable } = data;
        return model.update({
          where: { id: existing.id },
          data: { ...editable, isActive: true },
        });
      }
    }

    return model.create({
      data: { ...data, tenantId },
    });
  }

  async update(tenantId: string, type: LookupType, id: string, data: any) {
    await this.findOne(tenantId, type, id);
    const model = this.getModel(type) as any;
    return model.update({
      where: { id },
      data,
    });
  }


  async delete(tenantId: string, type: LookupType, id: string) {
    await this.findOne(tenantId, type, id);
    const model = this.getModel(type) as any;
    // Soft delete - sadece isActive false yap
    return model.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // Tüm lookup tiplerini tek seferde getir (frontend için)
  async getAllLookups(tenantId: string) {
    const [takipTuru, asama, risk, borcluTipi, durumEtiketi, mahiyetTipi] = await Promise.all([
      this.findAll(tenantId, 'takipTuru'),
      this.findAll(tenantId, 'asama'),
      this.findAll(tenantId, 'risk'),
      this.findAll(tenantId, 'borcluTipi'),
      this.findAll(tenantId, 'durumEtiketi'),
      this.findAll(tenantId, 'mahiyetTipi'),
    ]);
    return { takipTuru, asama, risk, borcluTipi, durumEtiketi, mahiyetTipi };
  }
}
