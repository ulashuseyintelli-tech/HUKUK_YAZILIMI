/**
 * OFFICE-P5-SECURITY-COMPLETION-R01 / F-B01-01 — GET /api/auth/me credential containment.
 *
 * BULGU (P5-B01 evidence): /auth/me tam Prisma User satırını döndürüyordu — passwordHash
 * (bcrypt) ve tokenVersion (session-revocation sayacı) dahil. Zincir: JwtStrategy.validate →
 * AuthService.validateUser (select'siz findUnique) → argümansız @CurrentUser() → `{ user }`.
 *
 * Bu spec yeni sözleşmeyi kilitler:
 *  1) Alan listesi SABİT: yalnız passwordHash + tokenVersion (owner-ratified bounded kapsam).
 *  2) Anahtarlar yanıtta TAMAMEN YOK (null'a çekilmiş değil) — negatif assertion zorunlu.
 *  3) Diğer alanlar (nested tenant dahil) birebir korunur; passwordChangedAt owner
 *     kapsamında OLMADIĞI için bilinçli olarak DOKUNULMAZ (bounded-patch belgesi).
 *  4) login/register yanıt şekli bu değişiklikten etkilenmez (yalnız /auth/me projeksiyonu).
 */
import { AuthController } from "../auth.controller";
import {
  AUTH_ME_CREDENTIAL_FIELDS,
  toPublicAuthMeUser,
} from "../user-public-projection";

const fullUserRow = () => ({
  id: "u1",
  tenantId: "t1",
  email: "ada@telli.example",
  name: "Ada",
  surname: "Lovelace",
  role: "USER",
  isActive: true,
  passwordHash: "$2b$10$abcdefghijklmnopqrstuv",
  tokenVersion: 3,
  passwordChangedAt: new Date("2026-01-01T00:00:00Z"),
  createdAt: new Date("2025-01-01T00:00:00Z"),
  tenant: { id: "t1", name: "TELLİ HUKUK", slug: "telli-hukuk" },
});

describe("F-B01-01 — /auth/me credential containment", () => {
  it("alan listesi kilidi: yalnız passwordHash + tokenVersion (owner-ratified kapsam)", () => {
    expect([...AUTH_ME_CREDENTIAL_FIELDS]).toEqual(["passwordHash", "tokenVersion"]);
  });

  it("toPublicAuthMeUser: credential anahtarları TAMAMEN silinir (null'a çekilmez)", () => {
    const out: any = toPublicAuthMeUser(fullUserRow());
    expect("passwordHash" in out).toBe(false);
    expect("tokenVersion" in out).toBe(false);
    expect(out).not.toHaveProperty("passwordHash");
    expect(out).not.toHaveProperty("tokenVersion");
  });

  it("diğer alanlar birebir korunur (nested tenant dahil); passwordChangedAt bounded kapsam gereği KALIR", () => {
    const row = fullUserRow();
    const out: any = toPublicAuthMeUser(row);
    expect(out).toMatchObject({
      id: "u1",
      tenantId: "t1",
      email: "ada@telli.example",
      name: "Ada",
      role: "USER",
      isActive: true,
    });
    expect(out.tenant).toEqual(row.tenant);
    // Owner kapsamı yalnız iki alanı adlandırır; passwordChangedAt bilinçli olarak dokunulmaz.
    expect(out.passwordChangedAt).toEqual(row.passwordChangedAt);
    // Girdi mutasyona uğramaz (request.user paylaşılan nesnedir).
    expect(row.passwordHash).toBe("$2b$10$abcdefghijklmnopqrstuv");
    expect(row.tokenVersion).toBe(3);
  });

  it("idempotent: alanlar zaten yoksa çıktı anlamsal olarak değişmez", () => {
    const once: any = toPublicAuthMeUser(fullUserRow());
    const twice: any = toPublicAuthMeUser(once);
    expect(twice).toEqual(once);
  });

  it("AuthController.me: yanıttaki user'da passwordHash/tokenVersion YOK, kimlik alanları VAR", () => {
    const controller = new AuthController({} as any, {} as any);
    const res: any = controller.me(fullUserRow());
    expect(res.user).toBeDefined();
    expect(res.user).not.toHaveProperty("passwordHash");
    expect(res.user).not.toHaveProperty("tokenVersion");
    expect(res.user).toMatchObject({ id: "u1", email: "ada@telli.example", role: "USER" });
    expect(res.user.tenant).toMatchObject({ slug: "telli-hukuk" });
  });
});
