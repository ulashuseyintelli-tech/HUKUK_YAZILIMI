import * as fs from 'node:fs';
import * as path from 'node:path';

const UYAP_ROOT = path.resolve(__dirname, '../..');
const OFFICIAL_ROOT = path.resolve(__dirname, '..');

function read(relative: string): string {
  return fs.readFileSync(path.join(UYAP_ROOT, relative), 'utf8');
}

function sourceFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && full.endsWith('.ts') ? [full] : [];
  });
}

describe('UYAP structured-emission static authority boundary', () => {
  it('public OfficialAlacakKalemi caller-supplied wrapper/legal-basis authority taşımaz', () => {
    const types = read('official/official-exchange.types.ts');
    const claimBlock = /export interface OfficialAlacakKalemi \{([\s\S]*?)\n\}/.exec(types)?.[1] ?? '';
    expect(claimBlock).not.toContain('wrapperResolution');
    expect(claimBlock).not.toContain('legalBasis');
  });

  it('legacy serializer direct ClaimItem akışını fail-closed tutar', () => {
    const builder = read('official/official-exchange-builder.ts');
    expect(builder).toContain("code: 'UNAUTHORIZED_ALACAK_KALEMI_PARENT'");
    expect(builder).toContain('createM01QualifiedOfficialExchangeInput');
    expect(builder).toContain('issuedM01Claims.has(qualified)');
    expect(builder).not.toMatch(/\bdosya\.ele\(\s*['"`]alacakKalemi['"`]/);
  });

  it('opaque factory ve qualified serializer production’da yalnız structured service tarafından çağrılır', () => {
    const allowed = path.join(OFFICIAL_ROOT, 'official-alacakkalemi-structured-emission.service.ts');
    const offenders = sourceFiles(UYAP_ROOT).filter((file) => {
      if (file === allowed || file.includes(`${path.sep}__tests__${path.sep}`)) return false;
      if (file.endsWith('official-exchange-builder.ts')) return false;
      const source = fs.readFileSync(file, 'utf8');
      return (
        source.includes('createM01QualifiedOfficialAlacakKalemi(') ||
        source.includes('createM01QualifiedOfficialExchangeInput(')
      );
    });
    expect(offenders).toEqual([]);
  });

  it('service production module içine alınmamış, default-disabled ve production call-site yok', () => {
    const moduleSource = read('uyap.module.ts');
    expect(moduleSource).not.toContain('UyapOfficialAlacakKalemiStructuredEmissionService');
    expect(moduleSource).not.toContain('UYAP_STRUCTURED_EMISSION_M01_CONSUMER');

    const service = read('official/official-alacakkalemi-structured-emission.service.ts');
    expect(service).toContain("UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_ENABLED === 'true'");
    expect(service).toContain('Production callers: none');

    const callers = sourceFiles(UYAP_ROOT).filter((file) => {
      if (file.endsWith('official-alacakkalemi-structured-emission.service.ts')) return false;
      if (file.endsWith('uyap.module.ts') || file.includes(`${path.sep}__tests__${path.sep}`)) return false;
      return fs
        .readFileSync(file, 'utf8')
        .includes('UyapOfficialAlacakKalemiStructuredEmissionService');
    });
    expect(callers).toEqual([]);
  });

  it('interest, fallback, transport, persistence ve DTD claims kapalıdır', () => {
    const service = read('official/official-alacakkalemi-structured-emission.service.ts');
    const builder = read('official/official-exchange-builder.ts');
    expect(service).toContain("'INTEREST_NOT_SUPPORTED'");
    expect(builder).not.toMatch(/\.ele\(\s*['"`](digerAlacak|kontrat|faiz)['"`]/);
    expect(service).not.toMatch(/\.(create|update|upsert|delete|send|publish)\s*\(/);
    expect(service).not.toContain('officialDtdValidated: true');
    expect(service).not.toContain('schema.prisma');
    expect(service).not.toContain('migration');
  });
});
