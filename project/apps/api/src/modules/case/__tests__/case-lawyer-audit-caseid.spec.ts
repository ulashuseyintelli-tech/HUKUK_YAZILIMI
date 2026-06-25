/**
 * WP-1d-2-pre — CASE_LAWYER audit event'lerine `metadata.caseId` (forward-only).
 *
 * Sebep: CASE_LAWYER audit'leri entityId=caseLawyerId (junction) taşır, caseId YOK → legal-responsible
 * temporal sorgu (WP-1d-2) caseId ile filtreleyemez. Bu PR ileriye dönük metadata.caseId ekler →
 * yeni event'ler caseId ile EVENT_CONFIRMED query edilebilir. Migration/backfill/eski-event onarımı YOK.
 *
 * 6 CASE_LAWYER audit call-site metadata.caseId alır; burada 4'ü doğrudan test edilir
 * (add CREATE · remove DELETE · update UPDATE · create-dedupe demote). Kalan 2 ikincil yol
 * (add-promote · remove-auto-promote) AYNI metadata:{caseId} satırını paylaşır (construction).
 */

import { CaseService } from "../case.service";

const CASE_ID = "case-1";

const makeService = () => {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
  const auditLog = jest.fn(async () => undefined);
  (service as any).auditService = { log: auditLog };
  return { service, auditLog };
};

const lawyerAudit = (action: string) =>
  expect.objectContaining({
    entityType: "CASE_LAWYER",
    action,
    metadata: expect.objectContaining({ caseId: CASE_ID }),
  });

describe("WP-1d-2-pre — CASE_LAWYER audit metadata.caseId", () => {
  it("addCaseLawyer CREATE audit → metadata.caseId", async () => {
    const { service, auditLog } = makeService();
    const txCreate = jest.fn(async ({ data }: any) => ({
      id: "cl-new", lawyerId: data.lawyerId, role: data.role, isResponsible: data.isResponsible,
      lawyer: { id: data.lawyerId, name: "Ada", surname: "Av", barNumber: "5", lawyerRank: "LAWYER" },
    }));
    (service as any).prisma = {
      case: { findFirst: jest.fn(async () => ({ id: CASE_ID, tenantId: "t1" })) },
      lawyer: { findFirst: jest.fn(async () => ({ id: "law-1", tenantId: "t1", lawyerRank: "LAWYER" })) },
      // WP-1d-5-9: addCaseLawyer count + doğrudan create (eski $transaction yok).
      caseLawyer: { findFirst: jest.fn(async () => null), count: jest.fn(async () => 0), create: txCreate },
    };
    await (service as any).addCaseLawyer("t1", CASE_ID, { lawyerId: "law-1", role: "ASSIGNED" }, "u1");
    expect(auditLog).toHaveBeenCalledWith(lawyerAudit("CREATE"));
  });

  it("removeCaseLawyer DELETE audit → metadata.caseId", async () => {
    const { service, auditLog } = makeService();
    (service as any).prisma = {
      case: { findFirst: jest.fn(async () => ({ id: CASE_ID, tenantId: "t1" })) },
      // WP-1d-5-9: non-responsible silme doğrudan delete (eski $transaction/auto-promote yok).
      caseLawyer: {
        findFirst: jest.fn(async () => ({ id: "cl-1", caseId: CASE_ID, lawyerId: "law-1", role: "ASSIGNED", isResponsible: false })),
        delete: jest.fn(async () => ({})),
      },
    };
    await (service as any).removeCaseLawyer("t1", CASE_ID, "cl-1", "u1");
    expect(auditLog).toHaveBeenCalledWith(lawyerAudit("DELETE"));
  });

  it("updateCaseLawyer UPDATE audit → metadata.caseId", async () => {
    const { service, auditLog } = makeService();
    (service as any).prisma = {
      case: { findFirst: jest.fn(async () => ({ id: CASE_ID, tenantId: "t1" })) },
      caseLawyer: {
        findFirst: jest.fn(async () => ({ id: "cl-1", caseId: CASE_ID, isResponsible: false, lawyer: { name: "Ada", surname: "Av" } })),
        // WP-1d-5-7: updateCaseLawyer doğrudan caseLawyer.update çağırır (eski $transaction yok).
        update: jest.fn(async () => ({ id: "cl-1", role: "ASSIGNED", casePermissions: null, lawyer: { name: "Ada", surname: "Av" } })),
      },
    };
    await (service as any).updateCaseLawyer("t1", CASE_ID, "cl-1", { canSign: true }, "u1");
    expect(auditLog).toHaveBeenCalledWith(lawyerAudit("UPDATE"));
  });

  it("create() dedupe demote CASE_LAWYER audit → metadata.caseId (result.case.id)", async () => {
    const { service, auditLog } = makeService();
    (service as any).validateSubCategoryRules = () => {};
    (service as any).validateCaseFkOwnership = jest.fn(async () => {});
    (service as any).resolveInlinePartiesBeforeTx = jest.fn(async () => {});
    (service as any).validateDebtorOwnershipBeforeCreate = jest.fn(async () => {});
    (service as any).clientInfoRequestService = { sendAutoRequestOnCaseCreate: jest.fn(() => Promise.resolve()) };
    (service as any).prisma = {
      lawyer: { findFirst: jest.fn(async () => null) },
      staffMember: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async () => ({
        case: { id: CASE_ID, fileNumber: "F1", type: "GENEL", clientId: null },
        clientIds: [], lawyerIds: [],
        staffResult: { selectionProvided: false, assigned: [] },
        responsibleKeptId: "cl-keep",
        responsibleDemotedIds: ["cl-2"],
      })),
    };
    await service.create("t1", { creditors: [] } as any, "u1");
    // create-dedupe demote audit: CASE_LAWYER UPDATE, metadata.caseId = result.case.id
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "CASE_LAWYER",
        action: "UPDATE",
        metadata: expect.objectContaining({ caseId: CASE_ID }),
      }),
    );
  });
});
