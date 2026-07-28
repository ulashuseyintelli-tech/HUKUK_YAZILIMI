/**
 * UYAP-SEND-AUTHORITY-RESOLVER-I01 — MODEL B (acting-lawyer matched POA) yetki zinciri.
 *
 * Owner DECISION-1 (RATIFIED): office membership · personnel status · case assignment ·
 * responsible-lawyer ataması · admin/super-admin rolü · internal permission · client-provided
 * lawyerId · başka avukata ait POA → tek başına execution authority DEĞİLDİR.
 *
 * Kilitlenen invariant'lar: INV-04..INV-13 (tenant eşitliği, POA-actor eşleşmesi, lifecycle,
 * scope, ambiguity fail-closed).
 */
import { UyapSendAuthorityResolverService } from "../authority/uyap-send-authority-resolver.service";
import { UyapSendAuthorityContext } from "../authority/uyap-send-authority.types";

const TENANT = "t-1";
const OTHER_TENANT = "t-2";
const USER = "u-1";
const LAWYER = "law-1";
const OTHER_LAWYER = "law-2";
const CASE = "case-1";
const CLIENT = "cli-1";
const CLIENT_B = "cli-2";
const NOW = new Date("2026-07-01T12:00:00.000Z");

type PoaRow = {
  id: string;
  clientId: string;
  tenantId: string;
  status: string;
  isActive: boolean;
  dateIssued: Date | null;
  isLimited: boolean;
  validUntil: Date | null;
  scopeType: string;
  updatedAt: Date;
  lawyers: Array<{ id: string; lawyerId: string; tenantId: string }>;
};

function poa(over: Partial<PoaRow> = {}): PoaRow {
  return {
    id: "poa-1",
    clientId: CLIENT,
    tenantId: TENANT,
    status: "ACTIVE",
    isActive: true,
    dateIssued: new Date("2026-01-01T00:00:00.000Z"),
    isLimited: false,
    validUntil: null,
    scopeType: "GENEL",
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    lawyers: [{ id: "pl-1", lawyerId: LAWYER, tenantId: TENANT }],
    ...over,
  };
}

function build(opts: {
  caseRow?: any;
  caseCountElsewhere?: number;
  poas?: PoaRow[];
}) {
  const caseFindFirst = jest.fn().mockResolvedValue(
    opts.caseRow === undefined
      ? { id: CASE, tenantId: TENANT, caseClients: [{ clientId: CLIENT, client: { id: CLIENT, tenantId: TENANT } }] }
      : opts.caseRow,
  );
  const caseCount = jest.fn().mockResolvedValue(opts.caseCountElsewhere ?? 0);
  const poaFindMany = jest.fn().mockResolvedValue(opts.poas ?? [poa()]);
  const prisma = {
    case: { findFirst: caseFindFirst, count: caseCount },
    clientPowerOfAttorney: { findMany: poaFindMany },
  } as any;
  return { svc: new UyapSendAuthorityResolverService(prisma), caseFindFirst, caseCount, poaFindMany };
}

const ctx: UyapSendAuthorityContext = {
  tenantId: TENANT,
  authenticatedUserId: USER,
  actingLawyerId: LAWYER,
  caseId: CASE,
  operationType: "UYAP_SEND",
  evaluatedAt: NOW,
};

describe("UyapSendAuthorityResolverService", () => {
  describe("pozitif", () => {
    it("GENEL kapsamlı, eşleşen avukatlı geçerli POA → allowed + evidence", async () => {
      const { svc } = build({});
      const d = await svc.resolve(ctx);

      expect(d.allowed).toBe(true);
      expect(d.failureCode).toBeUndefined();
      expect(d.clientId).toBe(CLIENT);
      expect(d.authorityVersion).toBe("UYAP-SEND-AUTHORITY/v1");
      expect(d.authorityEvidence).toEqual([
        expect.objectContaining({ poaId: "poa-1", clientId: CLIENT, tenantId: TENANT, poaLawyerId: "pl-1" }),
      ]);
    });

    it("ICRA_TAKIP kapsamı da UYAP_SEND'i karşılar", async () => {
      const { svc } = build({ poas: [poa({ scopeType: "ICRA_TAKIP" })] });
      await expect(svc.resolve(ctx)).resolves.toMatchObject({ allowed: true });
    });

    it("süreli POA, bitiş tarihi gelecekte → allowed", async () => {
      const { svc } = build({
        poas: [poa({ isLimited: true, validUntil: new Date("2026-12-31T00:00:00.000Z") })],
      });
      await expect(svc.resolve(ctx)).resolves.toMatchObject({ allowed: true });
    });

    it("aynı POA'da birden fazla avukat varsa acting lawyer dahilse geçerli", async () => {
      const { svc } = build({
        poas: [poa({ lawyers: [{ id: "pl-9", lawyerId: LAWYER, tenantId: TENANT }] })],
      });
      const d = await svc.resolve(ctx);
      expect(d.allowed).toBe(true);
      expect(d.authorityEvidence[0].poaLawyerId).toBe("pl-9");
    });

    it("aynı client için birden fazla GEÇERLİ POA → hepsi deterministik (poaId ASC) evidence olur", async () => {
      const { svc } = build({
        poas: [poa({ id: "poa-b" }), poa({ id: "poa-a" })],
      });
      const d = await svc.resolve(ctx);
      expect(d.allowed).toBe(true);
      expect(d.authorityEvidence.map((e) => e.poaId)).toEqual(["poa-a", "poa-b"]);
    });

    it("çok client'lı case: HER client karşılanırsa allowed (konjonktif)", async () => {
      const { svc } = build({
        caseRow: {
          id: CASE,
          tenantId: TENANT,
          caseClients: [
            { clientId: CLIENT, client: { id: CLIENT, tenantId: TENANT } },
            { clientId: CLIENT_B, client: { id: CLIENT_B, tenantId: TENANT } },
          ],
        },
        poas: [poa({ id: "poa-1", clientId: CLIENT }), poa({ id: "poa-2", clientId: CLIENT_B })],
      });
      const d = await svc.resolve(ctx);
      expect(d.allowed).toBe(true);
      expect(d.clientId).toBeUndefined(); // çok client → tekil clientId yok
      expect(d.authorityEvidence).toHaveLength(2);
    });

    it("POA sorgusu her katmanda tenant + acting lawyer ile kısıtlanır", async () => {
      const { svc, poaFindMany } = build({});
      await svc.resolve(ctx);
      const where = poaFindMany.mock.calls[0][0].where;
      expect(where.tenantId).toBe(TENANT);
      expect(where.clientId).toEqual({ in: [CLIENT] });
      expect(where.lawyers.some).toEqual({ lawyerId: LAWYER, tenantId: TENANT });
    });
  });

  describe("negatif — case/client", () => {
    it("case yok → CASE_NOT_FOUND", async () => {
      const { svc } = build({ caseRow: null, caseCountElsewhere: 0 });
      await expect(svc.resolve(ctx)).resolves.toMatchObject({ allowed: false, failureCode: "CASE_NOT_FOUND" });
    });

    it("case başka tenant'ta → CASE_TENANT_MISMATCH (sessizce 'yok' sayılmaz)", async () => {
      const { svc } = build({ caseRow: null, caseCountElsewhere: 1 });
      await expect(svc.resolve(ctx)).resolves.toMatchObject({
        allowed: false,
        failureCode: "CASE_TENANT_MISMATCH",
      });
    });

    it("case'in client ilişkisi yok → CASE_CLIENT_MISMATCH", async () => {
      const { svc } = build({ caseRow: { id: CASE, tenantId: TENANT, caseClients: [] } });
      await expect(svc.resolve(ctx)).resolves.toMatchObject({
        allowed: false,
        failureCode: "CASE_CLIENT_MISMATCH",
      });
    });

    it("client başka tenant'ta → CLIENT_TENANT_MISMATCH", async () => {
      const { svc } = build({
        caseRow: {
          id: CASE,
          tenantId: TENANT,
          caseClients: [{ clientId: CLIENT, client: { id: CLIENT, tenantId: OTHER_TENANT } }],
        },
      });
      await expect(svc.resolve(ctx)).resolves.toMatchObject({
        allowed: false,
        failureCode: "CLIENT_TENANT_MISMATCH",
      });
    });
  });

  describe("negatif — POA lifecycle", () => {
    const cases: Array<[string, Partial<PoaRow>, string]> = [
      ["POA yok", {}, "POWER_OF_ATTORNEY_MISSING"],
      ["status REVOKED", { status: "REVOKED", isActive: false }, "POWER_OF_ATTORNEY_REVOKED"],
      ["status EXPIRED", { status: "EXPIRED", isActive: false }, "POWER_OF_ATTORNEY_EXPIRED"],
      ["status PENDING", { status: "PENDING", isActive: false }, "POWER_OF_ATTORNEY_NOT_EFFECTIVE"],
      ["dateIssued NULL", { dateIssued: null }, "POWER_OF_ATTORNEY_NOT_EFFECTIVE"],
      [
        "dateIssued gelecekte",
        { dateIssued: new Date("2026-12-01T00:00:00.000Z") },
        "POWER_OF_ATTORNEY_NOT_EFFECTIVE",
      ],
      ["süreli ama validUntil NULL", { isLimited: true, validUntil: null }, "POWER_OF_ATTORNEY_NOT_EFFECTIVE"],
      [
        "süreli ve süresi dolmuş",
        { isLimited: true, validUntil: new Date("2026-06-01T00:00:00.000Z") },
        "POWER_OF_ATTORNEY_EXPIRED",
      ],
      [
        "süresiz işaretli ama geçmiş validUntil",
        { isLimited: false, validUntil: new Date("2026-06-01T00:00:00.000Z") },
        "POWER_OF_ATTORNEY_EXPIRED",
      ],
      ["kapsam BU_DOSYA", { scopeType: "BU_DOSYA" }, "POWER_OF_ATTORNEY_SCOPE_MISMATCH"],
      ["kapsam OZEL", { scopeType: "OZEL" }, "POWER_OF_ATTORNEY_SCOPE_MISMATCH"],
    ];

    it.each(cases)("%s → %s", async (_name, over, expected) => {
      const poas = Object.keys(over).length === 0 ? [] : [poa(over)];
      const { svc } = build({ poas });
      await expect(svc.resolve(ctx)).resolves.toMatchObject({ allowed: false, failureCode: expected });
    });

    it("soft-delete (isActive=false, status ACTIVE değil) authority üretmez", async () => {
      const { svc } = build({ poas: [poa({ status: "EXPIRED", isActive: false })] });
      await expect(svc.resolve(ctx)).resolves.toMatchObject({ allowed: false });
    });

    it("kendi içinde çelişkili kayıt (ACTIVE + isActive=false) → AUTHORITY_RECORD_CONFLICT", async () => {
      const { svc } = build({ poas: [poa({ status: "ACTIVE", isActive: false })] });
      await expect(svc.resolve(ctx)).resolves.toMatchObject({
        allowed: false,
        failureCode: "AUTHORITY_RECORD_CONFLICT",
      });
    });

    it("denied kararda evidence BOŞ kalır (hukuki dayanak üretilmez)", async () => {
      const { svc } = build({ poas: [poa({ status: "REVOKED", isActive: false })] });
      const d = await svc.resolve(ctx);
      expect(d.authorityEvidence).toEqual([]);
    });
  });

  describe("negatif — actor/tenant eşleşmesi", () => {
    it("POA başka avukata aitse (acting lawyer bağı yok) → POWER_OF_ATTORNEY_MISSING", async () => {
      const { svc } = build({
        poas: [poa({ lawyers: [] })], // sorgu döndürse bile bağ yoksa aday değildir
      });
      await expect(svc.resolve(ctx)).resolves.toMatchObject({
        allowed: false,
        failureCode: "POWER_OF_ATTORNEY_MISSING",
      });
    });

    it("başka avukatın POA'sı acting lawyer'a yetki vermez", async () => {
      const { svc, poaFindMany } = build({ poas: [] });
      await svc.resolve({ ...ctx, actingLawyerId: OTHER_LAWYER });
      expect(poaFindMany.mock.calls[0][0].where.lawyers.some.lawyerId).toBe(OTHER_LAWYER);
    });

    it("çok client'lı case'te BİR client bile karşılanmazsa fail-closed", async () => {
      const { svc } = build({
        caseRow: {
          id: CASE,
          tenantId: TENANT,
          caseClients: [
            { clientId: CLIENT, client: { id: CLIENT, tenantId: TENANT } },
            { clientId: CLIENT_B, client: { id: CLIENT_B, tenantId: TENANT } },
          ],
        },
        poas: [poa({ id: "poa-1", clientId: CLIENT })], // CLIENT_B için POA yok
      });
      const d = await svc.resolve(ctx);
      expect(d).toMatchObject({ allowed: false, failureCode: "POWER_OF_ATTORNEY_MISSING", clientId: CLIENT_B });
      expect(d.authorityEvidence).toEqual([]);
    });
  });

  describe("bağlam bütünlüğü", () => {
    const invalid: Array<[string, Partial<UyapSendAuthorityContext>]> = [
      ["tenantId yok", { tenantId: "" }],
      ["userId yok", { authenticatedUserId: "" }],
      ["actingLawyerId yok", { actingLawyerId: "" }],
      ["caseId yok", { caseId: "" }],
      ["operationType yok", { operationType: "" }],
      ["evaluatedAt geçersiz", { evaluatedAt: new Date("invalid") }],
    ];

    it.each(invalid)("%s → AUTHORITY_CONTEXT_INVALID (DB'ye gidilmez)", async (_n, over) => {
      const { svc, caseFindFirst, poaFindMany } = build({});
      const d = await svc.resolve({ ...ctx, ...over } as UyapSendAuthorityContext);
      expect(d).toMatchObject({ allowed: false, failureCode: "AUTHORITY_CONTEXT_INVALID" });
      expect(caseFindFirst).not.toHaveBeenCalled();
      expect(poaFindMany).not.toHaveBeenCalled();
    });
  });

  describe("determinizm", () => {
    it("aynı girdi aynı evidence setini üretir", async () => {
      const { svc } = build({ poas: [poa({ id: "poa-b" }), poa({ id: "poa-a" })] });
      const a = await svc.resolve(ctx);
      const b = await svc.resolve(ctx);
      expect(a.authorityEvidence).toEqual(b.authorityEvidence);
    });

    // UYAP-AUTHORITY-FRESHNESS-TX-I01: evidence'a DÖRT yürürlük alanı eklendi
    // (`poaIsActive`, `poaIsLimited`, `poaDateIssued`, `poaValidUntil`). TX-1 revalidation
    // `updatedAt` DIŞINDA semantik karşılaştırma yapmak zorundadır (aynı ms içinde değişim,
    // saat kayması, updatedAt tetiklemeyen raw yazma). Bu alanlar PII veya serbest metin
    // DEĞİLDİR; testin asıl güvencesi aşağıda hem tam anahtar kümesi hem de açık
    // yasak-alan listesiyle KORUNUR (daha güçlü hâle geldi).
    it("evidence POA belge içeriği/serbest metin TAŞIMAZ", async () => {
      const { svc } = build({});
      const d = await svc.resolve(ctx);
      const keys = Object.keys(d.authorityEvidence[0]).sort();
      expect(keys).toEqual(
        [
          "clientId",
          "poaDateIssued",
          "poaId",
          "poaIsActive",
          "poaIsLimited",
          "poaLawyerId",
          "poaScopeType",
          "poaStatus",
          "poaUpdatedAt",
          "poaValidUntil",
          "tenantId",
        ].sort(),
      );
      // Serbest metin / belge / kimlik alanları HİÇBİR koşulda evidence'a girmez.
      for (const forbidden of [
        "scopeDescription",
        "note",
        "notes",
        "documentUrl",
        "notaryName",
        "fileNumber",
        "identityNo",
      ]) {
        expect(keys).not.toContain(forbidden);
      }
    });
  });
});
