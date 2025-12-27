import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InstrumentType } from '@prisma/client';

export interface CreateInstrumentDto {
  caseId: string;
  instrumentType: InstrumentType;
  serialNo: string;
  issueDate: string;
  maturityDate: string;
  amount: number;
  currency?: string;
  // Cek alanlari
  bankName?: string;
  branchName?: string;
  accountNo?: string;
  checkNo?: string;
  drawerName?: string;
  drawerIdentityNo?: string;
  endorserName?: string;
  endorserIdentityNo?: string;
  // Senet alanlari
  issuerName?: string;
  issuerIdentityNo?: string;
  issuerAddress?: string;
  payeeName?: string;
  payeeIdentityNo?: string;
  guarantorName?: string;
  guarantorIdentityNo?: string;
  // Ortak alanlar
  protestDate?: string;
  protestNo?: string;
  notes?: string;
}

export interface UpdateInstrumentDto extends Partial<CreateInstrumentDto> {}

@Injectable()
export class CaseInstrumentService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateInstrumentDto) {
    // Case'in tenant'a ait olduğunu kontrol et
    const caseRecord = await this.prisma.case.findFirst({
      where: { id: dto.caseId, tenantId },
    });
    if (!caseRecord) {
      throw new NotFoundException('Dosya bulunamadi');
    }

    return this.prisma.caseInstrument.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        instrumentType: dto.instrumentType,
        serialNo: dto.serialNo,
        issueDate: new Date(dto.issueDate),
        maturityDate: new Date(dto.maturityDate),
        amount: dto.amount,
        currency: dto.currency || 'TRY',
        bankName: dto.bankName,
        branchName: dto.branchName,
        accountNo: dto.accountNo,
        checkNo: dto.checkNo,
        drawerName: dto.drawerName,
        drawerIdentityNo: dto.drawerIdentityNo,
        endorserName: dto.endorserName,
        endorserIdentityNo: dto.endorserIdentityNo,
        issuerName: dto.issuerName,
        issuerIdentityNo: dto.issuerIdentityNo,
        issuerAddress: dto.issuerAddress,
        payeeName: dto.payeeName,
        payeeIdentityNo: dto.payeeIdentityNo,
        guarantorName: dto.guarantorName,
        guarantorIdentityNo: dto.guarantorIdentityNo,
        protestDate: dto.protestDate ? new Date(dto.protestDate) : null,
        protestNo: dto.protestNo,
        notes: dto.notes,
        createdById: userId,
      },
    });
  }

  async findAllByCase(tenantId: string, caseId: string) {
    return this.prisma.caseInstrument.findMany({
      where: { tenantId, caseId },
      orderBy: { maturityDate: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const instrument = await this.prisma.caseInstrument.findFirst({
      where: { id, tenantId },
    });
    if (!instrument) {
      throw new NotFoundException('Kambiyo senedi bulunamadi');
    }
    return instrument;
  }

  async update(tenantId: string, id: string, dto: UpdateInstrumentDto) {
    const instrument = await this.findOne(tenantId, id);

    return this.prisma.caseInstrument.update({
      where: { id },
      data: {
        ...(dto.instrumentType && { instrumentType: dto.instrumentType }),
        ...(dto.serialNo && { serialNo: dto.serialNo }),
        ...(dto.issueDate && { issueDate: new Date(dto.issueDate) }),
        ...(dto.maturityDate && { maturityDate: new Date(dto.maturityDate) }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.bankName !== undefined && { bankName: dto.bankName }),
        ...(dto.branchName !== undefined && { branchName: dto.branchName }),
        ...(dto.accountNo !== undefined && { accountNo: dto.accountNo }),
        ...(dto.checkNo !== undefined && { checkNo: dto.checkNo }),
        ...(dto.drawerName !== undefined && { drawerName: dto.drawerName }),
        ...(dto.drawerIdentityNo !== undefined && { drawerIdentityNo: dto.drawerIdentityNo }),
        ...(dto.endorserName !== undefined && { endorserName: dto.endorserName }),
        ...(dto.endorserIdentityNo !== undefined && { endorserIdentityNo: dto.endorserIdentityNo }),
        ...(dto.issuerName !== undefined && { issuerName: dto.issuerName }),
        ...(dto.issuerIdentityNo !== undefined && { issuerIdentityNo: dto.issuerIdentityNo }),
        ...(dto.issuerAddress !== undefined && { issuerAddress: dto.issuerAddress }),
        ...(dto.payeeName !== undefined && { payeeName: dto.payeeName }),
        ...(dto.payeeIdentityNo !== undefined && { payeeIdentityNo: dto.payeeIdentityNo }),
        ...(dto.guarantorName !== undefined && { guarantorName: dto.guarantorName }),
        ...(dto.guarantorIdentityNo !== undefined && { guarantorIdentityNo: dto.guarantorIdentityNo }),
        ...(dto.protestDate !== undefined && { protestDate: dto.protestDate ? new Date(dto.protestDate) : null }),
        ...(dto.protestNo !== undefined && { protestNo: dto.protestNo }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.caseInstrument.delete({ where: { id } });
  }

  // Toplam tutar hesapla
  async getTotalAmount(tenantId: string, caseId: string) {
    const instruments = await this.findAllByCase(tenantId, caseId);
    return instruments.reduce((sum, i) => sum + Number(i.amount), 0);
  }
}
