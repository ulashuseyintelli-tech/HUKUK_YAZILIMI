import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CollateralType } from '@prisma/client';

export interface CreateCollateralDto {
  caseId: string;
  collateralType: CollateralType;
  description: string;
  // Tasinmaz (Ipotek)
  tapuInfo?: string;
  parcelNo?: string;
  blockNo?: string;
  propertyAddress?: string;
  propertyCity?: string;
  propertyDistrict?: string;
  // Tasınır (Rehin)
  vehiclePlate?: string;
  vehicleInfo?: string;
  serialNumber?: string;
  // Deger bilgileri
  estimatedValue?: number;
  mortgageAmount?: number;
  mortgageRank?: number;
  currency?: string;
  // Tescil bilgileri
  registrationDate?: string;
  registrationNo?: string;
  notaryName?: string;
  notaryCity?: string;
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
        tapuInfo: dto.tapuInfo,
        parcelNo: dto.parcelNo,
        blockNo: dto.blockNo,
        propertyAddress: dto.propertyAddress,
        propertyCity: dto.propertyCity,
        propertyDistrict: dto.propertyDistrict,
        vehiclePlate: dto.vehiclePlate,
        vehicleInfo: dto.vehicleInfo,
        serialNumber: dto.serialNumber,
        estimatedValue: dto.estimatedValue,
        mortgageAmount: dto.mortgageAmount,
        mortgageRank: dto.mortgageRank,
        currency: dto.currency || 'TRY',
        registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : null,
        registrationNo: dto.registrationNo,
        notaryName: dto.notaryName,
        notaryCity: dto.notaryCity,
        notes: dto.notes,
        createdById: userId,
      },
    });
  }

  async findAllByCase(tenantId: string, caseId: string) {
    return this.prisma.caseCollateral.findMany({
      where: { tenantId, caseId },
      orderBy: { mortgageRank: 'asc' },
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
        ...(dto.tapuInfo !== undefined && { tapuInfo: dto.tapuInfo }),
        ...(dto.parcelNo !== undefined && { parcelNo: dto.parcelNo }),
        ...(dto.blockNo !== undefined && { blockNo: dto.blockNo }),
        ...(dto.propertyAddress !== undefined && { propertyAddress: dto.propertyAddress }),
        ...(dto.propertyCity !== undefined && { propertyCity: dto.propertyCity }),
        ...(dto.propertyDistrict !== undefined && { propertyDistrict: dto.propertyDistrict }),
        ...(dto.vehiclePlate !== undefined && { vehiclePlate: dto.vehiclePlate }),
        ...(dto.vehicleInfo !== undefined && { vehicleInfo: dto.vehicleInfo }),
        ...(dto.serialNumber !== undefined && { serialNumber: dto.serialNumber }),
        ...(dto.estimatedValue !== undefined && { estimatedValue: dto.estimatedValue }),
        ...(dto.mortgageAmount !== undefined && { mortgageAmount: dto.mortgageAmount }),
        ...(dto.mortgageRank !== undefined && { mortgageRank: dto.mortgageRank }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.registrationDate !== undefined && { registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : null }),
        ...(dto.registrationNo !== undefined && { registrationNo: dto.registrationNo }),
        ...(dto.notaryName !== undefined && { notaryName: dto.notaryName }),
        ...(dto.notaryCity !== undefined && { notaryCity: dto.notaryCity }),
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
    const totalEstimated = collaterals.reduce((sum, c) => sum + (Number(c.estimatedValue) || 0), 0);
    const totalMortgage = collaterals.reduce((sum, c) => sum + (Number(c.mortgageAmount) || 0), 0);
    return { totalEstimated, totalMortgage, count: collaterals.length };
  }
}
