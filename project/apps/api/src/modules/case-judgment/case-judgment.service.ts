import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NafakaType } from '@prisma/client';

export interface CreateJudgmentDto {
  caseId: string;
  // Mahkeme bilgileri
  courtName: string;
  courtCity?: string;
  courtType?: string;
  caseNo?: string;
  decisionNo?: string;
  decisionDate: string;
  finalizationDate?: string;
  finalizationNote?: string;
  // Karar icerigi
  judgmentAmount?: number;
  currency?: string;
  judgmentSummary?: string;
  // Faiz
  interestRate?: number;
  interestStartDate?: string;
  // Kesinlesme
  requiresFinalization?: boolean;
  isFinalized?: boolean;
  // Nafaka (varsa)
  nafakaType?: NafakaType;
  monthlyNafaka?: number;
  nafakaStartDate?: string;
  // Diger
  notes?: string;
}

export interface UpdateJudgmentDto extends Partial<CreateJudgmentDto> {}

@Injectable()
export class CaseJudgmentService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateJudgmentDto) {
    // Case'in tenant'a ait olduğunu kontrol et
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
    });
    if (!caseRecord) {
      throw new NotFoundException('Dosya bulunamadi');
    }

    return this.prisma.caseJudgment.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        courtName: dto.courtName,
        courtCity: dto.courtCity,
        courtType: dto.courtType,
        caseNo: dto.caseNo,
        decisionNo: dto.decisionNo,
        decisionDate: new Date(dto.decisionDate),
        finalizationDate: dto.finalizationDate ? new Date(dto.finalizationDate) : null,
        finalizationNote: dto.finalizationNote,
        judgmentAmount: dto.judgmentAmount,
        currency: dto.currency || 'TRY',
        judgmentSummary: dto.judgmentSummary,
        interestRate: dto.interestRate,
        interestStartDate: dto.interestStartDate ? new Date(dto.interestStartDate) : null,
        requiresFinalization: dto.requiresFinalization || false,
        isFinalized: dto.isFinalized || false,
        nafakaType: dto.nafakaType,
        monthlyNafaka: dto.monthlyNafaka,
        nafakaStartDate: dto.nafakaStartDate ? new Date(dto.nafakaStartDate) : null,
        notes: dto.notes,
      },
    });
  }

  async findByCase(tenantId: string, caseId: string) {
    return this.prisma.caseJudgment.findFirst({
      where: { tenantId, caseId },
    });
  }

  async findOne(tenantId: string, id: string) {
    const judgment = await this.prisma.caseJudgment.findFirst({
      where: { id, tenantId },
    });
    if (!judgment) {
      throw new NotFoundException('Ilam bulunamadi');
    }
    return judgment;
  }

  async update(tenantId: string, id: string, dto: UpdateJudgmentDto) {
    await this.findOne(tenantId, id);

    return this.prisma.caseJudgment.update({
      where: { id },
      data: {
        ...(dto.courtName && { courtName: dto.courtName }),
        ...(dto.courtCity !== undefined && { courtCity: dto.courtCity }),
        ...(dto.courtType !== undefined && { courtType: dto.courtType }),
        ...(dto.caseNo !== undefined && { caseNo: dto.caseNo }),
        ...(dto.decisionNo !== undefined && { decisionNo: dto.decisionNo }),
        ...(dto.decisionDate && { decisionDate: new Date(dto.decisionDate) }),
        ...(dto.finalizationDate !== undefined && { finalizationDate: dto.finalizationDate ? new Date(dto.finalizationDate) : null }),
        ...(dto.finalizationNote !== undefined && { finalizationNote: dto.finalizationNote }),
        ...(dto.judgmentAmount !== undefined && { judgmentAmount: dto.judgmentAmount }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.judgmentSummary !== undefined && { judgmentSummary: dto.judgmentSummary }),
        ...(dto.interestRate !== undefined && { interestRate: dto.interestRate }),
        ...(dto.interestStartDate !== undefined && { interestStartDate: dto.interestStartDate ? new Date(dto.interestStartDate) : null }),
        ...(dto.requiresFinalization !== undefined && { requiresFinalization: dto.requiresFinalization }),
        ...(dto.isFinalized !== undefined && { isFinalized: dto.isFinalized }),
        ...(dto.nafakaType !== undefined && { nafakaType: dto.nafakaType }),
        ...(dto.monthlyNafaka !== undefined && { monthlyNafaka: dto.monthlyNafaka }),
        ...(dto.nafakaStartDate !== undefined && { nafakaStartDate: dto.nafakaStartDate ? new Date(dto.nafakaStartDate) : null }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.caseJudgment.delete({ where: { id } });
  }

  // Toplam ilam tutari hesapla
  async calculateTotalAmount(tenantId: string, caseId: string) {
    const judgment = await this.findByCase(tenantId, caseId);
    if (!judgment) return { total: 0 };

    return {
      total: Number(judgment.judgmentAmount) || 0,
      judgmentAmount: Number(judgment.judgmentAmount) || 0,
      monthlyNafaka: Number(judgment.monthlyNafaka) || 0,
    };
  }
}
