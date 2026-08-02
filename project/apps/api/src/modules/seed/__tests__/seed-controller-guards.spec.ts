/**
 * CLIENT-OWN-13-I02-R3 (owner D03, RATIFIED) — SeedController RBAC wiring testleri.
 *
 * "Açık olduğu ortamlarda bütün /seed/* endpoint'leri en az JwtAuthGuard ister;
 *  kimliksiz seedPublicInstitutions bırakılmaz." `public-institutions` ÖNCEDEN kimliksizdi
 *  (auth gerektirmiyordu) — bu test o regresyonu KİLİTLER (mutasyon dişi M-guard).
 */
import "reflect-metadata";
import { SeedController } from "../seed.controller";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";

const GUARDS_METADATA = "__guards__";
function methodGuards(method: string): any[] {
  return Reflect.getMetadata(GUARDS_METADATA, (SeedController.prototype as any)[method]) || [];
}

describe("SeedController — bütün /seed/* route'ları JwtAuthGuard ile korunur (D03)", () => {
  const routes = [
    "seedAll",
    "seedLookups",
    "seedLawyers",
    "seedClients",
    "seedDebtors",
    "seedCases",
    "seedExecutionOffices",
    "seedStaff",
    "getStatus",
    "fixClients",
    "fixLawyers",
    "seedOffice",
    "seedBankAccounts",
    "seedPublicInstitutions",
    "seedPublicInstitutionDebtors",
  ];

  it.each(routes)("%s → JwtAuthGuard ile korunur", (method) => {
    expect(methodGuards(method)).toContain(JwtAuthGuard);
  });

  it("seedPublicInstitutions ARTIK kimliksiz DEĞİL (önceki regresyon kapatıldı)", () => {
    expect(methodGuards("seedPublicInstitutions").length).toBeGreaterThan(0);
  });
});
