import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CaseDebtorLifecycleStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export type CaseDebtorLifecycleGuardPrisma = Pick<
  Prisma.TransactionClient,
  "caseDebtor"
>;

const caseDebtorLifecycleGuardSelect = {
  id: true,
  caseId: true,
  debtorId: true,
  lifecycleStatus: true,
} as const satisfies Prisma.CaseDebtorSelect;

export type CaseDebtorLifecycleGuardResult = Prisma.CaseDebtorGetPayload<{
  select: typeof caseDebtorLifecycleGuardSelect;
}>;

export interface AssertActiveByCaseDebtorIdOptions {
  expectedCaseId?: string;
  prisma?: CaseDebtorLifecycleGuardPrisma;
}

export interface AssertActiveByCaseAndDebtorOptions {
  prisma?: CaseDebtorLifecycleGuardPrisma;
}

@Injectable()
export class CaseDebtorLifecycleGuardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * <remarks>
   * Çağrıldığı yerler:
   * - Henüz yok → PR-L6a helper-only; writer guard bağlantıları sonraki PR'larda yapılacak.
   * </remarks>
   */
  async assertActiveByCaseDebtorId(
    tenantId: string,
    caseDebtorId: string,
    options: AssertActiveByCaseDebtorIdOptions = {}
  ): Promise<CaseDebtorLifecycleGuardResult> {
    const prisma = options.prisma ?? this.prisma;
    const caseDebtor = await prisma.caseDebtor.findFirst({
      where: {
        id: caseDebtorId,
        case: {
          tenantId,
          ...(options.expectedCaseId ? { id: options.expectedCaseId } : {}),
        },
      },
      select: caseDebtorLifecycleGuardSelect,
    });

    return this.assertActive(caseDebtor);
  }

  /**
   * <remarks>
   * Çağrıldığı yerler:
   * - Henüz yok → PR-L6a helper-only; FK'siz writer guard bağlantıları sonraki PR'larda yapılacak.
   * </remarks>
   */
  async assertActiveByCaseAndDebtor(
    tenantId: string,
    caseId: string,
    debtorId: string,
    options: AssertActiveByCaseAndDebtorOptions = {}
  ): Promise<CaseDebtorLifecycleGuardResult> {
    const prisma = options.prisma ?? this.prisma;
    const caseDebtor = await prisma.caseDebtor.findFirst({
      where: {
        caseId,
        debtorId,
        case: { tenantId },
      },
      select: caseDebtorLifecycleGuardSelect,
    });

    return this.assertActive(caseDebtor);
  }

  private assertActive(
    caseDebtor: CaseDebtorLifecycleGuardResult | null
  ): CaseDebtorLifecycleGuardResult {
    if (!caseDebtor) {
      throw new NotFoundException("Dosya borçlusu bulunamadı.");
    }

    if (caseDebtor.lifecycleStatus === CaseDebtorLifecycleStatus.PASSIVE) {
      throw new BadRequestException(
        "Pasif dosya borçlusu yeni operasyon hedefi olamaz."
      );
    }

    return caseDebtor;
  }
}
