/**
 * CAD C3-B02 — EKSTRE PDF SÖZLEŞMESİ.
 *
 * Kilitlenen kurallar:
 *  1. Enum teknik adı kullanıcıya BASILMAZ; her satır tipi TR etikete sahiptir (tam kapsama).
 *  2. Bilgi satırları (debit=0, credit=0) bakiyeyi oynatmadıkları AÇIKÇA görünür.
 *  3. SUPERSEDED/VOID ekstre PDF'e dönüşmez (fail-closed).
 *  4. Belge tanımı DETERMİNİSTİK (aynı girdi → aynı çıktı; saat/rastgelelik yok).
 *  5. İç ID'ler belgeye sızmaz (render sözleşmesi zaten allowlist'li — burada da doğrulanır).
 *  6. Dosya referansı X2 primitifinin ETİKETİ ve DEĞERİ ile basılır; C3 kendi etiketini üretmez.
 *  7. Gerçek byte üretimi attachment'a uygun Buffer döndürür (pdf-poppler KULLANILMAZ).
 */
import { ClientStatementLineType, ClientStatementStatus } from '@prisma/client';
import {
  CLIENT_STATEMENT_LINE_LABELS_TR,
  CLIENT_STATEMENT_PDF_INFO_NOTE,
  ClientStatementNotRenderableError,
  assertStatementRenderable,
  buildClientStatementPdfDocument,
  lineLabelTr,
} from '../client-statement-pdf.document';
import { ClientStatementPdfService } from '../client-statement-pdf.service';
import { createClientStatementRender, toClientSafeFileReference } from '../client-statement-render.contract';

const ref = toClientSafeFileReference('2026/9501')!;

const baseRender = (over: Partial<Parameters<typeof createClientStatementRender>[0]> = {}) =>
  createClientStatementRender({
    scope: 'CLIENT_LEVEL',
    officeName: 'Telli Hukuk',
    clientName: 'Müvekkil Şükrü Akdoğan',
    currency: 'TRY',
    periodStart: new Date('2026-06-01T00:00:00Z'),
    periodEnd: new Date('2026-06-30T23:59:59Z'),
    openingBalance: '100.00',
    closingBalance: '120.00',
    fileReference: null,
    lines: [
      {
        lineDate: new Date('2026-06-05T00:00:00Z'),
        label: lineLabelTr(ClientStatementLineType.CASE_COLLECTION_PAYABLE),
        note: 'tahsilat dağıtımı',
        debit: '0.00',
        credit: '20.00',
        runningBalance: '120.00',
        isInformational: false,
        fileReference: ref,
      },
      {
        lineDate: new Date('2026-06-07T00:00:00Z'),
        label: lineLabelTr(ClientStatementLineType.CONTRACTUAL_FEE_WITHHELD),
        note: null,
        debit: '0.00',
        credit: '0.00',
        runningBalance: '120.00',
        isInformational: true,
        fileReference: ref,
      },
    ],
    ...over,
  } as any);

describe('CAD C3-B02 — ekstre PDF belge sözleşmesi', () => {
  // 1. TR etiket kapsaması
  it('[B02-1] HER satır tipi için TR etiket vardır; enum teknik adı etiket olarak kullanılmaz', () => {
    const types = Object.values(ClientStatementLineType);
    expect(types.length).toBeGreaterThan(0);
    for (const t of types) {
      const label = CLIENT_STATEMENT_LINE_LABELS_TR[t];
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(t);            // enum adı basılmıyor
      expect(label).not.toMatch(/^[A-Z_]+$/); // SCREAMING_CASE değil
    }
  });

  it('[B02-2] belgede hiçbir enum teknik adı geçmez', () => {
    const doc = buildClientStatementPdfDocument(baseRender());
    const serialized = JSON.stringify(doc);
    for (const t of Object.values(ClientStatementLineType)) {
      expect(serialized).not.toContain(t);
    }
  });

  // 2. Bilgi satırı görünürlüğü (POL-2)
  it('[B02-3] bilgi satırı bakiyeyi oynatmadığı AÇIKÇA görünür; dipnot mevcut', () => {
    const doc = buildClientStatementPdfDocument(baseRender());
    const serialized = JSON.stringify(doc);
    expect(serialized).toContain('(değişmedi)');
    expect(serialized).toContain(CLIENT_STATEMENT_PDF_INFO_NOTE);
    // bilgi satırında borç/alacak rakam yerine '—'
    const table = (doc.content as any[]).find((c) => c?.table?.headerRows === 1);
    const infoRow = table.table.body.at(-1);
    expect(infoRow).toContain('—');
  });

  // 3. Fail-closed durum kapısı
  it.each([[ClientStatementStatus.SUPERSEDED], [ClientStatementStatus.VOID]])(
    '[B02-4] %s ekstre PDF üretilemez (fail-closed)',
    (status) => {
      expect(() => assertStatementRenderable(status)).toThrow(ClientStatementNotRenderableError);
    },
  );

  it('[B02-5] ACTIVE ekstre geçer', () => {
    expect(() => assertStatementRenderable(ClientStatementStatus.ACTIVE)).not.toThrow();
  });

  it('[B02-6] servis SUPERSEDED çağrısında byte ÜRETMEDEN reddeder', async () => {
    const svc = new ClientStatementPdfService();
    await expect(svc.render(baseRender(), ClientStatementStatus.SUPERSEDED)).rejects.toBeInstanceOf(
      ClientStatementNotRenderableError,
    );
  });

  // 4. Determinizm
  it('[B02-7] aynı girdi → birebir aynı belge tanımı (saat/rastgelelik yok)', () => {
    const a = JSON.stringify(buildClientStatementPdfDocument(baseRender()));
    const b = JSON.stringify(buildClientStatementPdfDocument(baseRender()));
    expect(a).toBe(b);
    expect(a).not.toMatch(new RegExp(String(new Date().getFullYear() + 1))); // "şimdi" damgası yok
  });

  // 5. İç ID sızıntısı yok
  it('[B02-8] belge iç ID taşımaz', () => {
    const serialized = JSON.stringify(buildClientStatementPdfDocument(baseRender()));
    for (const k of ['statementId', 'caseClientId', 'refId', 'refType', 'tenantId', 'clientId', 'caseId']) {
      expect(serialized).not.toContain(k);
    }
  });

  // 6. Dosya referansı primitiften
  it('[B02-9] dosya referansı X2 primitifinin etiketi/değeriyle basılır', () => {
    const withHeaderRef = baseRender({ scope: 'CASE_LEVEL', fileReference: ref } as any);
    const serialized = JSON.stringify(buildClientStatementPdfDocument(withHeaderRef));
    expect(serialized).toContain(ref.label);   // 'Büro dosya no' — X2 sabiti
    expect(serialized).toContain(ref.value);   // '2026/9501'
    expect(serialized).toContain('Dosya');     // client-level satır sütunu
  });

  it('[B02-10] dosya referansı olmayan ekstrede Dosya sütunu eklenmez', () => {
    const noRef = baseRender({
      lines: [
        { lineDate: new Date('2026-06-05T00:00:00Z'), label: 'Avans / alacak kaydı', note: null, debit: '0.00', credit: '10.00', runningBalance: '110.00', isInformational: false, fileReference: null },
      ],
    } as any);
    const doc = buildClientStatementPdfDocument(noRef);
    const table = (doc.content as any[]).find((c) => c?.table?.headerRows === 1);
    expect(table.table.body[0]).not.toContain('Dosya');
  });

  // 7. Gerçek byte üretimi
  it('[B02-11] ACTIVE ekstre attachment\'a uygun PDF Buffer üretir', async () => {
    const svc = new ClientStatementPdfService();
    const buf = await svc.render(baseRender(), ClientStatementStatus.ACTIVE);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-'); // gerçek PDF imzası
  }, 30000);

  it('[B02-12] açılış ve kapanış bakiyeleri belgede yer alır', () => {
    const serialized = JSON.stringify(buildClientStatementPdfDocument(baseRender()));
    expect(serialized).toContain('Açılış bakiyesi: 100.00 TRY');
    expect(serialized).toContain('Kapanış bakiyesi: 120.00 TRY');
  });
});
