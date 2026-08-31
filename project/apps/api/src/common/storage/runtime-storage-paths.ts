/**
 * C37-EXTERNAL-RUNTIME-STORAGE — merkezi runtime depolama yolu servisi.
 *
 * Amac: uygulamanin calisma zamaninda yazdigi HICBIR dosyanin immutable release
 * kokunun icine dusmemesi. Release agaci runtime icin salt-okunurdur; mutable
 * veri release DISINDAKI koklerde durur.
 *
 * Production'da `HUKUK_DATA_ROOT` ve `HUKUK_OCR_MODELS_ROOT` ZORUNLUDUR. Eksik
 * veya guvensiz bir yol boot'ta HARD FAIL uretir; `process.cwd()` fallback'ine
 * SESSIZCE donulmez.
 *
 * Dev/test'te (NODE_ENV !== 'production') degiskenler verilmezse eski yerel
 * yerlesim korunur; boylece mevcut gelistirme ve test akisi kirilmaz.
 */
import { existsSync, lstatSync, mkdirSync, realpathSync } from "fs";
import * as path from "path";

/** Yazilabilir mantiksal kova. Kapali kume — serbest yol YOKTUR. */
export type StorageBucket = "POA_UPLOADS" | "PORTAL_DOCUMENTS" | "TARIFFS";

/** Kova -> data root altindaki gorece yol + tenant kapsami. */
const BUCKETS: Record<StorageBucket, { segments: string[]; tenantScoped: boolean }> = {
  POA_UPLOADS: { segments: ["uploads", "poa"], tenantScoped: true },
  PORTAL_DOCUMENTS: { segments: ["portal-documents"], tenantScoped: true },
  TARIFFS: { segments: ["tariffs"], tenantScoped: false },
};

/**
 * Dev/test geriye-uyumluluk yerlesimi. Yalniz NODE_ENV !== 'production' ve
 * degisken verilmemisse kullanilir.
 */
const LEGACY_DEV_BUCKET_PATHS: Record<StorageBucket, string[]> = {
  POA_UPLOADS: ["data", "uploads", "poa"],
  PORTAL_DOCUMENTS: ["data", "portal-documents"],
  TARIFFS: ["src", "config", "tariffs"],
};

/** Windows'ta ayrilmis cihaz adlari — dosya/dizin adi olarak kullanilamaz. */
const RESERVED_WINDOWS_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

const MAX_SEGMENT_LENGTH = 128;
const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

export class RuntimeStoragePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeStoragePathError";
  }
}

/**
 * Tek bir yol segmentini (tenantId, dosya adi, yil) fail-closed dogrular.
 *
 * `resolve + startsWith` tek basina yeterli SAYILMAZ; segment daha diske
 * dokunmadan reddedilir.
 */
export function assertSafeSegment(raw: unknown, label: string): string {
  if (typeof raw !== "string") {
    throw new RuntimeStoragePathError(`${label}: deger metin degil`);
  }
  // Unicode normalizasyon belirsizligi: girdi kendi NFC formunda olmali.
  if (raw !== raw.normalize("NFC")) {
    throw new RuntimeStoragePathError(`${label}: Unicode normalizasyon belirsizligi`);
  }
  if (raw.length === 0) {
    throw new RuntimeStoragePathError(`${label}: bos`);
  }
  if (raw.length > MAX_SEGMENT_LENGTH) {
    throw new RuntimeStoragePathError(`${label}: asiri uzunluk (${raw.length})`);
  }
  if (raw === "." || raw === "..") {
    throw new RuntimeStoragePathError(`${label}: nokta segmenti`);
  }
  // Ayirac / rooted path / ADS enjeksiyonu tek desende yakalanir.
  if (!SEGMENT_PATTERN.test(raw)) {
    throw new RuntimeStoragePathError(`${label}: izinsiz karakter (yalniz [A-Za-z0-9._-])`);
  }
  if (raw.endsWith(".") || raw.endsWith(" ")) {
    throw new RuntimeStoragePathError(`${label}: sonda nokta/bosluk`);
  }
  // Windows kisa (8.3) ad belirsizligi.
  if (raw.includes("~")) {
    throw new RuntimeStoragePathError(`${label}: 8.3 kisa ad belirsizligi`);
  }
  const stem = raw.split(".")[0].toLowerCase();
  if (RESERVED_WINDOWS_NAMES.has(stem)) {
    throw new RuntimeStoragePathError(`${label}: ayrilmis Windows adi`);
  }
  return raw;
}

/**
 * Tenant segmenti icin ek kisit: buyuk harf YASAK.
 *
 * Windows dosya sistemi buyuk/kucuk harf duyarsizdir; `TENANT` ve `tenant`
 * ayni dizini paylasirdi. Tenant kimlikleri cuid'dir (daima kucuk harf), bu
 * yuzden kisit gercek veriyi etkilemez ve olasi bir carpismayi sessiz
 * paylasim yerine gorunur hataya cevirir.
 */
export function assertSafeTenantSegment(raw: unknown): string {
  const value = assertSafeSegment(raw, "tenantId");
  if (value !== value.toLowerCase()) {
    throw new RuntimeStoragePathError("tenantId: buyuk/kucuk harf belirsizligi");
  }
  return value;
}

function isWindows(): boolean {
  return process.platform === "win32";
}

function samePath(a: string, b: string): boolean {
  return isWindows() ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * `child`, `parent` agacinin ICINDE mi? Ayirac siniri acikca uygulanir —
 * `C:\ops\data-evil` yolu `C:\ops\data` icinde SAYILMAZ.
 */
export function isContained(parent: string, child: string): boolean {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  if (samePath(p, c)) return true;
  const prefix = p.endsWith(path.sep) ? p : p + path.sep;
  return isWindows() ? c.toLowerCase().startsWith(prefix.toLowerCase()) : c.startsWith(prefix);
}

/**
 * Reparse point (symlink / junction) reddi.
 *
 * Iki katman: (1) lstat ile dogrudan link tespiti, (2) realpath karsilastirmasi
 * — bir ust segment junction ise cozulen yol farklilasir.
 */
function assertNoReparse(target: string, label: string): void {
  let current = path.resolve(target);
  const seen = new Set<string>();
  while (!seen.has(current)) {
    seen.add(current);
    if (existsSync(current)) {
      let st;
      try {
        st = lstatSync(current);
      } catch {
        break;
      }
      if (st.isSymbolicLink()) {
        throw new RuntimeStoragePathError(`${label}: reparse point / symlink / junction reddedildi (${current})`);
      }
    }
    const parent = path.dirname(current);
    if (samePath(parent, current)) break;
    current = parent;
  }
  if (existsSync(target)) {
    let real: string;
    try {
      real = realpathSync.native(target);
    } catch {
      real = realpathSync(target);
    }
    if (!samePath(real, path.resolve(target))) {
      throw new RuntimeStoragePathError(`${label}: yol yeniden yonlendiriliyor (${target} -> ${real})`);
    }
  }
}

/** Release kokunu `process.cwd()`'den turetir: <release>/project/apps/api */
export function resolveReleaseRoot(cwd: string = process.cwd()): string {
  return path.resolve(cwd, "..", "..", "..");
}

function assertProductionRoot(value: string | undefined, envName: string, cwd: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RuntimeStoragePathError(
      `${envName} production'da ZORUNLUDUR. process.cwd() fallback'i production'da kullanilmaz.`,
    );
  }
  const raw = value.trim();
  if (raw.startsWith("\\\\")) {
    throw new RuntimeStoragePathError(`${envName}: UNC yol production'da kabul edilmez`);
  }
  if (!path.isAbsolute(raw)) {
    throw new RuntimeStoragePathError(`${envName}: mutlak yol olmalidir (verilen: ${raw})`);
  }
  if (raw.includes("~")) {
    throw new RuntimeStoragePathError(`${envName}: 8.3 kisa ad belirsizligi`);
  }
  const resolved = path.resolve(raw);
  if (!existsSync(resolved)) {
    throw new RuntimeStoragePathError(`${envName}: dizin bulunamadi (${resolved})`);
  }
  // Reparse kontrolu isDirectory'den ONCE gelir: bir junction/symlink icin
  // `lstat().isDirectory()` false doner ve hedef yine reddedilirdi, ama teshis
  // "dizin degil" olurdu. Dogru gerekce raporlanmalidir.
  assertNoReparse(resolved, envName);
  if (!lstatSync(resolved).isDirectory()) {
    throw new RuntimeStoragePathError(`${envName}: dizin degil (${resolved})`);
  }

  const releaseRoot = resolveReleaseRoot(cwd);
  if (isContained(releaseRoot, resolved) || isContained(resolved, releaseRoot)) {
    throw new RuntimeStoragePathError(
      `${envName}: release koku ile ic ice olamaz (${resolved} <-> ${releaseRoot})`,
    );
  }
  if (isContained(path.resolve(cwd), resolved)) {
    throw new RuntimeStoragePathError(`${envName}: calisma dizini icinde olamaz (${resolved})`);
  }
  // Kanonik (gercek) hali kullanilir; boylece turetilen tum yollar buyuk/kucuk
  // harf ve 8.3 acisindan tek bir referansa baglanir.
  try {
    return realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

export interface RuntimeStoragePathsOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}

export class RuntimeStoragePaths {
  readonly isProduction: boolean;
  readonly dataRoot: string;
  readonly ocrModelsRoot: string;
  private readonly cwd: string;
  private readonly legacyLayout: boolean;

  constructor(options: RuntimeStoragePathsOptions = {}) {
    const env = options.env ?? process.env;
    this.cwd = path.resolve(options.cwd ?? process.cwd());
    this.isProduction = env.NODE_ENV === "production";

    const rawData = env.HUKUK_DATA_ROOT;
    const rawOcr = env.HUKUK_OCR_MODELS_ROOT;

    if (this.isProduction) {
      this.dataRoot = assertProductionRoot(rawData, "HUKUK_DATA_ROOT", this.cwd);
      this.ocrModelsRoot = assertProductionRoot(rawOcr, "HUKUK_OCR_MODELS_ROOT", this.cwd);
      if (samePath(this.dataRoot, this.ocrModelsRoot)) {
        throw new RuntimeStoragePathError(
          "HUKUK_DATA_ROOT ve HUKUK_OCR_MODELS_ROOT ayni olamaz (farkli ACL sinifi).",
        );
      }
      if (isContained(this.dataRoot, this.ocrModelsRoot) || isContained(this.ocrModelsRoot, this.dataRoot)) {
        throw new RuntimeStoragePathError(
          "HUKUK_DATA_ROOT ve HUKUK_OCR_MODELS_ROOT ic ice olamaz (farkli ACL sinifi).",
        );
      }
      this.legacyLayout = false;
      return;
    }

    // Dev/test: degisken verilmisse ona uyulur, verilmemisse eski yerlesim.
    this.legacyLayout = !rawData;
    this.dataRoot = rawData ? path.resolve(rawData) : this.cwd;
    this.ocrModelsRoot = rawOcr ? path.resolve(rawOcr) : this.cwd;
  }

  /** Kova kok dizini (tenant segmenti dahil). Dizin yoksa olusturulur. */
  bucketDir(bucket: StorageBucket, tenantId?: string): string {
    const dir = this.resolveBucketDir(bucket, tenantId);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    assertNoReparse(dir, `bucket:${bucket}`);
    return dir;
  }

  /** Kova kok dizini — olusturmadan. */
  resolveBucketDir(bucket: StorageBucket, tenantId?: string): string {
    const spec = BUCKETS[bucket];
    if (!spec) {
      throw new RuntimeStoragePathError(`bilinmeyen kova: ${String(bucket)}`);
    }
    const base = this.legacyLayout
      ? path.join(this.dataRoot, ...LEGACY_DEV_BUCKET_PATHS[bucket])
      : path.join(this.dataRoot, ...spec.segments);

    if (!spec.tenantScoped) {
      return base;
    }
    const tenant = assertSafeTenantSegment(tenantId);
    const dir = path.join(base, tenant);
    if (!isContained(base, dir)) {
      throw new RuntimeStoragePathError(`tenantId: containment ihlali`);
    }
    return dir;
  }

  /** Kova icinde TEK segmentlik guvenli dosya yolu. Dizin olusturulur. */
  filePath(bucket: StorageBucket, fileName: string, tenantId?: string): string {
    const safeName = assertSafeSegment(fileName, "fileName");
    const dir = this.bucketDir(bucket, tenantId);
    const target = path.join(dir, safeName);
    if (!isContained(dir, target) || path.dirname(target) !== dir) {
      throw new RuntimeStoragePathError("fileName: containment ihlali");
    }
    return target;
  }

  /**
   * Disaridan gelen (or. veritabaninda saklanan) mutlak bir yolun kova icinde
   * oldugunu operasyon aninda dogrular. Silme/indirme oncesi ZORUNLUDUR.
   */
  assertContained(bucket: StorageBucket, absolutePath: string, tenantId?: string): string {
    if (typeof absolutePath !== "string" || absolutePath.length === 0) {
      throw new RuntimeStoragePathError("yol: bos");
    }
    const dir = this.resolveBucketDir(bucket, tenantId);
    const target = path.resolve(absolutePath);
    if (!isContained(dir, target)) {
      throw new RuntimeStoragePathError(`yol kova disinda: ${target}`);
    }
    // TOCTOU: cagri aninda yeniden dogrulanir.
    assertNoReparse(target, `bucket:${bucket}`);
    return target;
  }

  /** OCR dil modeli dosyasi (salt-okunur kullanim). */
  ocrModelPath(lang: string): string {
    const safe = assertSafeSegment(lang, "lang");
    return path.join(this.ocrModelsRoot, `${safe}.traineddata`);
  }

  /** Verilen dillerin modelleri mevcut mu? Eksikse fail-closed. */
  assertOcrModelsPresent(langs: string[]): void {
    const missing = langs.filter((l) => !existsSync(this.ocrModelPath(l)));
    if (missing.length > 0) {
      throw new RuntimeStoragePathError(
        `OCR dil modeli eksik: ${missing.join(", ")} (aranan kok: ${this.ocrModelsRoot}). ` +
          "Model indirilmez ve release kokune yazilmaz.",
      );
    }
  }
}

let cachedKey: string | null = null;
let cachedInstance: RuntimeStoragePaths | null = null;

/**
 * Surec genelinde tek ornek. Anahtar, cozumlemeyi etkileyen ortam degerlerinden
 * turetilir; degiskenler degisirse yeni ornek uretilir (test icin reset API'si
 * gerekmez).
 */
export function runtimeStoragePaths(options: RuntimeStoragePathsOptions = {}): RuntimeStoragePaths {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const key = [env.NODE_ENV, env.HUKUK_DATA_ROOT, env.HUKUK_OCR_MODELS_ROOT, cwd].join("\u0000");
  if (cachedInstance && cachedKey === key) {
    return cachedInstance;
  }
  const instance = new RuntimeStoragePaths({ env, cwd });
  cachedKey = key;
  cachedInstance = instance;
  return instance;
}
