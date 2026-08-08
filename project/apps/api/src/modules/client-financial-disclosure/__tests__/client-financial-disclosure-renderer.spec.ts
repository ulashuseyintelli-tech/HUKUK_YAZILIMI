import {
  createClientFinancialDisclosureRenderInput,
  parseClientFinancialDisclosureRenderOutput,
  serializeClientFinancialDisclosureRenderOutput,
} from '../client-financial-disclosure-renderer.contract';
import {
  CLIENT_FINANCIAL_DISCLOSURE_FILE_NUMBER_LABEL,
  renderClientFinancialDisclosure,
} from '../client-financial-disclosure-renderer';

const BASE_INPUT = {
  disclosureId: 'opaque-disclosure-version',
  version: 1,
  fileNumber: '2026/42',
  currency: 'TRY',
  totalCollected: '1234567.89',
  clientNetAmount: '1000000.00',
  lines: [
    { type: 'CONTRACTUAL_FEE_WITHHELD', amount: '234567.89' },
    { type: 'CLIENT_PAYABLE', amount: '1000000.00' },
  ],
  approvedAt: '2026-08-08T12:00:00.000Z',
  notifiedAt: null,
  publishedAt: '2026-08-08T12:34:56.000Z',
  isCurrentEffective: true,
  supersedesDisclosureId: null,
  supersededByDisclosureId: null,
  isReversed: false,
  correctionReason: null,
  remittanceStatus: 'PUBLISHED',
} as const;

describe('CLIENT-ACCOUNTING-DELIVERY R01 / X2-B02 — deterministic Turkish renderer', () => {
  it('owner-ratified fileNumber, Turkish labels, exact decimal and UTC date formatını üretir', () => {
    const result = renderClientFinancialDisclosure(
      createClientFinancialDisclosureRenderInput(BASE_INPUT),
    );

    expect(CLIENT_FINANCIAL_DISCLOSURE_FILE_NUMBER_LABEL).toBe('Büro dosya no');
    expect(result).toEqual({
      contractVersion: 'ClientFinancialDisclosureRenderV1',
      subject: 'Müvekkil finansal bilgilendirmesi — Büro dosya no: 2026/42',
      text: [
        'Müvekkil finansal bilgilendirmesi',
        '',
        'Büro dosya no: 2026/42',
        'Yayın tarihi: 08.08.2026 12:34 UTC',
        'Para birimi: TRY',
        'Tahsil edilen toplam: 1.234.567,89 TRY',
        'Müvekkil net payı: 1.000.000,00 TRY',
        '',
        'Kesinti ve dağıtım kalemleri:',
        '- Müvekkile ödenecek net tutar: 1.000.000,00 TRY',
        '- Sözleşmesel ücret kesintisi: 234.567,89 TRY',
      ].join('\n'),
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.text).not.toContain('CLIENT_PAYABLE');
    expect(result.text).not.toContain('CONTRACTUAL_FEE_WITHHELD');
  });

  it('input line sırasından, saatten, locale/environment state’inden bağımsızdır', () => {
    const first = renderClientFinancialDisclosure(
      createClientFinancialDisclosureRenderInput(BASE_INPUT),
    );
    const reordered = renderClientFinancialDisclosure(
      createClientFinancialDisclosureRenderInput({
        ...BASE_INPUT,
        lines: [...BASE_INPUT.lines].reverse(),
      }),
    );

    expect(reordered).toEqual(first);
    expect(
      renderClientFinancialDisclosure(createClientFinancialDisclosureRenderInput(BASE_INPUT)),
    ).toEqual(first);
  });

  it('publishedAt yoksa deterministik client-safe durum metni üretir', () => {
    const result = renderClientFinancialDisclosure(
      createClientFinancialDisclosureRenderInput({ ...BASE_INPUT, publishedAt: null }),
    );
    expect(result.text).toContain('Yayın tarihi: Henüz yayımlanmadı');
  });

  it.each([
    ['CLIENT_PAYABLE', 'Müvekkile ödenecek net tutar'],
    ['CONTRACTUAL_FEE_WITHHELD', 'Sözleşmesel ücret kesintisi'],
    ['FIRM_EXPENSE_REIMBURSEMENT', 'Büro masraf iadesi'],
    ['CLIENT_EXPENSE_REIMBURSEMENT', 'Müvekkil masraf iadesi'],
    ['OFFSET_CLIENT_ADVANCE', 'Müvekkil avans mahsubu'],
    ['HELD_PENDING_DISTRIBUTION', 'Dağıtım tamamlanana kadar bekletilen tutar'],
    ['OTHER', 'Diğer dağıtım kalemi'],
  ] as const)('%s enum adını client’a sızdırmadan Türkçe etikete dönüştürür', (type, label) => {
    const result = renderClientFinancialDisclosure(
      createClientFinancialDisclosureRenderInput({
        ...BASE_INPUT,
        lines: [{ type, amount: '1.00' }],
      }),
    );
    expect(result.text).toContain(`- ${label}: 1,00 TRY`);
    expect(result.text).not.toContain(type);
  });

  it('dosya no veya currency kontrol karakteri içerirse subject/body üretmeden fail-closed kalır', () => {
    expect(() =>
      renderClientFinancialDisclosure(
        createClientFinancialDisclosureRenderInput({
          ...BASE_INPUT,
          fileNumber: '2026/42\nBcc:x',
        }),
      ),
    ).toThrow(TypeError);
    expect(() =>
      renderClientFinancialDisclosure(
        createClientFinancialDisclosureRenderInput({ ...BASE_INPUT, currency: 'TRY\r' }),
      ),
    ).toThrow(TypeError);
  });

  it('approval için subject+text çıktısını canonical serialize eder ve exact frozen payload olarak okur', () => {
    const output = renderClientFinancialDisclosure(
      createClientFinancialDisclosureRenderInput(BASE_INPUT),
    );
    const serialized = serializeClientFinancialDisclosureRenderOutput(output);

    expect(serialized).toBe(
      JSON.stringify({
        contractVersion: 'ClientFinancialDisclosureRenderV1',
        subject: output.subject,
        text: output.text,
      }),
    );
    const parsed = parseClientFinancialDisclosureRenderOutput(serialized);
    expect(parsed).toEqual(output);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it('serbest metni, eski/ek alanlı veya boş sealed payloadı fail-closed reddeder', () => {
    expect(() => parseClientFinancialDisclosureRenderOutput('serbest metin')).toThrow(TypeError);
    expect(() =>
      parseClientFinancialDisclosureRenderOutput(
        JSON.stringify({
          contractVersion: 'ClientFinancialDisclosureRenderV0',
          subject: 'x',
          text: 'y',
        }),
      ),
    ).toThrow(TypeError);
    expect(() =>
      parseClientFinancialDisclosureRenderOutput(
        JSON.stringify({
          contractVersion: 'ClientFinancialDisclosureRenderV1',
          subject: 'x',
          text: 'y',
          internalId: 'forbidden',
        }),
      ),
    ).toThrow(TypeError);
  });
});
