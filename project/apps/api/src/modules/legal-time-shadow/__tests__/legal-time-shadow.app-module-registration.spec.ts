/**
 * MPB-028(a) PR-3 Evidence Activation — regresyon testi.
 *
 * PR-4 Readiness analizinde tespit edilen kritik bulgu: LegalDeadlineModule ve
 * LegalTimeShadowModule kod olarak vardı ama app.module.ts'e HİÇ KAYITLI DEĞİLDİ
 * (NestJS DI container'ında hiç mevcut değillerdi). Bu test o regresyonu kilitler —
 * app.module.ts'i yüklemeden (Nest bootstrap/DB bağlantısı YOK), yalnız kaynak
 * metnini okuyarak import + @Module imports array kaydını doğrular.
 */
import * as fs from "fs";
import * as path from "path";

const appModuleSource = fs.readFileSync(
  path.join(__dirname, "../../../app.module.ts"),
  "utf-8",
);

describe("AppModule DI registration — LegalDeadlineModule / LegalTimeShadowModule", () => {
  it("LegalDeadlineModule import edilmiştir", () => {
    expect(appModuleSource).toMatch(
      /import\s*\{\s*LegalDeadlineModule\s*\}\s*from\s*["']\.\/modules\/legal-deadline\/legal-deadline\.module["']/,
    );
  });

  it("LegalTimeShadowModule import edilmiştir", () => {
    expect(appModuleSource).toMatch(
      /import\s*\{\s*LegalTimeShadowModule\s*\}\s*from\s*["']\.\/modules\/legal-time-shadow\/legal-time-shadow\.module["']/,
    );
  });

  it("her iki modül de @Module imports array'inde ayrı bir satır olarak kayıtlıdır (runtime DI'a bağlıdır)", () => {
    // Import satırından (import { X } from "...") ayırt etmek için: array elemanı olarak
    // satırın TEK BAŞINA "XModule," olduğu satırları arar.
    expect(appModuleSource).toMatch(/^\s*LegalDeadlineModule,\s*$/m);
    expect(appModuleSource).toMatch(/^\s*LegalTimeShadowModule,\s*$/m);
  });
});
