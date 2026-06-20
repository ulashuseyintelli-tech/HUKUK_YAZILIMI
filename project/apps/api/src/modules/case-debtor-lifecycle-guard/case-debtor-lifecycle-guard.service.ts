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
   * - CollectionService.validateCaseDebtorForCollectionInTx() → CollectionService.create() içinde tahsilat CaseDebtor aktiflik kontrolü
   * - TebligatService.validateCreateCaseDebtorAddress() → TebligatService.create() içinde tebligat CaseDebtor aktiflik kontrolü
   * - TebligatService.createMernisTebligat() → POST /tebligat/:id/create-mernis (MERNIS tebligatı CaseDebtor aktiflik kontrolü)
   * - AddressDiscoveryService.getOrCreateResearch() → AddressResearch hidden create aktiflik kontrolü
   * - AddressDiscoveryService.startResearch() → POST /address-discovery/research/:caseDebtorId/start (research start aktiflik kontrolü)
   * - AddressDiscoveryService.suggestNextAction() → GET /address-discovery/research/:caseDebtorId/suggestions (new-operation suggestion aktiflik kontrolü)
   * - AddressDiscoveryService.updateResearchStatus() → internal AddressResearch progress update aktiflik kontrolü
   * - AssetQueryService.runQueries() → POST /asset-queries/debtor/:caseDebtorId/run (malvarlığı sorgusu aktiflik kontrolü)
   * - UyapQueryService.createQuery() → POST /address-discovery/uyap-query (UYAP sorgusu aktiflik kontrolü)
   * - InstitutionLetterService.createLetter() → POST /address-discovery/institution-letter (kurum yazısı aktiflik kontrolü)
   * - ThirdPartyService.create() → POST /case-debtors/:caseDebtorId/third-parties (üçüncü şahıs aktiflik kontrolü)
   * - ThirdPartyService.createExternalCase() → POST /case-debtors/:caseDebtorId/external-cases (dış dosya aktiflik kontrolü)
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
   * - AddressTaskService.createTask() → POST /address-tasks/create (FK'siz AddressTask manual create aktiflik kontrolü)
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
