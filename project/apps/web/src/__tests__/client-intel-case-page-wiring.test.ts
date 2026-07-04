import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * CLIENT-INTEL-4.7D-2B — cases/[id]/page.tsx call-site kaynak wiring.
 *
 * Sayfa devasa (4000+ satır, onlarca API/state bağımlılığı) — bu repoda yerleşik desen (bkz
 * change-status-guarded-wiring.test.tsx "call-site kaynak wiring") tam component render yerine
 * kaynak-düzeyi string doğrulaması kullanır. Aynı desen izlendi.
 *
 * Doğrulanan: createCaseId her zaman geçirilir (caseData.id — dosya zaten belli); createDebtorId
 * YALNIZ dosyada TEK borçlu varsa geçirilir (caseDebtorLinks.length===1) — birden fazla/sıfır
 * borçluda create hedefi belirsiz olduğundan geçirilmez (component tarafında create butonu gizli
 * kalır, bkz IntelStatementSection canCreate guard'ı).
 */
const read = (rel: string) => readFileSync(rel, "utf8");

describe("CLIENT-INTEL-4.7D-2B — cases/[id]/page.tsx IntelStatementSection create-wiring (kaynak)", () => {
  it("caseId + createCaseId her zaman geçirilir; createDebtorId TEK-borçlu koşuluna bağlanır", () => {
    const src = read("src/app/(dashboard)/cases/[id]/page.tsx");
    const marker = "Müvekkil İstihbaratı (Client Intake 4.7d-1)";
    const start = src.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf("ALT İÇERİK - 2 Panel"));

    expect(block).toContain("<IntelStatementSection");
    expect(block).toContain("caseId={caseData.id}");
    expect(block).toContain("createCaseId={caseData.id}");
    // TEK-borçlu koşulu: yanlış borçluya kayıt açmamak için 2+/0 borçluda undefined kalmalı.
    expect(block).toContain("createDebtorId={caseDebtorLinks.length === 1 ? caseDebtorLinks[0].debtor.id : undefined}");
  });

  it("caseDebtorLinks zaten üstte tanımlı (mükerrer tanım/hesaplama EKLENMEDİ)", () => {
    const src = read("src/app/(dashboard)/cases/[id]/page.tsx");
    const occurrences = (src.match(/const caseDebtorLinks = caseData\.debtors \|\| \[\];/g) || []).length;
    expect(occurrences).toBe(1); // mevcut tek tanım reuse edildi, yeni bir tane EKLENMEDİ
  });
});
