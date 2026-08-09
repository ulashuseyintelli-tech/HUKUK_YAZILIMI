/**
 * C1-B04 CONTENT ACCEPTANCE — kullanıcı-yüzü ekstre e-postası + PDF içerik doğrulaması.
 *
 * OWNER kabul kriterleri (local render/capture; GERÇEK SMTP YOK):
 *  1. Client-level metinde dosya numarası cümlesi YOK.
 *  2. Case-level metinde yalnız insan-okur dosya numarası.
 *  3. Hiçbir subject/body/PDF'de {{...}} token veya internal ID YOK.
 *  4. Tarih 01.08.2026 – 31.08.2026 (Europe/Istanbul, tr-TR; UTC gün kayması YOK).
 *  5. Para 2.250,50 TL (tr-TR).
 *  6. "Ayrıntılı bilgi için büromuzla iletişime geçebilirsiniz." (typo yok).
 *  7. Marka: gerçek Office display-name; "Demo Hukuk Bürosu (Canary)" ÇIKMAZ.
 *  8. Bakiye üç işaret: <0 Büro lehine, >0 Müvekkil lehine, =0 Bakiye bulunmamaktadır (mutlak tutar).
 *  9. Fail-closed: çözülmemiş {{...}} → renderTemplate THROW (dispatch FAILED; provider'a gitmez), PII sızmaz.
 * 10. E-posta ve PDF bakiye semantiği birebir aynı.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  MessageTemplateService,
  UnresolvedTemplateTokenError,
} from '../../message-template/message-template.service';
import { buildStatementDeliveryTokens } from '../client-statement-delivery.contract';
import {
  buildClientStatementPdfDocument,
  displayCurrency,
  formatClosingBalanceLine,
  formatDateTrIstanbul,
  formatTrAmount,
} from '../client-statement-pdf.document';
import { createClientStatementRender, toClientSafeFileReference } from '../client-statement-render.contract';

const svc = new MessageTemplateService(null as any); // renderTemplate saf; prisma kullanılmaz
const ref = toClientSafeFileReference('2026/9501')!;

// Gerçek STATEMENT_READY seed'ini KAYNAKTAN çıkar (replikasyon-drift yok).
const statementReadyTemplate = (() => {
  const src = readFileSync(join(__dirname, '..', '..', 'message-template', 'message-template.service.ts'), 'utf8');
  const block = src.slice(src.indexOf("code: 'STATEMENT_READY'"), src.indexOf("code: 'INTAKE_LINK'"));
  const subject = block.match(/subject:\s*'([^']*)'/)![1];
  const body = block.match(/body:\s*`([\s\S]*?)`/)![1];
  return { subject, body };
})();

// Canary-benzeri dönem: periodStart 21:00Z (Istanbul 00:00), periodEnd 20:59:59.999Z (Istanbul 23:59).
const baseRender = (over: Partial<Parameters<typeof createClientStatementRender>[0]> = {}) =>
  createClientStatementRender({
    scope: 'CLIENT_LEVEL',
    officeName: 'Av. Ulaş Hüseyin TELLİ',
    clientName: 'Canary Sentetik Müvekkil',
    currency: 'TRY',
    periodStart: new Date('2026-07-31T21:00:00.000Z'),
    periodEnd: new Date('2026-08-31T20:59:59.999Z'),
    openingBalance: '0',
    closingBalance: '-2250.50',
    fileReference: null,
    lines: [
      {
        lineDate: new Date('2026-08-05T00:00:00Z'),
        label: 'Tahsilattan müvekkile aktarılacak tutar',
        note: null,
        debit: '0.00',
        credit: '0.00',
        runningBalance: '-2250.50',
        isInformational: false,
        fileReference: null,
      },
    ],
    ...over,
  } as any);

const renderStatement = (over = {}) =>
  svc.renderTemplate(statementReadyTemplate, buildStatementDeliveryTokens(baseRender(over)));

const MOJIBAKE = /Ã|Â|Å|Ä±|ÅŸ|Ã§|Ã¼|Ã¶|Ä°|ï¿½|Ð|Ñ/;
const CUID_LIKE = /\b[a-z0-9]{20,}\b/;
const INTERNAL_KEYS = ['statementId', 'caseClientId', 'refId', 'refType', 'tenantId', 'clientId', 'caseId', 'generatedById'];

describe('C1-B04 CONTENT ACCEPTANCE', () => {
  describe('formatters (deterministik)', () => {
    it('tr-TR para: binlik "." ondalık ","; işaret korunur', () => {
      expect(formatTrAmount('-2250.5')).toBe('-2.250,50');
      expect(formatTrAmount('2250.5')).toBe('2.250,50');
      expect(formatTrAmount('0')).toBe('0,00');
      expect(formatTrAmount('1234567.891')).toBe('1.234.567,89');
    });

    it('tarih Europe/Istanbul (UTC gün kayması yok)', () => {
      expect(formatDateTrIstanbul(new Date('2026-07-31T21:00:00.000Z'))).toBe('01.08.2026');
      expect(formatDateTrIstanbul(new Date('2026-08-31T20:59:59.999Z'))).toBe('31.08.2026');
    });

    it('para birimi TRY → TL gösterimi', () => {
      expect(displayCurrency('TRY')).toBe('TL');
      expect(displayCurrency('USD')).toBe('USD');
    });

    it('kapanış bakiyesi ÜÇ işaret (mutlak tutar, eksi işareti gösterilmez)', () => {
      expect(formatClosingBalanceLine('-2250.50', 'TRY')).toBe('Dönem Sonu Bakiye: 2.250,50 TL (Büro lehine)');
      expect(formatClosingBalanceLine('3400.00', 'TRY')).toBe('Dönem Sonu Bakiye: 3.400,00 TL (Müvekkil lehine)');
      expect(formatClosingBalanceLine('0', 'TRY')).toBe('Dönem Sonu Bakiye: 0,00 TL (Bakiye bulunmamaktadır)');
    });
  });

  describe('token builder', () => {
    it('client-level: fileReferenceClause AÇIKÇA "" + caseFileSuffix ""', () => {
      const t = buildStatementDeliveryTokens(baseRender());
      expect(t.fileReferenceClause).toBe('');
      expect(t.caseFileSuffix).toBe('');
      expect(t.periodStart).toBe('01.08.2026');
      expect(t.periodEnd).toBe('31.08.2026');
      expect(t.closingBalanceLine).toBe('Dönem Sonu Bakiye: 2.250,50 TL (Büro lehine)');
    });

    it('case-level: yalnız insan-okur dosya numarası', () => {
      const t = buildStatementDeliveryTokens(baseRender({ scope: 'CASE_LEVEL', fileReference: ref } as any));
      expect(t.fileReferenceClause).toBe('2026/9501 sayılı dosyanız için ');
      expect(t.caseFileSuffix).toBe(' — 2026/9501');
    });
  });

  describe('STATEMENT_READY render — client-level', () => {
    const { subject, body } = renderStatement();

    it('çözülmemiş {{...}} YOK (subject + body)', () => {
      expect(subject).not.toMatch(/{{|}}/);
      expect(body).not.toMatch(/{{|}}/);
    });

    it('dosya numarası cümlesi YOK (client-level)', () => {
      expect(body).not.toContain('sayılı dosyanız için');
      expect(subject).toBe('Hesap Ekstreniz Hazır');
    });

    it('tarih + para + bakiye etiketi doğru', () => {
      expect(body).toContain('01.08.2026 - 31.08.2026');
      expect(body).toContain('Dönem Sonu Bakiye: 2.250,50 TL (Büro lehine)');
    });

    it('copy/typo düzeltmesi', () => {
      expect(body).toContain('Ayrıntılı bilgi için büromuzla iletişime geçebilirsiniz.');
      expect(body).not.toContain('bürumuzla');
      expect(body).not.toContain('Detay için');
    });

    it('marka: gerçek Office display-name imzası; demo/canary MARKA metni YOK', () => {
      // İmza satırı gerçek Office display-name olmalı.
      expect(body.trimEnd().endsWith('Av. Ulaş Hüseyin TELLİ')).toBe(true);
      // "Demo Hukuk Bürosu (Canary)" gibi demo MARKA metni kullanıcı içeriğine çıkmamalı.
      // (Not: müvekkil ADI 'Canary Sentetik' bir fixture verisidir, marka değildir.)
      expect(body).not.toContain('Demo Hukuk Bürosu');
      expect(body).not.toContain('(Canary)');
    });

    it('mojibake YOK; internal ID YOK', () => {
      expect(subject + '\n' + body).not.toMatch(MOJIBAKE);
      expect(body).not.toMatch(CUID_LIKE);
      for (const k of INTERNAL_KEYS) expect(body).not.toContain(k);
    });
  });

  describe('STATEMENT_READY render — case-level', () => {
    const { subject, body } = renderStatement({ scope: 'CASE_LEVEL', fileReference: ref });

    it('insan-okur dosya numarası VAR; {{...}} ve internal ID YOK', () => {
      expect(body).toContain('2026/9501 sayılı dosyanız için');
      expect(subject).toBe('Hesap Ekstreniz Hazır — 2026/9501');
      expect(body).not.toMatch(/{{|}}/);
      expect(body).not.toMatch(CUID_LIKE);
      for (const k of INTERNAL_KEYS) expect(body).not.toContain(k);
    });
  });

  describe('FAIL-CLOSED (owner kritik düzeltmesi)', () => {
    it('çözülmemiş token → THROW (sessiz strip YOK)', () => {
      expect(() => svc.renderTemplate({ subject: 'X', body: 'A {{unknownX}} B' }, {})).toThrow(
        UnresolvedTemplateTokenError,
      );
    });

    it('hata yalnız token ADI taşır; token DEĞERLERİ/PII sızmaz', () => {
      try {
        svc.renderTemplate({ body: 'Merhaba {{clientName}}, {{missingToken}}' }, { clientName: 'GİZLİ MÜVEKKİL ADI' });
        throw new Error('THROW bekleniyordu');
      } catch (e) {
        expect(e).toBeInstanceOf(UnresolvedTemplateTokenError);
        const err = e as UnresolvedTemplateTokenError;
        expect(err.tokenNames).toEqual(['missingToken']);
        expect(err.message).toContain('missingToken');
        expect(err.message).not.toContain('GİZLİ MÜVEKKİL ADI');
      }
    });

    it('happy-path (tüm token sağlanır) → THROW YOK', () => {
      expect(() => renderStatement()).not.toThrow();
      expect(() => renderStatement({ scope: 'CASE_LEVEL', fileReference: ref })).not.toThrow();
    });
  });

  describe('e-posta ↔ PDF bakiye semantiği eşitliği', () => {
    it('kapanış bakiye satırı token ile PDF belgesinde birebir aynı', () => {
      const render = baseRender();
      const emailLine = buildStatementDeliveryTokens(render).closingBalanceLine;
      const pdfSerialized = JSON.stringify(buildClientStatementPdfDocument(render));
      expect(emailLine).toBe('Dönem Sonu Bakiye: 2.250,50 TL (Büro lehine)');
      expect(pdfSerialized).toContain(emailLine);
    });
  });
});
