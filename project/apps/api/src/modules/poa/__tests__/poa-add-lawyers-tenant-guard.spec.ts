/**
 * CBND-2 (H6) — PoaService.addLawyers() poaId tenant-ownership guard.
 *
 * Açık: addLawyers yalnız lawyerIds'i tenant-doğruluyordu; poaId hiç doğrulanmadan
 * poaLawyer.createMany çalışıyordu → cross-tenant poaId ile yabancı tenant'ın vekaletine
 * avukat yazılabiliyordu (removeLawyer'ın findOne(poaId, tenantId) guard'ıyla asimetrikti).
 * Fix: addLawyers() de removeLawyer ile AYNI desende findOne(poaId, tenantId) çağırır
 * (cross-tenant/geçersiz → NotFoundException, createMany hiç çağrılmaz).
 */
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { PoaService } from "../poa.service";

const TENANT = "tenant-1";
const POA_ID = "poa-1";

function setup(opts: { poaFound?: boolean; lawyerCount?: number } = {}) {
  const { poaFound = true, lawyerCount = 2 } = opts;

  const clientPowerOfAttorneyFindFirst = jest.fn(async ({ where }: any) =>
    poaFound ? { id: where.id, clientId: "cli-1", client: { id: "cli-1" }, lawyers: [] } : null,
  );
  const lawyerFindMany = jest.fn(async ({ where }: any) =>
    (where.id.in as string[]).slice(0, lawyerCount).map((id) => ({ id })),
  );
  const poaLawyerCreateMany = jest.fn(async () => ({ count: 2 }));

  const prisma: any = {
    clientPowerOfAttorney: { findFirst: clientPowerOfAttorneyFindFirst },
    lawyer: { findMany: lawyerFindMany },
    poaLawyer: { createMany: poaLawyerCreateMany },
  };
  const audit: any = { log: jest.fn(), logInTransaction: jest.fn() };
  const officeApproval: any = { isApproverEligible: jest.fn().mockResolvedValue(true) };

  return { svc: new PoaService(prisma, audit, officeApproval), clientPowerOfAttorneyFindFirst, lawyerFindMany, poaLawyerCreateMany };
}

describe("CBND-2 (H6) PoaService.addLawyers() — poaId tenant guard", () => {
  it("same-tenant poaId → findOne ile doğrulanır, createMany çalışır", async () => {
    const { svc, clientPowerOfAttorneyFindFirst, poaLawyerCreateMany } = setup();

    const result = await svc.addLawyers(POA_ID, ["law-1", "law-2"], TENANT);

    expect(clientPowerOfAttorneyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: POA_ID, client: { tenantId: TENANT } } }),
    );
    // UYAP-POA-TENANT-SAFETY-I01: PoaLawyer artik canonical tenantId tasir (composite tenant-safe FK).
    expect(poaLawyerCreateMany).toHaveBeenCalledWith({
      data: [
        { tenantId: TENANT, poaId: POA_ID, lawyerId: "law-1", isPrimary: true },
        { tenantId: TENANT, poaId: POA_ID, lawyerId: "law-2", isPrimary: false },
      ],
    });
    expect(result).toEqual({ success: true, count: 2 });
  });

  it("cross-tenant/geçersiz poaId → NotFoundException, lawyer sorgusu ve createMany HİÇ çağrılmaz", async () => {
    const { svc, lawyerFindMany, poaLawyerCreateMany } = setup({ poaFound: false });

    await expect(svc.addLawyers("foreign-poa", ["law-1"], TENANT)).rejects.toBeInstanceOf(NotFoundException);
    expect(lawyerFindMany).not.toHaveBeenCalled();
    expect(poaLawyerCreateMany).not.toHaveBeenCalled();
  });

  it("same-tenant poaId ama cross-tenant lawyerId → BadRequestException (mevcut davranış korunur)", async () => {
    const { svc, poaLawyerCreateMany } = setup({ lawyerCount: 1 }); // yalnız ilk lawyerId "bulunur"

    await expect(svc.addLawyers(POA_ID, ["law-1", "foreign-law"], TENANT)).rejects.toBeInstanceOf(BadRequestException);
    expect(poaLawyerCreateMany).not.toHaveBeenCalled();
  });
});
