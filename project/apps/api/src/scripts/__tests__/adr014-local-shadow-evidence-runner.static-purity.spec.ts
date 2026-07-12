/**
 * ADR-014 shadow evidence runner — STATİK SAFLIK GUARD'I.
 * Runner + saf çekirdek kaynak dosyalarında hiçbir Prisma mutation çağrısı, yazma bayrağı veya
 * credential literal'i OLMADIĞINI; ve read-only enforcement'ın kaynakta MEVCUT olduğunu kalıcı
 * kilitler. Salt-okuma tasarımı gereği bu dosyalar hiçbir zaman yazma yolu içermeyecektir
 * (owner GO-COMPLETE decision 4 — READ ONLY / REPEATABLE READ) — GEVŞETİLMEZ (PR-EA-3A emsali).
 */
import * as fs from 'fs';
import * as path from 'path';

const RUNNER_PATH = path.join(__dirname, '..', 'adr014-local-shadow-evidence-runner.ts');
const CORE_PATH = path.join(__dirname, '..', 'adr014-shadow-evidence.core.ts');

const MUTATION_PATTERNS: RegExp[] = [
  /\.create\(/,
  /\.createMany\(/,
  /\.update\(/,
  /\.updateMany\(/,
  /\.upsert\(/,
  /\.delete\(/,
  /\.deleteMany\(/,
  /\$executeRaw/,
];

const WRITE_FLAG_PATTERNS: RegExp[] = [/--confirm/, /--apply/, /--write/, /--execute/, /--commit/];

describe("ADR-014 shadow evidence runner statik saflık guard'ı", () => {
  const runnerSource = fs.readFileSync(RUNNER_PATH, 'utf8');
  const coreSource = fs.readFileSync(CORE_PATH, 'utf8');

  it('runner hiçbir Prisma mutation çağrısı içermez (yalnız $queryRaw/SELECT)', () => {
    for (const pattern of MUTATION_PATTERNS) {
      expect(runnerSource).not.toMatch(pattern);
    }
  });

  it('runner hiçbir yazma bayrağı (--confirm/--apply/--write/--execute/--commit) tanımlamaz', () => {
    for (const pattern of WRITE_FLAG_PATTERNS) {
      expect(runnerSource).not.toMatch(pattern);
    }
  });

  it('runner credential-benzeri hiçbir literal içermez', () => {
    expect(runnerSource).not.toMatch(/password\s*[:=]/i);
    expect(runnerSource).not.toMatch(/postgresql:\/\/\w+:\S+@/);
  });

  it('runner motor-seviyesi read-only enforcement + doğrulamasını KAYNAKTA taşır (gevşetilemez)', () => {
    expect(runnerSource).toMatch(/default_transaction_read_only=on/);
    expect(runnerSource).toMatch(/current_setting\('transaction_read_only'\)/);
    // fail-closed: doğrulama başarısızsa throw
    expect(runnerSource).toMatch(/SALT-OKUMA DOĞRULANAMADI/);
  });

  it('saf çekirdek hiçbir Prisma mutation çağrısı içermez', () => {
    for (const pattern of MUTATION_PATTERNS) {
      expect(coreSource).not.toMatch(pattern);
    }
  });

  it('saf çekirdek Prisma veya NestJS import etmez (DB erişimi yapısal olarak yok)', () => {
    expect(coreSource).not.toMatch(/@prisma\/client/);
    expect(coreSource).not.toMatch(/@nestjs/);
    expect(coreSource).not.toMatch(/PrismaService/);
    expect(coreSource).not.toMatch(/PrismaClient/);
  });

  it('saf çekirdek sistem saati veya dosya sistemi kullanmaz (deterministik, zaman dışarıdan)', () => {
    expect(coreSource).not.toMatch(/Date\.now\(\)/);
    expect(coreSource).not.toMatch(/new Date\(/);
    expect(coreSource).not.toMatch(/from ["']fs["']/);
  });
});
