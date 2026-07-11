/**
 * PR-EA-3A.1 — profiler rapor dosyaları için SHA-256 hash manifest üretimi.
 * Prisma/NestJS'ten TAMAMEN bağımsız — yalnız `fs`/`path`/`crypto` kullanır, DB'ye hiç erişemez
 * (bu yüzden mutation riski yapısal olarak yoktur; ayrı dosya olmasının nedeni budur — bkz.
 * enforcement-action-backfill-profiler.static-purity.spec.ts).
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/**
 * `outDir` içindeki `filenames` dosyalarının SHA-256 hash manifest'ini üretir (sabit sıralama,
 * `sha256sum` text-mode formatı: "<hash>  <filename>"). Manifest KENDİ dosyasını hash'lemez —
 * bu fonksiyon yalnız `filenames` listesindeki (manifest.sha256 içermeyen) dosyaları okur.
 */
export function computeReportManifest(outDir: string, filenames: string[]): string {
  const lines = filenames.map((filename) => {
    const content = fs.readFileSync(path.join(outDir, filename));
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    return `${hash}  ${filename}`;
  });
  return lines.join("\n") + "\n";
}
