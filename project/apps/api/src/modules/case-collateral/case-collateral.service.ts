import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CollateralType } from '@prisma/client';

export interface CreateCollateralDto {
  caseId: string;
  collateralType: CollateralType;
  description: string;
  // Tasinmaz (Ipotek)
  propertyType?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyDistrict?: string;
  tapuInfo?: string;
  // Tasınır (Taşıt Rehni)
  vehiclePlate?: string;
  vehicleType?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleYear?: number;
  // Deger bilgileri
  collateralAmount?: number;
  currency?: string;
  rank?: number;
  // Rehin veren
  pledgorName?: string;
  pledgorIdentity?: string;
  isPledgorDebtor?: boolean;
  // Tescil bilgileri
  registrationDate?: string;
  registrationNo?: string;
  registrationOffice?: string;
  // Diger
  notes?: string;
}

export interface UpdateCollateralDto extends Partial<CreateCollateralDto> {}

@Injectable()
export class CaseCollateralService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateCollateralDto) {
    // Case'in tenant'a ait olduğunu kontrol et
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
    });
    if (!caseRecord) {
      throw new NotFoundException('Dosya bulunamadi');
    }

    return this.prisma.caseCollateral.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        collateralType: dto.collateralType,
        description: dto.description,
        propertyType: dto.propertyType,
        propertyAddress: dto.propertyAddress,
        propertyCity: dto.propertyCity,
        propertyDistrict: dto.propertyDistrict,
        tapuInfo: dto.tapuInfo,
        vehiclePlate: dto.vehiclePlate,
        vehicleType: dto.vehicleType,
        vehicleBrand: dto.vehicleBrand,
        vehicleModel: dto.vehicleModel,
        vehicleYear: dto.vehicleYear,
        collateralAmount: dto.collateralAmount,
        currency: dto.currency || 'TRY',
        rank: dto.rank || 1,
        pledgorName: dto.pledgorName,
        pledgorIdentity: dto.pledgorIdentity,
        isPledgorDebtor: dto.isPledgorDebtor ?? true,
        registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : null,
        registrationNo: dto.registrationNo,
        registrationOffice: dto.registrationOffice,
        notes: dto.notes,
      },
    });
  }

  async findAllByCase(tenantId: string, caseId: string) {
    return this.prisma.caseCollateral.findMany({
      where: { tenantId, caseId },
      orderBy: { rank: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const collateral = await this.prisma.caseCollateral.findFirst({
      where: { id, tenantId },
    });
    if (!collateral) {
      throw new NotFoundException('Teminat bulunamadi');
    }
    return collateral;
  }

  async update(tenantId: string, id: string, dto: UpdateCollateralDto) {
    await this.findOne(tenantId, id);

    return this.prisma.caseCollateral.update({
      where: { id },
      data: {
        ...(dto.collateralType && { collateralType: dto.collateralType }),
        ...(dto.description && { description: dto.description }),
        ...(dto.propertyType !== undefined && { propertyType: dto.propertyType }),
        ...(dto.propertyAddress !== undefined && { propertyAddress: dto.propertyAddress }),
        ...(dto.propertyCity !== undefined && { propertyCity: dto.propertyCity }),
        ...(dto.propertyDistrict !== undefined && { propertyDistrict: dto.propertyDistrict }),
        ...(dto.tapuInfo !== undefined && { tapuInfo: dto.tapuInfo }),
        ...(dto.vehiclePlate !== undefined && { vehiclePlate: dto.vehiclePlate }),
        ...(dto.vehicleType !== undefined && { vehicleType: dto.vehicleType }),
        ...(dto.vehicleBrand !== undefined && { vehicleBrand: dto.vehicleBrand }),
        ...(dto.vehicleModel !== undefined && { vehicleModel: dto.vehicleModel }),
        ...(dto.vehicleYear !== undefined && { vehicleYear: dto.vehicleYear }),
        ...(dto.collateralAmount !== undefined && { collateralAmount: dto.collateralAmount }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.rank !== undefined && { rank: dto.rank }),
        ...(dto.pledgorName !== undefined && { pledgorName: dto.pledgorName }),
        ...(dto.pledgorIdentity !== undefined && { pledgorIdentity: dto.pledgorIdentity }),
        ...(dto.isPledgorDebtor !== undefined && { isPledgorDebtor: dto.isPledgorDebtor }),
        ...(dto.registrationDate !== undefined && { registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : null }),
        ...(dto.registrationNo !== undefined && { registrationNo: dto.registrationNo }),
        ...(dto.registrationOffice !== undefined && { registrationOffice: dto.registrationOffice }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.caseCollateral.delete({ where: { id } });
  }

  // Toplam teminat degeri
  async getTotalValue(tenantId: string, caseId: string) {
    const collaterals = await this.findAllByCase(tenantId, caseId);
    const totalAmount = collaterals.reduce((sum, c) => sum + (Number(c.collateralAmount) || 0), 0);
    return { totalAmount, count: collaterals.length };
  }
}
