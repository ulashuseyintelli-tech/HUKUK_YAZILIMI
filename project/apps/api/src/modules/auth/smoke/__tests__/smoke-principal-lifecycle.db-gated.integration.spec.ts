// C36 — smoke principal yaşam döngüsü, GERÇEK Postgres üzerinde.
//
// Kapsam: provisioning idempotence (lost-response), smoke login kabul/ret dalları,
// revoke idempotence + generation, token-generation uyuşmazlığı, ve NORMAL login'in
// smoke principal'ı reddetmesi.
//
// GATE: describeDb → TEST_DATABASE_URL yoksa SKIP. Production DB'ye YAZIM YOKTUR;
// bu suite yalnız disposable Postgres'te çalıştırılır.
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import * as crypto from "crypto";

import { PrismaService } from "@/prisma/prisma.service";
import { describeDb } from "../../../../../test/describe-db";
import { AuthService } from "../../auth.service";
import { SmokeAuthService, SmokeProvisionEnvelope } from "../smoke-auth.service";
import { SmokeTokenService } from "../smoke-token.service";

const SMOKE_SECRET = "c36-integration-smoke-secret-not-production";
const NORMAL_SECRET = "c36-integration-normal-secret-not-production";
const CREDENTIAL = "c36-integration-credential-0123456789";

describeDb("C36 SmokePrincipal lifecycle (integration)", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let smoke: SmokeAuthService;
  let tokens: SmokeTokenService;
  let auth: AuthService;

  const createdTenantIds: string[] = [];
  let signingKey: crypto.KeyObject;
  let publicKeyPem: string;

  const makeEnvelope = (nonce: string, slug: string): SmokeProvisionEnvelope => ({
    operation: "SMOKE_PROVISION",
    nonce,
    notBeforeUtc: new Date(Date.now() - 60_000).toISOString(),
    notAfterUtc: new Date(Date.now() + 30 * 60_000).toISOString(),
    tenantName: `C36 SMOKE ${nonce}`,
    tenantSlug: slug,
    email: `${slug}@invalid.example`,
    name: "C36SMOKE",
    surname: "PRINCIPAL",
    packageManifestSha256: "F".repeat(64),
    baselineSha256: "A".repeat(64),
  });

  const sign = (e: SmokeProvisionEnvelope) =>
    crypto
      .sign(null, Buffer.from(SmokeAuthService.canonicalizeEnvelope(e), "utf8"), signingKey)
      .toString("base64");

  beforeAll(async () => {
    const kp = crypto.generateKeyPairSync("ed25519");
    signingKey = kp.privateKey;
    publicKeyPem = kp.publicKey.export({ type: "spki", format: "pem" }).toString();

    module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: NORMAL_SECRET })],
      providers: [
        PrismaService,
        AuthService,
        SmokeAuthService,
        SmokeTokenService,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string) =>
              k === "JWT_SMOKE_SECRET" ? SMOKE_SECRET
                : k === "JWT_SECRET" ? NORMAL_SECRET
                : k === "SMOKE_PROVISION_PUBLIC_KEY" ? publicKeyPem
                : undefined,
          },
        },
      ],
    }).compile();

    prisma = module.get(PrismaService);
    smoke = module.get(SmokeAuthService);
    tokens = module.get(SmokeTokenService);
    auth = module.get(AuthService);
  });

  afterAll(async () => {
    // Yalnız bu suite'in yarattığı disposable tenant'lar temizlenir (cascade).
    for (const id of createdTenantIds) {
      await prisma.tenant.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await module?.close();
  });

  const provisionFresh = async () => {
    const nonce = `c36-${crypto.randomBytes(8).toString("hex")}`;
    const slug = `c36-smoke-${crypto.randomBytes(5).toString("hex")}`;
    const env = makeEnvelope(nonce, slug);
    const res = await smoke.provision(env, CREDENTIAL, new Date());
    const user = await prisma.user.findUnique({ where: { id: res.userId } });
    if (user) createdTenantIds.push(user.tenantId);
    return { env, res, slug };
  };

  it("G-01 provisioning EXACT 3 satır yazar: Tenant + User + SmokePrincipal", async () => {
    const { res, slug } = await provisionFresh();
    expect(res.outcome).toBe("PROVISIONED");

    const user = await prisma.user.findUnique({ where: { id: res.userId }, include: { tenant: true } });
    expect(user).toBeTruthy();
    expect(user!.isActive).toBe(false);
    expect(user!.passwordHash).toBeNull();
    expect(user!.tenant.slug).toBe(slug);

    const tenantId = user!.tenantId;
    // İş yüzeyi kayıtlarının HİÇBİRİ oluşturulmaz.
    expect(await prisma.office.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.lawyer.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.staffMember.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.client.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.case.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.task.count({ where: { tenantId } })).toBe(0);
    // Lookup seed zinciri de çalıştırılmaz.
    expect(await prisma.lookupTakipTuru.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.lookupMahiyetTipi.count({ where: { tenantId } })).toBe(0);
  });

  it("G-02 AYNI nonce ikinci kez → ALREADY_PRESENT_NO_MUTATION, İKİNCİ INSERT YOK", async () => {
    const { env, res } = await provisionFresh();
    const before = await prisma.smokePrincipal.count();

    const again = await smoke.provision(env, CREDENTIAL, new Date());
    expect(again.outcome).toBe("ALREADY_PRESENT_NO_MUTATION");
    expect(again.smokePrincipalId).toBe(res.smokePrincipalId);
    expect(await prisma.smokePrincipal.count()).toBe(before);
  });

  it("G-03 imzası bozuk envelope → ret, HİÇBİR yazma olmaz", async () => {
    const nonce = `c36-bad-${crypto.randomBytes(6).toString("hex")}`;
    const env = makeEnvelope(nonce, `c36-bad-${crypto.randomBytes(4).toString("hex")}`);
    const before = await prisma.smokePrincipal.count();
    expect(() => smoke.verifyEnvelope(env, Buffer.from("bozuk").toString("base64"), new Date())).toThrow();
    expect(await prisma.smokePrincipal.count()).toBe(before);
  });

  it("G-04 penceresi kapalı envelope → ret (imza geçerli olsa bile)", () => {
    const env: SmokeProvisionEnvelope = {
      ...makeEnvelope("c36-window", "c36-window-slug"),
      notBeforeUtc: new Date(Date.now() - 120_000).toISOString(),
      notAfterUtc: new Date(Date.now() - 60_000).toISOString(),
    };
    expect(() => smoke.verifyEnvelope(env, sign(env), new Date())).toThrow();
  });

  it("G-05 geçerli imza + açık pencere → doğrulama GEÇER", () => {
    const env = makeEnvelope(`c36-ok-${crypto.randomBytes(4).toString("hex")}`, "c36-ok-slug");
    expect(() => smoke.verifyEnvelope(env, sign(env), new Date())).not.toThrow();
  });

  it("G-06 smoke login doğru credential ile PASS, yanlış ile DENY", async () => {
    const { env } = await provisionFresh();
    const token = await smoke.login(env.email, env.tenantSlug, CREDENTIAL, new Date());
    expect(typeof token).toBe("string");
    await expect(smoke.login(env.email, env.tenantSlug, "yanlis-credential-0000", new Date())).rejects.toThrow();
  });

  it("G-07 NORMAL /auth/login smoke principal'ı REDDEDER", async () => {
    const { env } = await provisionFresh();
    await expect(
      auth.login({ email: env.email, tenantSlug: env.tenantSlug, password: CREDENTIAL } as never),
    ).rejects.toThrow();
  });

  it("G-08 revoke IDEMPOTENT: ikinci çağrı yeni mutation üretmez", async () => {
    const { res } = await provisionFresh();
    const first = await smoke.revoke(res.smokePrincipalId, new Date());
    expect(first.outcome).toBe("REVOKED");

    const second = await smoke.revoke(res.smokePrincipalId, new Date());
    expect(second.outcome).toBe("ALREADY_REVOKED_NO_MUTATION");
    // generation İKİNCİ kez ARTMAZ
    expect(second.authGeneration).toBe(first.authGeneration);
  });

  it("G-09 revoke sonrası smoke login ve token çözümü DENY", async () => {
    const { env, res } = await provisionFresh();
    const token = await smoke.login(env.email, env.tenantSlug, CREDENTIAL, new Date());
    const claims = tokens.tryVerify(token)!;
    expect(claims).toBeTruthy();

    await smoke.revoke(res.smokePrincipalId, new Date());

    await expect(smoke.login(env.email, env.tenantSlug, CREDENTIAL, new Date())).rejects.toThrow();
    // ÖNCEDEN üretilmiş token da artık çözülmez (generation + status).
    await expect(smoke.resolveActiveSmokeUser(claims, new Date())).rejects.toThrow();
  });

  it("G-10 generation uyuşmazlığı → DENY (imza geçerli olsa bile)", async () => {
    const { env, res } = await provisionFresh();
    const token = await smoke.login(env.email, env.tenantSlug, CREDENTIAL, new Date());
    const claims = tokens.tryVerify(token)!;
    await expect(smoke.resolveActiveSmokeUser(claims, new Date())).resolves.toBeTruthy();

    await prisma.smokePrincipal.update({
      where: { id: res.smokePrincipalId },
      data: { authGeneration: { increment: 1 } },
    });
    await expect(smoke.resolveActiveSmokeUser(claims, new Date())).rejects.toThrow();
  });

  it("G-11 süresi geçmiş principal → login ve resolve DENY", async () => {
    const { env, res } = await provisionFresh();
    const token = await smoke.login(env.email, env.tenantSlug, CREDENTIAL, new Date());
    const claims = tokens.tryVerify(token)!;

    await prisma.smokePrincipal.update({
      where: { id: res.smokePrincipalId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(smoke.login(env.email, env.tenantSlug, CREDENTIAL, new Date())).rejects.toThrow();
    await expect(smoke.resolveActiveSmokeUser(claims, new Date())).rejects.toThrow();
  });

  it("G-12 bağlı User yanlışlıkla AKTİF edilirse smoke yolu fail-closed kapanır", async () => {
    const { env, res } = await provisionFresh();
    const token = await smoke.login(env.email, env.tenantSlug, CREDENTIAL, new Date());
    const claims = tokens.tryVerify(token)!;

    await prisma.user.update({ where: { id: res.userId }, data: { isActive: true } });
    await expect(smoke.login(env.email, env.tenantSlug, CREDENTIAL, new Date())).rejects.toThrow();
    await expect(smoke.resolveActiveSmokeUser(claims, new Date())).rejects.toThrow();
  });
});
