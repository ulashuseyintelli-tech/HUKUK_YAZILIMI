/**
 * F-B01-04 — YAPISAL KİLİT: ham `Office` satırı OfficeService modülünün DIŞINA çıkmaz.
 *
 * Bu suite DAVRANIŞ değil YAPI kanıtlar. Gerekçesi tektir: bugünkü beş çağıranın yalnız
 * `name` okuması, YARIN eklenecek altıncı bir çağıranın ham satırı alıp `...office` ile
 * bir bildirim token'ına yaymayacağını göstermez. Bir davranış testi yeni çağıranı FARK
 * EDEMEZ; kaynak taraması eder.
 *
 * KURAL: `modules/office/` dışındaki ÜRETİM kodu `OfficeService.getOrCreate`'i çağıramaz.
 * Modül dışı tüketiciler daraltılmış `getOfficeIdentity()` yüzeyini kullanır.
 *
 * NE KANITLAMAZ (dürüstlük sınırı): `getOrCreate`'in kendi dönüş içeriğini bu spec
 * ölçmez — o `office-identity-boundary-fb0104.spec.ts` T1'dir. Bu guard yalnız ÇAĞRI
 * YÜZEYİNİ kilitler; `private` değil kural-tabanlıdır, çünkü `getOrCreate` modül İÇİ
 * meşru testlere (work-pool dual-write, credential containment) açık kalmalıdır.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const API_SRC = join(__dirname, '../../..');
const OFFICE_MODULE_PREFIX = 'modules/office/';

function toKey(absolutePath: string): string {
  return relative(API_SRC, absolutePath).split(sep).join('/');
}

function listTypeScriptFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listTypeScriptFiles(full, acc);
      continue;
    }
    if (entry.endsWith('.ts') || entry.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

/**
 * Yorumları söker. ZORUNLUDUR: bu dosyaların JSDoc'ları yasağın KENDİSİNİ tarif eder
 * ("`getOrCreate` çağrılamaz"), ham metinde arama yapan bir guard doğru yazılmış bir
 * açıklamayı ihlal sanardı. String/template literalleri korunur.
 *
 * SATIR NUMARASI KORUNUR: sökülen yorumun içindeki `\n`'ler geri yazılır. Aksi halde
 * ihlal raporu KAYMIŞ bir satır gösterir (ölçüldü: gerçek 239 → rapor 174) ve okuyanı
 * yanlış yere gönderir.
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, '');
      i = stop;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const ALL_FILES = listTypeScriptFiles(API_SRC);

/** `x.getOrCreate(` — ama `getOrCreateResearch/Balance/Bucket/...` DEĞİL. */
const GET_OR_CREATE_CALL = /\.getOrCreate\s*\(/;

function isProductionFile(key: string): boolean {
  return !key.includes('__tests__/') && !key.endsWith('.spec.ts') && !key.endsWith('.e2e-spec.ts');
}

describe('F-B01-04 static guard — ham Office satiri modul disina cikmaz', () => {
  it('modul disi URETIM kodunda OfficeService.getOrCreate cagrisi YOK', () => {
    const offenders: string[] = [];

    for (const file of ALL_FILES) {
      const key = toKey(file);
      if (!isProductionFile(key)) continue;
      if (key.startsWith(OFFICE_MODULE_PREFIX)) continue;

      const source = stripComments(readFileSync(file, 'utf8'));
      for (const [index, line] of source.split('\n').entries()) {
        if (!GET_OR_CREATE_CALL.test(line)) continue;
        // Ayni ada sahip AMA ilgisiz metodlar (getOrCreateResearch/Balance/Bucket/...)
        // regex'te zaten elenir; burada yalnizca `office` referansi uzerinden cagrilanlar
        // ihlaldir. Referans adi degisebilecegi icin genis yakalayip office'e daraltiyoruz.
        if (!/\boffice\b/i.test(line)) continue;
        offenders.push(`${key}:${index + 1}  ${line.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('bes bilinen tuketici daraltilmis getOfficeIdentity yuzeyini kullanir', () => {
    const consumers = [
      'modules/client-approval/client-approval.service.ts',
      'modules/client-intake-link/client-intake-link.service.ts',
      'modules/client-statement/client-statement.service.ts',
      'modules/client-statement/client-statement-monthly-delivery.service.ts',
      'modules/expense-request/expense-request.service.ts',
    ];

    for (const rel of consumers) {
      const source = stripComments(readFileSync(join(API_SRC, rel), 'utf8'));
      expect({ file: rel, uses: /\.getOfficeIdentity\s*\(/.test(source) }).toEqual({
        file: rel,
        uses: true,
      });
      expect({ file: rel, raw: /\.office\.getOrCreate\s*\(/.test(source) }).toEqual({
        file: rel,
        raw: false,
      });
    }
  });

  it('daraltilmis yuzey OfficeService uzerinde GERCEKTEN tanimli', () => {
    const svc = readFileSync(join(API_SRC, 'modules/office/office.service.ts'), 'utf8');
    expect(/async\s+getOfficeIdentity\s*\(/.test(svc)).toBe(true);
  });
});
