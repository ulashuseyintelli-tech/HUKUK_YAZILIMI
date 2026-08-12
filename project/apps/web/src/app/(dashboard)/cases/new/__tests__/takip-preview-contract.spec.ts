import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * PR-2A1 — TAKIP TALEBI ONIZLEME SOZLESMESI
 * stable key: app/(dashboard)/cases/new/page.tsx#generateTakipTalebiPreview
 *
 * Eski davranis hata halinde UYDURMA bir "TAKİP TALEBİ (ÖRNEK 1)" belgesi uretip
 * gercek sablon ciktisiymis gibi onizletiyordu — avukat sahte icra belgesi taslagina
 * guvenebilirdi. 5300+ satirlik sihirbazin tam render'i orantisiz oldugu icin bu spec
 * sozlesmeyi KAYNAK duzeyinde kilitler; davranissal dogrulama, ayni `toActionErrorMessage`
 * + throw zincirini kullanan diger 26 signature'in matrisleriyle ortaktir.
 */

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');

function previewSegment(): string {
  const i = SRC.indexOf('const generateTakipTalebiPreview = async');
  expect(i).toBeGreaterThan(-1);
  const next = SRC.indexOf('const validateClaimItems', i);
  return SRC.slice(i, next > i ? next : i + 4000);
}

describe('generateTakipTalebiPreview sozlesmesi', () => {
  it('UYDURMA fallback belge KALDIRILDI', () => {
    const seg = previewSegment();
    expect(seg).not.toContain('TAKİP TALEBİ (ÖRNEK 1)');
    expect(seg).not.toContain('simplePreview');
    // Hata dalinda setTakipTalebiContent CAGRILMAZ (icerik uydurulamaz).
    const catchPart = seg.slice(seg.indexOf('} catch'));
    expect(catchPart).not.toContain('setTakipTalebiContent(');
    expect(catchPart).not.toContain('setShowTakipTalebiPreview(true)');
  });

  it('malformed yanit BASARI SAYILMAZ — bos/eksik html-content throw eder', () => {
    const seg = previewSegment();
    expect(seg).toContain('MALFORMED_PREVIEW_RESPONSE');
    // "Belge oluşturulamadı" metni BELGE ICERIGI olarak basilamaz.
    expect(seg).not.toContain('|| "Belge oluşturulamadı"');
  });

  it('hata GORUNUR ve guvenli mesajla yuzeye cikar', () => {
    const seg = previewSegment();
    expect(seg).toContain('setTakipTalebiPreviewError(');
    // Guvenli mesaj runMutation/toActionError zincirinden gelir (outcome.error.message).
    expect(seg).toContain('outcome.error.message');
    expect(seg).not.toMatch(/console\.error/);
    expect(seg).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
  });

  it('hata bandi onizleme dugmesinin YANINDA render ediliyor', () => {
    expect(SRC).toContain('data-testid="takip-preview-error"');
    const band = SRC.indexOf('takip-preview-error');
    const btn = SRC.indexOf('onClick={generateTakipTalebiPreview}');
    expect(band).toBeGreaterThan(-1);
    expect(btn).toBeGreaterThan(-1);
    expect(Math.abs(btn - band)).toBeLessThan(600); // ayni JSX bolgesi
  });

  it('basari yolu YALNIZ dogrulanmis string icerikle onizleme acar', () => {
    const seg = previewSegment();
    const successPart = seg.slice(0, seg.indexOf('} catch'));
    expect(seg).toContain('typeof body?.html === ');
    expect(successPart).toContain('setShowTakipTalebiPreview(true)');
  });
});
