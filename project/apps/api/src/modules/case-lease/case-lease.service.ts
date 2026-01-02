import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PropertyType, EvictionReason } from '@prisma/client';

export interface CreateLeaseDto {
  caseId: string;
  propertyType: PropertyType;
  propertyAddress: string;
  propertyCity?: string;
  propertyDistrict?: string;
  // Sozlesme bilgileri
  startDate: string;
  endDate?: string;
  monthlyRent: number;
  currency?: string;
  paymentDay?: number;
  // Tahliye bilgileri
  evictionReason?: EvictionReason;
  evictionNoticeDate?: string;
  evictionCommitmentDate?: string;
  // Taraflar
  landlordName?: string;
  landlordIdentity?: string;
  tenantName?: string;
  tenantIdentity?: string;
  // Diger
  rentPeriods?: any;
  notes?: string;
}

export interface UpdateLeaseDto extends Partial<CreateLeaseDto> {}

@Injectable()
export class CaseLeaseService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateLeaseDto) {
    // Case'in tenant'a ait olduğunu kontrol et
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
    });
    if (!caseRecord) {
      throw new NotFoundException('Dosya bulunamadi');
    }

    return this.prisma.caseLease.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        propertyType: dto.propertyType,
        propertyAddress: dto.propertyAddress,
        propertyCity: dto.propertyCity,
        propertyDistrict: dto.propertyDistrict,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        monthlyRent: dto.monthlyRent,
        currency: dto.currency || 'TRY',
        paymentDay: dto.paymentDay,
        evictionReason: dto.evictionReason,
        evictionNoticeDate: dto.evictionNoticeDate ? new Date(dto.evictionNoticeDate) : null,
        evictionCommitmentDate: dto.evictionCommitmentDate ? new Date(dto.evictionCommitmentDate) : null,
        landlordName: dto.landlordName,
        landlordIdentity: dto.landlordIdentity,
        tenantName: dto.tenantName,
        tenantIdentity: dto.tenantIdentity,
        rentPeriods: dto.rentPeriods,
        notes: dto.notes,
      },
    });
  }

  async findByCase(tenantId: string, caseId: string) {
    return this.prisma.caseLease.findFirst({
      where: { tenantId, caseId },
    });
  }

  async findOne(tenantId: string, id: string) {
    const lease = await this.prisma.caseLease.findFirst({
      where: { id, tenantId },
    });
    if (!lease) {
      throw new NotFoundException('Kira sozlesmesi bulunamadi');
    }
    return lease;
  }

  async update(tenantId: string, id: string, dto: UpdateLeaseDto) {
    await this.findOne(tenantId, id);

    return this.prisma.caseLease.update({
      where: { id },
      data: {
        ...(dto.propertyType && { propertyType: dto.propertyType }),
        ...(dto.propertyAddress && { propertyAddress: dto.propertyAddress }),
        ...(dto.propertyCity !== undefined && { propertyCity: dto.propertyCity }),
        ...(dto.propertyDistrict !== undefined && { propertyDistrict: dto.propertyDistrict }),
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
        ...(dto.monthlyRent !== undefined && { monthlyRent: dto.monthlyRent }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.paymentDay !== undefined && { paymentDay: dto.paymentDay }),
        ...(dto.evictionReason !== undefined && { evictionReason: dto.evictionReason }),
        ...(dto.evictionNoticeDate !== undefined && { evictionNoticeDate: dto.evictionNoticeDate ? new Date(dto.evictionNoticeDate) : null }),
        ...(dto.evictionCommitmentDate !== undefined && { evictionCommitmentDate: dto.evictionCommitmentDate ? new Date(dto.evictionCommitmentDate) : null }),
        ...(dto.landlordName !== undefined && { landlordName: dto.landlordName }),
        ...(dto.landlordIdentity !== undefined && { landlordIdentity: dto.landlordIdentity }),
        ...(dto.tenantName !== undefined && { tenantName: dto.tenantName }),
        ...(dto.tenantIdentity !== undefined && { tenantIdentity: dto.tenantIdentity }),
        ...(dto.rentPeriods !== undefined && { rentPeriods: dto.rentPeriods }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.caseLease.delete({ where: { id } });
  }

  // Toplam kira borcu hesapla (rentPeriods JSON'dan)
  async calculateTotalDebt(tenantId: string, caseId: string) {
    const lease = await this.findByCase(tenantId, caseId);
    if (!lease) return { total: 0, months: 0 };

    // rentPeriods JSON array'inden hesapla
    const periods = (lease.rentPeriods as any[]) || [];
    const unpaidPeriods = periods.filter((p: any) => !p.isPaid);
    const total = unpaidPeriods.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);

    return {
      total,
      months: unpaidPeriods.length,
      monthlyRent: Number(lease.monthlyRent),
    };
  }
}
