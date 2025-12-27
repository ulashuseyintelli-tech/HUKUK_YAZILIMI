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
  leaseStartDate: string;
  leaseEndDate?: string;
  monthlyRent: number;
  rentCurrency?: string;
  depositAmount?: number;
  // Tahliye bilgileri
  evictionReason?: EvictionReason;
  evictionNoticeDate?: string;
  evictionDeadline?: string;
  // Kira borcu
  unpaidMonths?: number;
  unpaidRentTotal?: number;
  lastPaymentDate?: string;
  // Diger
  landlordName?: string;
  landlordIdentityNo?: string;
  tenantName?: string;
  tenantIdentityNo?: string;
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
        leaseStartDate: new Date(dto.leaseStartDate),
        leaseEndDate: dto.leaseEndDate ? new Date(dto.leaseEndDate) : null,
        monthlyRent: dto.monthlyRent,
        rentCurrency: dto.rentCurrency || 'TRY',
        depositAmount: dto.depositAmount,
        evictionReason: dto.evictionReason,
        evictionNoticeDate: dto.evictionNoticeDate ? new Date(dto.evictionNoticeDate) : null,
        evictionDeadline: dto.evictionDeadline ? new Date(dto.evictionDeadline) : null,
        unpaidMonths: dto.unpaidMonths,
        unpaidRentTotal: dto.unpaidRentTotal,
        lastPaymentDate: dto.lastPaymentDate ? new Date(dto.lastPaymentDate) : null,
        landlordName: dto.landlordName,
        landlordIdentityNo: dto.landlordIdentityNo,
        tenantName: dto.tenantName,
        tenantIdentityNo: dto.tenantIdentityNo,
        notes: dto.notes,
        createdById: userId,
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
        ...(dto.leaseStartDate && { leaseStartDate: new Date(dto.leaseStartDate) }),
        ...(dto.leaseEndDate !== undefined && { leaseEndDate: dto.leaseEndDate ? new Date(dto.leaseEndDate) : null }),
        ...(dto.monthlyRent !== undefined && { monthlyRent: dto.monthlyRent }),
        ...(dto.rentCurrency && { rentCurrency: dto.rentCurrency }),
        ...(dto.depositAmount !== undefined && { depositAmount: dto.depositAmount }),
        ...(dto.evictionReason !== undefined && { evictionReason: dto.evictionReason }),
        ...(dto.evictionNoticeDate !== undefined && { evictionNoticeDate: dto.evictionNoticeDate ? new Date(dto.evictionNoticeDate) : null }),
        ...(dto.evictionDeadline !== undefined && { evictionDeadline: dto.evictionDeadline ? new Date(dto.evictionDeadline) : null }),
        ...(dto.unpaidMonths !== undefined && { unpaidMonths: dto.unpaidMonths }),
        ...(dto.unpaidRentTotal !== undefined && { unpaidRentTotal: dto.unpaidRentTotal }),
        ...(dto.lastPaymentDate !== undefined && { lastPaymentDate: dto.lastPaymentDate ? new Date(dto.lastPaymentDate) : null }),
        ...(dto.landlordName !== undefined && { landlordName: dto.landlordName }),
        ...(dto.landlordIdentityNo !== undefined && { landlordIdentityNo: dto.landlordIdentityNo }),
        ...(dto.tenantName !== undefined && { tenantName: dto.tenantName }),
        ...(dto.tenantIdentityNo !== undefined && { tenantIdentityNo: dto.tenantIdentityNo }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.caseLease.delete({ where: { id } });
  }

  // Toplam kira borcu hesapla
  async calculateTotalDebt(tenantId: string, caseId: string) {
    const lease = await this.findByCase(tenantId, caseId);
    if (!lease) return { total: 0, months: 0 };

    return {
      total: Number(lease.unpaidRentTotal) || 0,
      months: lease.unpaidMonths || 0,
      monthlyRent: Number(lease.monthlyRent),
    };
  }
}
