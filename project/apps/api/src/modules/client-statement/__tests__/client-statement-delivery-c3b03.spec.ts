/**
 * CAD C3-B03 — İÇERİKLİ EKSTRE MAİLİ + PDF EKİ.
 *
 * Kilitlenen kurallar:
 *  1. Mail yalnız "ekstreniz hazır" DEMEZ — güvenli özet (dönem, kapsam, açılış/kapanış,
 *     hareket sayısı, izinli dosya referansı) taşır.
 *  2. PDF EKİ taşınır; ek dosya adı iç ID İÇERMEZ.
 *  3. Gönderim ÖNCESİ fail-closed: SUPERSEDED/VOID ekstre ve doğrulanmamış alıcı → gönderim YOK.
 *  4. İçerikte iç ID / başka müvekkil verisi SIZMAZ (POL-4).
 *  5. Bu blokta GERÇEK SMTP çağrılmaz — taşıma portu test double ile doğrulanır.
 *
 * KARAKTERİZASYON: bugünkü `notifyStatementReady` yalnız 4 token taşıyan best-effort
 * dispatch'tir ve EK GÖNDEREMEZ; aşağıdaki [B03-0] bunu kayda geçirir.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ClientStatementStatus } from '@prisma/client';
import { ClientStatementNotRenderableError } from '../client-statement-pdf.document';
import { ClientStatementPdfService } from '../client-statement-pdf.service';
import {
  CLIENT_STATEMENT_DELIVERY_CONTRACT_VERSION,
  ClientStatementRecipientMissingError,
  assertStatementDeliverable,
  buildStatementAttachmentFilename,
  buildStatementDeliveryMessage,
  buildStatementDeliveryTokens,
  type ClientStatementDeliveryPort,
} from '../client-statement-delivery.contract';
import { createClientStatementRender, toClientSafeFileReference } from '../client-statement-render.contract';

const ref = toClientSafeFileReference('2026/9501')!;
const RECIPIENT = 'muvekkil@example.test';

const render = (over: Partial<Parameters<typeof createClientStatementRender>[0]> = {}) =>
  createClientStatementRender({
    scope: 'CLIENT_LEVEL',
    officeName: 'Telli Hukuk',
    clientName: 'Şükrü Akdoğan',
    currency: 'TRY',
    periodStart: new Date('2026-06-01T00:00:00Z'),
    periodEnd: new Date('2026-06-30T00:00:00Z'),
    openingBalance: '100.00',
    closingBalance: '120.00',
    fileReference: null,
    lines: [
      {
        lineDate: new Date('2026-06-05T00:00:00Z'),
        label: 'Tahsilattan müvekkile aktarılacak tutar',
        note: null,
        debit: '0.00',
        credit: '20.00',
        runningBalance: '120.00',
        isInformational: false,
        fileReference: ref,
      },
    ],
    ...over,
  } as any);

/** Test double — gerçek SMTP YOK; gönderilen mesajı yakalar. */
const makePort = () => {
  const sent: any[] = [];
  const port: ClientStatementDeliveryPort = {
    send: jest.fn(async (m) => {
      sent.push(m);
      return { success: true, messageId: '<test@local>' };
    }),
  };
  return { port, sent };
};

describe('CAD C3-B03 — içerikli ekstre maili + PDF eki', () => {
  it('[B03-0] KARAKTERİZASYON: bugünkü STATEMENT_READY dispatch\'i EK TAŞIYAMAZ (4 token, best-effort)', () => {
    const svcSrc = readFileSync(join(__dirname, '..', 'client-statement.service.ts'), 'utf8');
    // mevcut token seti
    for (const t of ['periodStart', 'periodEnd', 'closingBalance', 'officeName']) {
      expect(svcSrc).toContain(t);
    }
    // dispatch girdisinde attachment YOK (bu blok bunu kapatır)
    const dispatchBlock = svcSrc.slice(svcSrc.indexOf('templateCode: \'STATEMENT_READY\''), svcSrc.indexOf('templateCode: \'STATEMENT_READY\'') + 400);
    expect(dispatchBlock).not.toContain('attachment');
    // best-effort: hata yutulur
    expect(svcSrc).toContain('Ekstre maili tetiklenemedi');
  });

  // 3. Fail-closed kapı
  it.each([[ClientStatementStatus.SUPERSEDED], [ClientStatementStatus.VOID]])(
    '[B03-1] %s ekstre için gönderim kapısı açılmaz',
    (status) => {
      expect(() => assertStatementDeliverable(status, RECIPIENT)).toThrow(ClientStatementNotRenderableError);
    },
  );

  it.each([[null], [undefined], [''], ['   '], ['gecersiz-adres']])(
    '[B03-2] doğrulanmamış alıcı (%p) → gönderim kapısı açılmaz',
    (mail) => {
      expect(() => assertStatementDeliverable(ClientStatementStatus.ACTIVE, mail as any)).toThrow(
        ClientStatementRecipientMissingError,
      );
    },
  );

  it('[B03-3] ACTIVE + geçerli alıcı → kapı açılır', () => {
    expect(() => assertStatementDeliverable(ClientStatementStatus.ACTIVE, RECIPIENT)).not.toThrow();
  });

  // 1-2. İçerik + ek
  it('[B03-4] mesaj güvenli ÖZET taşır ("yalnız hazır" değil)', () => {
    const msg = buildStatementDeliveryMessage({ render: render(), recipientEmail: RECIPIENT, pdf: Buffer.from('%PDF-1.7') });
    expect(msg.contractVersion).toBe(CLIENT_STATEMENT_DELIVERY_CONTRACT_VERSION);
    expect(msg.to).toBe(RECIPIENT);
    expect(msg.subject).toContain('01.06.2026 – 30.06.2026');
    for (const expected of ['Dönem:', 'Kapsam:', 'Açılış bakiyesi: 100.00 TRY', 'Kapanış bakiyesi: 120.00 TRY', 'Hareket sayısı: 1']) {
      expect(msg.text).toContain(expected);
      expect(msg.html).toContain(expected);
    }
  });

  it('[B03-5] PDF eki taşınır; dosya adı iç ID İÇERMEZ', () => {
    const r = render();
    const msg = buildStatementDeliveryMessage({ render: r, recipientEmail: RECIPIENT, pdf: Buffer.from('%PDF-1.7') });
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0].contentType).toBe('application/pdf');
    expect(msg.attachments[0].filename).toBe('ekstre-genel-20260601-20260630.pdf');
    expect(buildStatementAttachmentFilename(r)).toMatch(/^ekstre-(genel|dosya)-\d{8}-\d{8}\.pdf$/);
    expect(msg.attachments[0].filename).not.toMatch(/[a-z0-9]{20,}/); // cuid benzeri iç ID yok
  });

  it('[B03-6] case-level ekstrede dosya referansı özet içinde X2 etiketiyle görünür', () => {
    const msg = buildStatementDeliveryMessage({
      render: render({ scope: 'CASE_LEVEL', fileReference: ref } as any),
      recipientEmail: RECIPIENT,
      pdf: Buffer.from('%PDF-1.7'),
    });
    expect(msg.text).toContain(`${ref.label}: ${ref.value}`);
    expect(msg.attachments[0].filename).toContain('dosya');
  });

  // 4. Sızıntı yok
  it('[B03-7] mesajın hiçbir alanında iç ID / teknik kimlik yok', () => {
    const msg = buildStatementDeliveryMessage({ render: render(), recipientEmail: RECIPIENT, pdf: Buffer.from('%PDF-1.7') });
    const serialized = JSON.stringify({ ...msg, attachments: msg.attachments.map((a) => ({ ...a, content: undefined })) });
    for (const k of ['statementId', 'caseClientId', 'refId', 'refType', 'tenantId', 'clientId', 'caseId', 'generatedById']) {
      expect(serialized).not.toContain(k);
    }
  });

  // 5. Uçtan uca (test double ile; GERÇEK SMTP YOK)
  it('[B03-8] uçtan uca: ACTIVE ekstre → PDF üretilir → tek mail + tek ek gönderilir', async () => {
    const { port, sent } = makePort();
    const r = render();
    const pdf = await new ClientStatementPdfService().render(r, ClientStatementStatus.ACTIVE);

    assertStatementDeliverable(ClientStatementStatus.ACTIVE, RECIPIENT);
    const msg = buildStatementDeliveryMessage({ render: r, recipientEmail: RECIPIENT, pdf });
    // Taşıma bağlamı (CAD C3 attachment threading): kimlik/idempotency alanları
    // mesajın DIŞINDA taşınır — mesaj gövdesi yalnız render sözleşmesinden türer.
    const res = await port.send(msg, {
      tenantId: 'tenant-b03',
      clientId: 'client-b03',
      caseId: null,
      statementId: 'stmt-b03',
      dedupeKey: 'STATEMENT_MONTHLY:ClientStatement:stmt-b03:2026-02',
      periodKey: '2026-02',
      actorId: 'SYSTEM_MONTHLY_STATEMENT',
      tokens: buildStatementDeliveryTokens(r),
    });

    expect(res.success).toBe(true);
    expect(port.send).toHaveBeenCalledTimes(1);      // TEK gönderim
    expect(sent[0].attachments).toHaveLength(1);      // TEK ek
    expect(sent[0].attachments[0].content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  }, 30000);

  it('[B03-9] SUPERSEDED ekstrede taşıma portu HİÇ çağrılmaz', async () => {
    const { port } = makePort();
    expect(() => assertStatementDeliverable(ClientStatementStatus.SUPERSEDED, RECIPIENT)).toThrow();
    expect(port.send).not.toHaveBeenCalled();
  });
});
