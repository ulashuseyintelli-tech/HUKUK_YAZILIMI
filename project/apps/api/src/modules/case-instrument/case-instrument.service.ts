import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InstrumentType } from '@prisma/client';
import { InstrumentChain } from './instrument-chain.contract';
import { analyzeChain as runChainAnalysis, ChainAnalysis } from './instrument-chain-engine';
import { AnalyzeChainDto } from './dto/analyze-chain.dto';

export interface CreateInstrumentDto {
  caseId: string;
  instrumentType: InstrumentType;
  serialNo: string;
  issueDate: string;
  maturityDate?: string;
  presentmentDate?: string;
  amount: number;
  currency?: string;
  // Banka bilgileri
  bankName?: string;
  bankBranch?: string;
  bankCode?: string;
  accountNo?: string;
  // Taraflar
  drawerName?: string;
  drawerIdentity?: string;
  payeeName?: string;
  payeeIdentity?: string;
  // Ciranta/Aval (JSON)
  endorsers?: any;
  avals?: any;
  // Protesto/Karşılıksız
  isProtested?: boolean;
  protestDate?: string;
  protestNo?: string;
  isBounced?: boolean;
  bounceDate?: string;
  bounceReason?: string;
  // Diger
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
        maturityDate: dto.maturityDate ? new Date(dto.maturityDate) : null,
        presentmentDate: dto.presentmentDate ? new Date(dto.presentmentDate) : null,
        amount: dto.amount,
        currency: dto.currency || 'TRY',
        bankName: dto.bankName,
        bankBranch: dto.bankBranch,
        bankCode: dto.bankCode,
        accountNo: dto.accountNo,
        drawerName: dto.drawerName,
        drawerIdentity: dto.drawerIdentity,
        payeeName: dto.payeeName,
        payeeIdentity: dto.payeeIdentity,
        endorsers: dto.endorsers,
        avals: dto.avals,
        isProtested: dto.isProtested || false,
        protestDate: dto.protestDate ? new Date(dto.protestDate) : null,
        protestNo: dto.protestNo,
        isBounced: dto.isBounced || false,
        bounceDate: dto.bounceDate ? new Date(dto.bounceDate) : null,
        bounceReason: dto.bounceReason,
        notes: dto.notes,
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
    await this.findOne(tenantId, id);

    return this.prisma.caseInstrument.update({
      where: { id },
      data: {
        ...(dto.instrumentType && { instrumentType: dto.instrumentType }),
        ...(dto.serialNo && { serialNo: dto.serialNo }),
        ...(dto.issueDate && { issueDate: new Date(dto.issueDate) }),
        ...(dto.maturityDate !== undefined && { maturityDate: dto.maturityDate ? new Date(dto.maturityDate) : null }),
        ...(dto.presentmentDate !== undefined && { presentmentDate: dto.presentmentDate ? new Date(dto.presentmentDate) : null }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.currency && { currency: dto.currency }),
        ...(dto.bankName !== undefined && { bankName: dto.bankName }),
        ...(dto.bankBranch !== undefined && { bankBranch: dto.bankBranch }),
        ...(dto.bankCode !== undefined && { bankCode: dto.bankCode }),
        ...(dto.accountNo !== undefined && { accountNo: dto.accountNo }),
        ...(dto.drawerName !== undefined && { drawerName: dto.drawerName }),
        ...(dto.drawerIdentity !== undefined && { drawerIdentity: dto.drawerIdentity }),
        ...(dto.payeeName !== undefined && { payeeName: dto.payeeName }),
        ...(dto.payeeIdentity !== undefined && { payeeIdentity: dto.payeeIdentity }),
        ...(dto.endorsers !== undefined && { endorsers: dto.endorsers }),
        ...(dto.avals !== undefined && { avals: dto.avals }),
        ...(dto.isProtested !== undefined && { isProtested: dto.isProtested }),
        ...(dto.protestDate !== undefined && { protestDate: dto.protestDate ? new Date(dto.protestDate) : null }),
        ...(dto.protestNo !== undefined && { protestNo: dto.protestNo }),
        ...(dto.isBounced !== undefined && { isBounced: dto.isBounced }),
        ...(dto.bounceDate !== undefined && { bounceDate: dto.bounceDate ? new Date(dto.bounceDate) : null }),
        ...(dto.bounceReason !== undefined && { bounceReason: dto.bounceReason }),
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

  /**
   * A1 Faz 2b-A — SAF/stateless kambiyo zinciri analizi (hamil + müracaat adayları).
   * Doğrulanmış DTO'yu Faz 0 kontratına (InstrumentChain) normalize edip headless motoru (2a) çağırır.
   * DB OKUMAZ/YAZMAZ · tenant verisi DOKUNMAZ · CaseDebtor YARATMAZ (yalnız aday RecourseParty[]).
   *
   * Normalize: `position`/`toPosition` undefined → null (motorun `=== null` sıralama kontratı için);
   * `endorsements`/`avals` verilmezse [] (motor yalnız nodes + avals kullanır).
   *
   * Çağrıldığı yerler:
   * - CaseInstrumentController.analyzeChain() → POST /api/case-instruments/chain/analyze
   * - case-instrument chain-analyze.endpoint.spec.ts (unit)
   */
  analyzeChain(dto: AnalyzeChainDto): ChainAnalysis {
    const chain: InstrumentChain = {
      nodes: (dto.nodes ?? []).map((n) => ({
        role: n.role,
        party: {
          name: n.party.name,
          identityNo: n.party.identityNo,
          type: n.party.type,
          partyId: n.party.partyId,
        },
        position: n.position ?? null,
        provenance: {
          source: n.provenance.source,
          confidence: n.provenance.confidence,
          verifiedById: n.provenance.verifiedById,
          verifiedAt: n.provenance.verifiedAt,
        },
      })),
      endorsements: (dto.endorsements ?? []).map((e) => ({
        fromPosition: e.fromPosition,
        toPosition: e.toPosition ?? null,
        type: e.type,
        provenance: {
          source: e.provenance.source,
          confidence: e.provenance.confidence,
          verifiedById: e.provenance.verifiedById,
          verifiedAt: e.provenance.verifiedAt,
        },
      })),
      avals: (dto.avals ?? []).map((a) => ({
        avalistPosition: a.avalistPosition,
        guaranteesPosition: a.guaranteesPosition,
        amount: a.amount,
        provenance: {
          source: a.provenance.source,
          confidence: a.provenance.confidence,
          verifiedById: a.provenance.verifiedById,
          verifiedAt: a.provenance.verifiedAt,
        },
      })),
    };

    return runChainAnalysis(chain);
  }
}
