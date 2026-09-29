import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * K3-L Faz 2 statik guard — template-engine controller istek gövdesini (TCKN/VKN/IBAN/adres taşıyan DTO) log'a
 * YAZMAZ. Kusur: POST /template-engine/takip-talebi/word tüm DTO'yu JSON.stringify ile console.log'luyordu.
 */
describe('template-engine controller — istek gövdesi loglanmaz (statik)', () => {
  const source = readFileSync(join(__dirname, '..', 'template-engine.controller.ts'), 'utf8');

  it('DTO gövdesini JSON.stringify ile loglayan satır yok', () => {
    const offending = source
      .split('\n')
      .map((line, i) => ({ line, no: i + 1 }))
      .filter(({ line }) => /console\.(log|info|debug|warn|error)\([^)]*JSON\.stringify\(\s*dto/.test(line));
    expect(offending).toEqual([]);
  });

  it('incelenen kaynak boş değil (guard kör değil)', () => {
    expect(source.length).toBeGreaterThan(1000);
    expect(source).toContain("@Post('takip-talebi/word')");
  });
});
