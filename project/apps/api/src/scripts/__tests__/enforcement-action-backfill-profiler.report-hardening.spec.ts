/**
 * PR-EA-3A.1 — profiler report hardening: DB gerektirmeyen saf/dosya-tabanlı testler.
 * `parseDatabaseIdentity`/`formatDatabaseIdentity` credential redaction'ı ve `computeReportManifest`
 * hash/sıralama/self-hash-yok davranışını doğrular.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  computeReportManifest,
  parseDatabaseIdentity,
  formatDatabaseIdentity,
} from "../enforcement-action-backfill-profiler";

describe("parseDatabaseIdentity / formatDatabaseIdentity — credential redaction", () => {
  const CREDENTIALED_URL = "postgresql://myuser:mysecretpass@dbhost.internal:5433/mydb?sslmode=require";

  it("host/port/databaseName'i doğru ayrıştırır", () => {
    const identity = parseDatabaseIdentity(CREDENTIALED_URL, "staging");
    expect(identity.host).toBe("dbhost.internal");
    expect(identity.port).toBe("5433");
    expect(identity.databaseName).toBe("mydb");
    expect(identity.environment).toBe("staging");
    expect(identity.readOnlyMode).toBe(true);
  });

  it("dönen objede kullanıcı adı, şifre veya query-string ASLA görünmez", () => {
    const identity = parseDatabaseIdentity(CREDENTIALED_URL, "staging");
    const serialized = JSON.stringify(identity);
    expect(serialized).not.toContain("myuser");
    expect(serialized).not.toContain("mysecretpass");
    expect(serialized).not.toContain("sslmode");
    expect(serialized).not.toContain(CREDENTIALED_URL);
  });

  it("formatDatabaseIdentity çıktısı da credential içermez", () => {
    const identity = parseDatabaseIdentity(CREDENTIALED_URL, "staging");
    const formatted = formatDatabaseIdentity(identity);
    expect(formatted).toBe("dbhost.internal:5433/mydb");
    expect(formatted).not.toContain("myuser");
    expect(formatted).not.toContain("mysecretpass");
  });

  it("DATABASE_URL tanımsızken güvenli varsayılan döner", () => {
    const identity = parseDatabaseIdentity(undefined, undefined);
    expect(identity.host).toBe("(tanımsız)");
    expect(identity.environment).toBe("(tanımsız)");
    expect(identity.readOnlyMode).toBe(true);
  });

  it("geçersiz URL güvenle ele alınır (throw etmez, credential sızdırmaz)", () => {
    const identity = parseDatabaseIdentity("not-a-valid-url", "prod");
    expect(identity.host).toBe("(ayrıştırılamadı)");
    expect(JSON.stringify(identity)).not.toContain("not-a-valid-url");
  });
});

describe("computeReportManifest", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ea3a1-manifest-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFixture(filename: string, content: string) {
    fs.writeFileSync(path.join(tmpDir, filename), content, "utf8");
  }

  it("her dosya için gerçek içerikle eşleşen SHA-256 üretir", () => {
    writeFixture("a.txt", "hello");
    writeFixture("b.txt", "world");

    const manifest = computeReportManifest(tmpDir, ["a.txt", "b.txt"]);

    const expectedA = crypto.createHash("sha256").update("hello").digest("hex");
    const expectedB = crypto.createHash("sha256").update("world").digest("hex");
    expect(manifest).toContain(`${expectedA}  a.txt`);
    expect(manifest).toContain(`${expectedB}  b.txt`);
  });

  it("verilen filenames sırasını korur (deterministik sıralama)", () => {
    writeFixture("z.txt", "1");
    writeFixture("a.txt", "2");

    const manifest = computeReportManifest(tmpDir, ["z.txt", "a.txt"]);
    const lines = manifest.trim().split("\n");

    expect(lines[0]).toMatch(/ {2}z\.txt$/);
    expect(lines[1]).toMatch(/ {2}a\.txt$/);
  });

  it("kendi dosyasını (manifest.sha256) hiç hash'lemez", () => {
    writeFixture("summary.json", "{}");
    // Kasıtlı olarak manifest.sha256'yı ÖNCEDEN yazıyoruz (main()'in gerçek akışında bu dosya
    // computeReportManifest çağrısından SONRA yazılır) — burada bile filenames listesine dahil
    // edilmediği sürece manifest kendi içeriğini hiç okumaz/hash'lemez.
    writeFixture("manifest.sha256", "onceden-var-olan-icerik");

    const manifest = computeReportManifest(tmpDir, ["summary.json"]);

    expect(manifest).not.toContain("manifest.sha256");
  });

  it("format 'sha256  filename' (iki boşluk) şeklindedir ve sonda satır sonu vardır", () => {
    writeFixture("x.txt", "veri");
    const manifest = computeReportManifest(tmpDir, ["x.txt"]);
    expect(manifest).toMatch(/^[0-9a-f]{64} {2}x\.txt\n$/);
  });
});
