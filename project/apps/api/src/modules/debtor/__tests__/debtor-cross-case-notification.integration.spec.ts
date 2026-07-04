/**
 * DBND-D6A-2 — Shared Debtor Cross-Case Persistent Notification — Integration Tests
 *
 * DBND-D6A-1 (pull/computed drawer banner, ayrı ve bağımsız) ile kod bağı yok.
 *
 * Requires: DATABASE_URL pointing to a disposable test database with migrations applied
 * (bkz. test/test-db-env.ts — TEST_DATABASE_URL güvenli bir ad taşımalı, dev DB'ye asla bağlanmaz).
 *
 * Coverage (owner GO-IMPLEMENT spec, 15 senaryo):
 *  1. address change creates notification for other cases
 *  2. KEP change creates notification
 *  3. TCKN/VKN change creates notification
 *  4. name/title change creates lower-severity notification
 *  5. phone/email change creates no notification
 *  6. notes/risk fields create no notification
 *  7. responsible lawyer receives notification
 *  8. fallback to all active lawyers when responsible lawyer missing
 *  9. TEBLIGAT CaseStaff with receiveNotifications=true receives notification
 * 10. other staff roles do not receive notification
 * 11. receiveNotifications=false staff does not receive notification
 * 12. source case is excluded from cross-case notification
 * 13. dedupe prevents duplicates
 * 14. ACKNOWLEDGED transition works
 * 15. EXPIRED transition/query behavior works
 * 16. primary AddressService.update() path (PUT /addresses/:addressId, drawer'ın gerçek yolu)
 *     creates a notification for other cases
 * 17. secondary DebtorService.updateAddress() path still creates a notification
 * 18. dedupe prevents a duplicate when both paths compute the same dedupe key
 * 19. sourceCaseId exclusion works via the primary AddressService path
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import { DebtorService } from "../debtor.service";
import { AddressService } from "../address.service";
import { AuditService } from "../../audit/audit.service";
import { DebtorCrossCaseNotificationService } from "../debtor-cross-case-notification.service";

const DATABASE_URL = process.env.DATABASE_URL ?? "";
const describeIf = DATABASE_URL ? describe : describe.skip;

// Repo'da zaten kullanılan sentetik-geçerli TCKN'ler (bkz. identity-validation.util.spec.ts,
// seed.service.ts) — kendi checksum hesaplamamız yerine kanıtlı değerler yeniden kullanılıyor.
const VALID_TCKN_1 = "10000000146";
const VALID_TCKN_2 = "12345678028";

describeIf("DBND-D6A-2 — DebtorCrossCaseNotification Integration", () => {
  let prisma: PrismaClient;
  let audit: AuditService;
  let crossCaseNotification: DebtorCrossCaseNotificationService;
  let debtorService: DebtorService;
  let addressService: AddressService;
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    await prisma.$connect();
    audit = new AuditService(prisma as any);
    crossCaseNotification = new DebtorCrossCaseNotificationService(prisma as any, audit);
    debtorService = new DebtorService(
      prisma as any,
      audit,
      {} as any, // officeApproval — update()/addAddress()/updateAddress() yolunda kullanılmıyor
      undefined, // caseDebtorLifecycleGuard — bu yollarda kullanılmıyor
      crossCaseNotification
    );
    addressService = new AddressService(
      prisma as any,
      {} as any, // caseDebtorLifecycleGuard — update() yolunda kullanılmıyor (yalnız setActiveAddress'te)
      audit,
      crossCaseNotification
    );
  });

  afterEach(async () => {
    for (const tenantId of createdTenantIds) {
      await cleanupTenant(tenantId);
    }
    createdTenantIds.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cleanupTenant(tenantId: string) {
    await prisma.debtorCrossCaseNotification.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.caseStaff.deleteMany({ where: { case: { tenantId } } });
    await prisma.caseLawyer.deleteMany({ where: { case: { tenantId } } });
    await prisma.staffMember.deleteMany({ where: { tenantId } });
    await prisma.lawyer.deleteMany({ where: { tenantId } });
    await prisma.debtorAddress.deleteMany({ where: { debtor: { tenantId } } });
    await prisma.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await prisma.case.deleteMany({ where: { tenantId } });
    await prisma.debtor.deleteMany({ where: { tenantId } });
    await prisma.client.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }

  async function setupTenant() {
    const tenantId = `d6-test-${randomUUID().slice(0, 8)}`;
    createdTenantIds.add(tenantId);
    await prisma.tenant.create({
      data: { id: tenantId, name: "D6 Test Tenant", slug: `d6-${randomUUID().slice(0, 8)}` },
    });
    const client = await prisma.client.create({
      data: { tenantId, displayName: "D6 Test Muvekkil", type: "INDIVIDUAL" },
    });
    return { tenantId, clientId: client.id };
  }

  async function createCase(tenantId: string, clientId: string) {
    return prisma.case.create({
      data: {
        tenantId,
        clientId,
        fileNumber: `D6-${randomUUID().slice(0, 6)}`,
        type: "GENERAL_EXECUTION",
        caseStatus: "DERDEST",
        status: "ACTIVE",
      },
    });
  }

  async function createDebtor(tenantId: string, overrides: Record<string, unknown> = {}) {
    return prisma.debtor.create({
      data: {
        tenantId,
        type: "INDIVIDUAL",
        firstName: "Ali",
        lastName: "Borclu",
        name: "Ali Borclu", // Debtor.name zorunlu (String) — DebtorService.create() dışına çıkıldığında elle verilmeli
        identityNo: VALID_TCKN_1,
        tckn: VALID_TCKN_1,
        ...overrides,
      } as any,
    });
  }

  async function createLawyerWithUser(
    tenantId: string,
    opts: { isActive?: boolean; hasUser?: boolean; userActive?: boolean } = {}
  ) {
    const { isActive = true, hasUser = true, userActive = true } = opts;
    let userId: string | undefined;
    if (hasUser) {
      const user = await prisma.user.create({
        data: {
          tenantId,
          email: `lawyer-${randomUUID().slice(0, 8)}@test.local`,
          name: "Test",
          surname: "Lawyer",
          isActive: userActive,
        },
      });
      userId = user.id;
    }
    const lawyer = await prisma.lawyer.create({
      data: { tenantId, name: "Test", surname: "Lawyer", isActive, userId },
    });
    return { lawyer, userId };
  }

  async function attachLawyer(
    caseId: string,
    lawyerId: string,
    opts: { isResponsible?: boolean; receiveNotifications?: boolean } = {}
  ) {
    const { isResponsible = false, receiveNotifications = true } = opts;
    return prisma.caseLawyer.create({
      data: { caseId, lawyerId, isResponsible, receiveNotifications },
    });
  }

  async function createStaffWithUser(
    tenantId: string,
    opts: { isActive?: boolean; hasUser?: boolean; userActive?: boolean } = {}
  ) {
    const { isActive = true, hasUser = true, userActive = true } = opts;
    let userId: string | undefined;
    if (hasUser) {
      const user = await prisma.user.create({
        data: {
          tenantId,
          email: `staff-${randomUUID().slice(0, 8)}@test.local`,
          name: "Test",
          surname: "Staff",
          isActive: userActive,
        },
      });
      userId = user.id;
    }
    const staffMember = await prisma.staffMember.create({
      data: { tenantId, firstName: "Test", lastName: "Staff", staffType: "OFIS_KATIBI", isActive, userId },
    });
    return { staffMember, userId };
  }

  async function attachStaff(
    caseId: string,
    staffMemberId: string,
    opts: { roleOnCase?: string; receiveNotifications?: boolean } = {}
  ) {
    const { roleOnCase = "TEBLIGAT", receiveNotifications = true } = opts;
    return prisma.caseStaff.create({
      data: { caseId, staffMemberId, roleOnCase, receiveNotifications },
    });
  }

  async function notificationsFor(tenantId: string, debtorId: string) {
    return prisma.debtorCrossCaseNotification.findMany({ where: { tenantId, debtorId } });
  }

  // ── Test 1: address change → notification for other cases ────────────
  describe("Test 1: address change creates notification for other cases", () => {
    it("addAddress() on a shared debtor notifies the sibling case's responsible lawyer", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer, userId } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, lawyer.id, { isResponsible: true });

      await debtorService.addAddress(tenantId, debtor.id, {
        addressType: "TEBLIGAT",
        street: "Test sokak No:1",
        city: "İstanbul",
        district: "Kadıköy",
      } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications.some((n) => n.affectedCaseId === caseB.id && n.fieldGroup === "ADDRESS")).toBe(true);
      expect(notifications.find((n) => n.affectedCaseId === caseB.id)?.recipientUserId).toBe(userId);
    });
  });

  // ── Test 2: KEP change → notification ──────────────────────────────────
  describe("Test 2: KEP change creates notification", () => {
    it("update() with new kepAddress notifies sibling case", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId, { kepAddress: "eski@hs01.kep.tr" });
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, lawyer.id, { isResponsible: true });

      await debtorService.update(tenantId, debtor.id, { kepAddress: "yeni@hs01.kep.tr" } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications.some((n) => n.fieldGroup === "KEP_ADDRESS" && n.affectedCaseId === caseB.id)).toBe(true);
    });
  });

  // ── Test 3: TCKN/VKN change → notification ─────────────────────────────
  describe("Test 3: TCKN/VKN change creates notification", () => {
    it("update() with new (valid) tckn notifies sibling case", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId, { tckn: VALID_TCKN_1 });
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, lawyer.id, { isResponsible: true });

      await debtorService.update(tenantId, debtor.id, { tckn: VALID_TCKN_2 } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications.some((n) => n.fieldGroup === "IDENTITY" && n.affectedCaseId === caseB.id)).toBe(true);
      expect(notifications.find((n) => n.fieldGroup === "IDENTITY")?.severity).toBe("CRITICAL");
    });
  });

  // ── Test 4: name/title change → lower-severity notification ───────────
  describe("Test 4: name/title change creates lower-severity notification", () => {
    it("update() with new firstName/lastName notifies with WARNING severity", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId, { firstName: "Ali", lastName: "Borclu", tckn: VALID_TCKN_1 });
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, lawyer.id, { isResponsible: true });

      await debtorService.update(tenantId, debtor.id, { firstName: "Veli" } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      const nameNotif = notifications.find((n) => n.fieldGroup === "NAME");
      expect(nameNotif).toBeDefined();
      expect(nameNotif?.severity).toBe("WARNING");
    });
  });

  // ── Test 5: phone/email change → no notification ───────────────────────
  describe("Test 5: phone/email change creates no notification", () => {
    it("update() with new phone/email does not create any notification", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, lawyer.id, { isResponsible: true });

      await debtorService.update(tenantId, debtor.id, {
        phone: "05551112233",
        email: "yeni@example.com",
      } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications).toHaveLength(0);
    });
  });

  // ── Test 6: notes/risk fields → no notification ────────────────────────
  describe("Test 6: notes/risk fields create no notification", () => {
    it("update() with new notes/riskLevel/riskNotes does not create any notification", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, lawyer.id, { isResponsible: true });

      await debtorService.update(tenantId, debtor.id, {
        notes: "iç not",
        riskLevel: "YUKSEK",
        riskNotes: "risk açıklaması",
      } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications).toHaveLength(0);
    });
  });

  // ── Test 7: responsible lawyer receives notification ───────────────────
  describe("Test 7: responsible lawyer receives notification", () => {
    it("notifies only the isResponsible=true lawyer, not a non-responsible co-counsel", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer: responsible, userId: responsibleUserId } = await createLawyerWithUser(tenantId);
      const { lawyer: other, userId: otherUserId } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, responsible.id, { isResponsible: true });
      await attachLawyer(caseB.id, other.id, { isResponsible: false });

      await debtorService.update(tenantId, debtor.id, { kepAddress: "sorumlu@hs01.kep.tr" } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      const recipientIds = notifications.map((n) => n.recipientUserId);
      expect(recipientIds).toContain(responsibleUserId);
      expect(recipientIds).not.toContain(otherUserId);
      expect(notifications.find((n) => n.recipientUserId === responsibleUserId)?.recipientSource).toBe(
        "RESPONSIBLE_LAWYER"
      );
    });
  });

  // ── Test 8: fallback to all active lawyers ─────────────────────────────
  describe("Test 8: fallback to all active lawyers when responsible lawyer missing", () => {
    it("notifies all eligible CaseLawyer rows when none is isResponsible", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer: l1, userId: u1 } = await createLawyerWithUser(tenantId);
      const { lawyer: l2, userId: u2 } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, l1.id, { isResponsible: false });
      await attachLawyer(caseB.id, l2.id, { isResponsible: false });

      await debtorService.update(tenantId, debtor.id, { kepAddress: "fallback@hs01.kep.tr" } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      const recipientIds = notifications.map((n) => n.recipientUserId);
      expect(recipientIds).toEqual(expect.arrayContaining([u1, u2]));
      expect(notifications.every((n) => n.recipientSource === "FALLBACK_LAWYER")).toBe(true);
    });
  });

  // ── Test 9: TEBLIGAT staff with receiveNotifications=true ──────────────
  describe("Test 9: TEBLIGAT CaseStaff with receiveNotifications=true receives notification", () => {
    it("notifies TEBLIGAT-role staff alongside the responsible lawyer", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, lawyer.id, { isResponsible: true });
      const { staffMember, userId: staffUserId } = await createStaffWithUser(tenantId);
      await attachStaff(caseB.id, staffMember.id, { roleOnCase: "TEBLIGAT", receiveNotifications: true });

      await debtorService.update(tenantId, debtor.id, { kepAddress: "tebligat@hs01.kep.tr" } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      const staffNotif = notifications.find((n) => n.recipientUserId === staffUserId);
      expect(staffNotif).toBeDefined();
      expect(staffNotif?.recipientSource).toBe("TEBLIGAT_STAFF");
    });
  });

  // ── Test 10: other staff roles do not receive notification ─────────────
  describe("Test 10: other staff roles do not receive notification", () => {
    it("YAZI_ISLERI-role staff is not notified", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, lawyer.id, { isResponsible: true });
      const { staffMember, userId: staffUserId } = await createStaffWithUser(tenantId);
      await attachStaff(caseB.id, staffMember.id, { roleOnCase: "YAZI_ISLERI", receiveNotifications: true });

      await debtorService.update(tenantId, debtor.id, { kepAddress: "yazi-isleri@hs01.kep.tr" } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications.some((n) => n.recipientUserId === staffUserId)).toBe(false);
    });
  });

  // ── Test 11: receiveNotifications=false staff does not receive ────────
  describe("Test 11: receiveNotifications=false staff does not receive notification", () => {
    it("opted-out TEBLIGAT staff is not notified", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, lawyer.id, { isResponsible: true });
      const { staffMember, userId: staffUserId } = await createStaffWithUser(tenantId);
      await attachStaff(caseB.id, staffMember.id, { roleOnCase: "TEBLIGAT", receiveNotifications: false });

      await debtorService.update(tenantId, debtor.id, { kepAddress: "opted-out@hs01.kep.tr" } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications.some((n) => n.recipientUserId === staffUserId)).toBe(false);
    });
  });

  // ── Test 12: source case excluded ──────────────────────────────────────
  describe("Test 12: source case is excluded from cross-case notification", () => {
    // Owner review düzeltmesi: sourceCaseId ingress'i artık DTO/service seviyesinde GERÇEK —
    // bu test doğrudan notifyFieldGroupChanges'i değil, debtorService.update()'i dto.sourceCaseId
    // ile çağırıp gerçek route'un exclusion'ı doğru uyguladığını kanıtlar.
    it("update() with dto.sourceCaseId excludes that case from the fan-out", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer: lawyerA } = await createLawyerWithUser(tenantId);
      const { lawyer: lawyerB } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseA.id, lawyerA.id, { isResponsible: true });
      await attachLawyer(caseB.id, lawyerB.id, { isResponsible: true });

      await debtorService.update(tenantId, debtor.id, {
        kepAddress: "kaynak-haric@hs01.kep.tr",
        sourceCaseId: caseA.id,
      } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications.some((n) => n.affectedCaseId === caseA.id)).toBe(false);
      expect(notifications.some((n) => n.affectedCaseId === caseB.id)).toBe(true);
    });

    it("update() without sourceCaseId does not exclude any case (today's real-traffic default)", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer: lawyerA } = await createLawyerWithUser(tenantId);
      const { lawyer: lawyerB } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseA.id, lawyerA.id, { isResponsible: true });
      await attachLawyer(caseB.id, lawyerB.id, { isResponsible: true });

      await debtorService.update(tenantId, debtor.id, { kepAddress: "hepsi-dahil@hs01.kep.tr" } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications.some((n) => n.affectedCaseId === caseA.id)).toBe(true);
      expect(notifications.some((n) => n.affectedCaseId === caseB.id)).toBe(true);
    });
  });

  // ── Test 13: dedupe prevents duplicates ────────────────────────────────
  describe("Test 13: dedupe prevents duplicates", () => {
    it("same changeGeneration + same tuple → only one notification row", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseA.id, lawyer.id, { isResponsible: true });

      const changeGeneration = new Date("2026-01-01T00:00:00Z");
      await crossCaseNotification.notifyFieldGroupChanges({
        tenantId,
        debtorId: debtor.id,
        fieldGroups: ["ADDRESS"],
        changeGeneration,
      });
      await crossCaseNotification.notifyFieldGroupChanges({
        tenantId,
        debtorId: debtor.id,
        fieldGroups: ["ADDRESS"],
        changeGeneration, // AYNI değişim-anı → aynı dedupeKey
      });

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications).toHaveLength(1);
    });

    it("different changeGeneration → a new notification is allowed", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseA.id, lawyer.id, { isResponsible: true });

      await crossCaseNotification.notifyFieldGroupChanges({
        tenantId,
        debtorId: debtor.id,
        fieldGroups: ["ADDRESS"],
        changeGeneration: new Date("2026-01-01T00:00:00Z"),
      });
      await crossCaseNotification.notifyFieldGroupChanges({
        tenantId,
        debtorId: debtor.id,
        fieldGroups: ["ADDRESS"],
        changeGeneration: new Date("2026-02-01T00:00:00Z"),
      });

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications).toHaveLength(2);
    });
  });

  // ── Test 14: ACKNOWLEDGED transition ───────────────────────────────────
  describe("Test 14: ACKNOWLEDGED transition works", () => {
    it("transitions PENDING → ACKNOWLEDGED for the correct recipient", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer, userId } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseA.id, lawyer.id, { isResponsible: true });

      await crossCaseNotification.notifyFieldGroupChanges({
        tenantId,
        debtorId: debtor.id,
        fieldGroups: ["ADDRESS"],
        changeGeneration: new Date(),
      });
      const [notif] = await notificationsFor(tenantId, debtor.id);

      const result = await crossCaseNotification.acknowledge(tenantId, notif.id, userId as string);
      expect(result.acknowledged).toBe(true);

      const updated = await prisma.debtorCrossCaseNotification.findUnique({ where: { id: notif.id } });
      expect(updated?.status).toBe("ACKNOWLEDGED");
      expect(updated?.acknowledgedAt).not.toBeNull();
    });

    it("does not transition when called by a different recipient", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseA.id, lawyer.id, { isResponsible: true });

      await crossCaseNotification.notifyFieldGroupChanges({
        tenantId,
        debtorId: debtor.id,
        fieldGroups: ["ADDRESS"],
        changeGeneration: new Date(),
      });
      const [notif] = await notificationsFor(tenantId, debtor.id);

      const result = await crossCaseNotification.acknowledge(tenantId, notif.id, "someone-else-user-id");
      expect(result.acknowledged).toBe(false);

      const updated = await prisma.debtorCrossCaseNotification.findUnique({ where: { id: notif.id } });
      expect(updated?.status).toBe("PENDING");
    });
  });

  // ── Test 15: EXPIRED transition/query behavior ─────────────────────────
  describe("Test 15: EXPIRED transition/query behavior works", () => {
    it("expireStaleNotifications flips only past-due PENDING rows to EXPIRED", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseA.id, lawyer.id, { isResponsible: true });

      // 40 gün önce üretilmiş gibi davran → expiresAt (changeGeneration+30gün) zaten geçmişte.
      const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      await crossCaseNotification.notifyFieldGroupChanges({
        tenantId,
        debtorId: debtor.id,
        fieldGroups: ["ADDRESS"],
        changeGeneration: longAgo,
      });
      // Taze bir bildirim (henüz süresi dolmamış).
      await crossCaseNotification.notifyFieldGroupChanges({
        tenantId,
        debtorId: debtor.id,
        fieldGroups: ["KEP_ADDRESS"],
        changeGeneration: new Date(),
      });

      const expiredCount = await crossCaseNotification.expireStaleNotifications(tenantId);
      expect(expiredCount).toBe(1);

      const notifications = await notificationsFor(tenantId, debtor.id);
      const addressNotif = notifications.find((n) => n.fieldGroup === "ADDRESS");
      const kepNotif = notifications.find((n) => n.fieldGroup === "KEP_ADDRESS");
      expect(addressNotif?.status).toBe("EXPIRED");
      expect(addressNotif?.expiredAt).not.toBeNull();
      expect(kepNotif?.status).toBe("PENDING");
    });
  });

  // ── Test 16: primary AddressService path creates notification ─────────
  describe("Test 16: primary AddressService.update() path creates notification for other cases", () => {
    it("PUT /addresses/:addressId (drawer'ın gerçek yolu) notifies sibling case's responsible lawyer", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer, userId } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, lawyer.id, { isResponsible: true });
      const address = await prisma.debtorAddress.create({
        data: { debtorId: debtor.id, street: "Eski Sokak No:1", city: "Ankara" },
      });

      await addressService.update(tenantId, address.id, { street: "Yeni Sokak No:2" } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications.some((n) => n.affectedCaseId === caseB.id && n.fieldGroup === "ADDRESS")).toBe(true);
      expect(notifications.find((n) => n.affectedCaseId === caseB.id)?.recipientUserId).toBe(userId);
    });
  });

  // ── Test 17: secondary DebtorService.updateAddress path still works ───
  describe("Test 17: secondary DebtorService.updateAddress() path still creates notification", () => {
    it("PUT /debtors/:id/addresses/:addressId (ikincil yol) notifies sibling case", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer, userId } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseB.id, lawyer.id, { isResponsible: true });
      const address = await prisma.debtorAddress.create({
        data: { debtorId: debtor.id, street: "Eski Sokak No:3", city: "İzmir" },
      });

      await debtorService.updateAddress(tenantId, debtor.id, address.id, { street: "Yeni Sokak No:4" } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications.some((n) => n.affectedCaseId === caseB.id && n.fieldGroup === "ADDRESS")).toBe(true);
      expect(notifications.find((n) => n.affectedCaseId === caseB.id)?.recipientUserId).toBe(userId);
    });
  });

  // ── Test 18: dedupe across both address paths ──────────────────────────
  describe("Test 18: dedupe prevents a duplicate when both paths compute the same dedupe key", () => {
    it("same changeGeneration from primary + secondary path → only one notification", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseA.id, lawyer.id, { isResponsible: true });
      const address = await prisma.debtorAddress.create({
        data: { debtorId: debtor.id, street: "Ortak Sokak No:5", city: "Bursa" },
      });

      // Birincil (AddressService) yolun ürettiği bildirim.
      await addressService.update(tenantId, address.id, { street: "Değişen Sokak No:6" } as any);

      // İkincil yolun (DebtorService.updateAddress) AYNI değişim-anı (address.updatedAt, henüz
      // hiç ikinci bir mutasyon olmadan) için ürettiği çağrıyı simüle eder — iki yolun da PAYLAŞTIĞI
      // notifyFieldGroupChanges dedupe mekanizmasının, hangi path'ten geldiğine bakmaksızın aynı
      // (debtor, case, alıcı, alan-grubu, değişim-anı) tekrarını engellediğini kanıtlar.
      await crossCaseNotification.notifyFieldGroupChanges({
        tenantId,
        debtorId: debtor.id,
        fieldGroups: ["ADDRESS"],
        changeGeneration: address.updatedAt, // AddressService.update()'in kullandığı ÖNCEKİ updatedAt
      });

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications.filter((n) => n.fieldGroup === "ADDRESS")).toHaveLength(1);
    });
  });

  // ── Test 19: sourceCaseId exclusion via primary path ───────────────────
  describe("Test 19: sourceCaseId exclusion works via the primary AddressService path", () => {
    it("addressService.update() with dto.sourceCaseId excludes that case from the fan-out", async () => {
      const { tenantId, clientId } = await setupTenant();
      const debtor = await createDebtor(tenantId);
      const caseA = await createCase(tenantId, clientId);
      const caseB = await createCase(tenantId, clientId);
      await prisma.caseDebtor.create({ data: { caseId: caseA.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      await prisma.caseDebtor.create({ data: { caseId: caseB.id, debtorId: debtor.id, role: "ASIL_BORCLU" } });
      const { lawyer: lawyerA } = await createLawyerWithUser(tenantId);
      const { lawyer: lawyerB } = await createLawyerWithUser(tenantId);
      await attachLawyer(caseA.id, lawyerA.id, { isResponsible: true });
      await attachLawyer(caseB.id, lawyerB.id, { isResponsible: true });
      const address = await prisma.debtorAddress.create({
        data: { debtorId: debtor.id, street: "Hariç Sokak No:7", city: "Antalya" },
      });

      await addressService.update(tenantId, address.id, {
        street: "Dahil Sokak No:8",
        sourceCaseId: caseA.id,
      } as any);

      const notifications = await notificationsFor(tenantId, debtor.id);
      expect(notifications.some((n) => n.affectedCaseId === caseA.id)).toBe(false);
      expect(notifications.some((n) => n.affectedCaseId === caseB.id)).toBe(true);
    });
  });
});
