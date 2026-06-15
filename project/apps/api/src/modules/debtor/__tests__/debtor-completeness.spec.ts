/**
 * PR-D4c — Borçlu completeness: computeDebtorMissingFields (tür-bazlı) + syncDebtorTask davranışı
 * (client deseninin borçlu ikizi). Yalnız global veri eksikliği; istihbarat/tebligat/CaseDebtor yok.
 */

import { DebtorService, computeDebtorMissingFields, debtorTaskDedupeKey } from "../debtor.service";

describe("computeDebtorMissingFields (tür-bazlı, makul default)", () => {
  it("INDIVIDUAL: TCKN + adres + iletişim", () => {
    expect(computeDebtorMissingFields({ type: "INDIVIDUAL" })).toEqual(["tckn", "address", "contact"]);
    // tam: tckn + adres + (telefon VEYA e-posta) → eksik yok
    expect(
      computeDebtorMissingFields({ type: "INDIVIDUAL", tckn: "11111111111", email: "a@b.com", debtorAddresses: [{ id: "a1" }] })
    ).toEqual([]);
    // telefon yeterli (e-posta gerekmez)
    expect(
      computeDebtorMissingFields({ type: "INDIVIDUAL", tckn: "1", phone: "0532", debtorAddresses: [{ id: "a1" }] })
    ).toEqual([]);
  });

  it("COMPANY: VKN + adres + iletişim", () => {
    expect(computeDebtorMissingFields({ type: "COMPANY" })).toEqual(["vkn", "address", "contact"]);
    expect(
      computeDebtorMissingFields({ type: "COMPANY", vkn: "1234567890", phone: "0212", debtorAddresses: [{ id: "a1" }] })
    ).toEqual([]);
  });

  it("PUBLIC_INSTITUTION: DETSİS VEYA kurum adı (biri yeterli)", () => {
    expect(computeDebtorMissingFields({ type: "PUBLIC_INSTITUTION" })).toEqual(["detsisOrName"]);
    expect(computeDebtorMissingFields({ type: "PUBLIC_INSTITUTION", detsisNo: "12345" })).toEqual([]);
    expect(computeDebtorMissingFields({ type: "PUBLIC_INSTITUTION", institutionName: "X Bakanlığı" })).toEqual([]);
  });

  it("ESTATE: muris adı + en az 1 mirasçı + adres", () => {
    expect(computeDebtorMissingFields({ type: "ESTATE" })).toEqual(["deceasedName", "heirs", "address"]);
    expect(
      computeDebtorMissingFields({ type: "ESTATE", deceasedName: "Ahmet", estateHeirs: [{ id: "h1" }], debtorAddresses: [{ id: "a1" }] })
    ).toEqual([]);
  });

  it("adres kuralı: en az 1 adres (primary şartı YOK)", () => {
    expect(computeDebtorMissingFields({ type: "INDIVIDUAL", tckn: "1", phone: "0532", debtorAddresses: [] })).toContain("address");
    expect(computeDebtorMissingFields({ type: "INDIVIDUAL", tckn: "1", phone: "0532", debtorAddresses: [{ id: "x" }] })).not.toContain("address");
  });
});

const buildPrisma = (existingTask: any = null) => ({
  task: {
    findUnique: jest.fn().mockResolvedValue(existingTask),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  debtor: {
    findFirst: jest.fn(),
  },
});

const callSync = (svc: any, tenantId: string, debtor: any) => (svc as any).syncDebtorTask(tenantId, debtor);

describe("DebtorService.syncDebtorTask (client deseni ikizi)", () => {
  it("eksik var + görev yok → DEBTOR_INFO görevi create (debtorId + dedupe + subtype)", async () => {
    const prisma = buildPrisma(null) as any;
    const svc = new DebtorService(prisma);

    await callSync(svc, "t1", { id: "d1", type: "INDIVIDUAL" }); // her şey eksik

    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: "t1",
      debtorId: "d1",
      taskCategory: "OPERATIONAL_COMPLETENESS",
      taskSubType: "DEBTOR_INFO",
      dedupeKey: debtorTaskDedupeKey("d1"),
      status: "PENDING",
      escalationLevel: "STAFF",
    });
    expect(data.missingFields).toEqual(["tckn", "address", "contact"]);
  });

  it("eksik yok + açık görev → AUTO_SYSTEM COMPLETED", async () => {
    const prisma = buildPrisma({ id: "tk", status: "PENDING" }) as any;
    const svc = new DebtorService(prisma);

    await callSync(svc, "t1", { id: "d1", type: "COMPANY", vkn: "1234567890", phone: "0212", debtorAddresses: [{ id: "a1" }] });

    expect(prisma.task.create).not.toHaveBeenCalled();
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: "COMPLETED", resolutionType: "AUTO_SYSTEM", completedByUserId: null });
  });

  it("eksik var + kapalı görev → yeniden açılır (PENDING + STAFF, kapanış izi temizlenir)", async () => {
    const prisma = buildPrisma({ id: "tk", status: "COMPLETED" }) as any;
    const svc = new DebtorService(prisma);

    await callSync(svc, "t1", { id: "d1", type: "INDIVIDUAL" });

    expect(prisma.task.create).not.toHaveBeenCalled();
    const data = prisma.task.update.mock.calls[0][0].data;
    expect(data.status).toBe("PENDING");
    expect(data.escalationLevel).toBe("STAFF");
    expect(data.completedAt).toBeNull();
    expect(data.resolutionType).toBeNull();
  });
});

describe("DebtorService.findAll — PR-D4d completeness sinyali", () => {
  it("her satıra missingFields/missingFieldsCount/isComplete eklenir (anlık compute)", async () => {
    const prisma = {
      debtor: {
        findMany: jest.fn().mockResolvedValue([
          { id: "d1", type: "INDIVIDUAL", tckn: "1", phone: "0532", debtorAddresses: [{ id: "a" }], estateHeirs: [] },
          { id: "d2", type: "COMPANY", vkn: null, debtorAddresses: [], estateHeirs: [] },
        ]),
        count: jest.fn().mockResolvedValue(2),
      },
    } as any;
    const svc = new DebtorService(prisma);

    const res = await svc.findAll("t1", {});

    expect(res.data[0]).toMatchObject({ id: "d1", isComplete: true, missingFieldsCount: 0 });
    expect(res.data[0].missingFields).toEqual([]);
    expect(res.data[1]).toMatchObject({ id: "d2", isComplete: false, missingFieldsCount: 3 });
    expect(res.data[1].missingFields).toEqual(["vkn", "address", "contact"]);
  });
});
