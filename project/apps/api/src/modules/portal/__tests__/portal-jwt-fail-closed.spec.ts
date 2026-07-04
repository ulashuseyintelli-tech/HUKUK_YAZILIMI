/**
 * H4 — portal.module.ts JWT_SECRET fail-closed testleri.
 *
 * Önceki: JwtModule.register({ secret: process.env.JWT_SECRET || "portal-secret-key" }) —
 * JWT_SECRET tanımlı değilse sessizce repoda yazılı bilinen sabit sırra düşüyordu.
 * Şimdi: portalJwtModuleOptions() JWT_SECRET yoksa açık hata fırlatır (fail-closed);
 * JwtModule.registerAsync({ useFactory }) ile bu boot anında (uygulama ayağa kalkmadan) tetiklenir.
 */
import { portalJwtModuleOptions } from "../portal.module";

describe("H4 — portalJwtModuleOptions fail-closed (JWT_SECRET fallback kaldırıldı)", () => {
  const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

  afterEach(() => {
    if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
  });

  it('JWT_SECRET tanımlı değil → açık hata fırlatır; bilinen sabit "portal-secret-key" değerine sessizce düşmez', () => {
    delete process.env.JWT_SECRET;
    expect(() => portalJwtModuleOptions()).toThrow(/JWT_SECRET/);
    try {
      portalJwtModuleOptions();
      throw new Error("throw beklendi ama fırlamadı");
    } catch (e) {
      expect((e as Error).message).not.toContain("portal-secret-key");
    }
  });

  it("JWT_SECRET boş string → açık hata fırlatır (falsy değer de fallback tetiklemez)", () => {
    process.env.JWT_SECRET = "";
    expect(() => portalJwtModuleOptions()).toThrow(/JWT_SECRET/);
  });

  it('JWT_SECRET tanımlıyken davranış KORUNUR: {secret, signOptions:{expiresIn:"7d"}} AYNEN döner', () => {
    process.env.JWT_SECRET = "gercek-portal-secret-degeri";
    expect(portalJwtModuleOptions()).toEqual({
      secret: "gercek-portal-secret-degeri",
      signOptions: { expiresIn: "7d" },
    });
  });
});
