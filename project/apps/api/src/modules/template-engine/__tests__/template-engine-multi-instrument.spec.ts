import {
  TemplateData,
  TemplateEngineService,
  TemplateInstrumentInfo,
} from '../template-engine.service';

const activeCaseDebtor = {
  role: 'ASIL_BORCLU',
  selectedAddress: null,
  debtor: {
    type: 'INDIVIDUAL',
    name: 'Aktif Borçlu',
    displayName: 'Aktif Borçlu',
    tckn: '11111111111',
    debtorAddresses: [],
  },
};

const caseRecord = {
  fileNumber: '2026/1',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  type: 'CHECK',
  subCategory: 'CEK',
  executionPath: 'HACIZ',
  hasCollateral: false,
  currency: 'TRY',
  principalAmount: 1750,
  executionOffice: null,
  caseClients: [],
  lawyers: [],
  debtors: [activeCaseDebtor],
  dues: [],
  claimItems: [],
};

function buildService(instruments: any[] = []) {
  const prisma: any = {
    case: { findFirst: jest.fn().mockResolvedValue(caseRecord) },
    caseInstrument: { findMany: jest.fn().mockResolvedValue(instruments) },
  };
  const feeEngine: any = { getInterestRate: jest.fn().mockReturnValue(0) };
  return { service: new TemplateEngineService(prisma, feeEngine), prisma };
}

function makeTemplateData(
  instrumentInfo?: TemplateInstrumentInfo,
  instrumentInfos?: TemplateInstrumentInfo[],
): TemplateData {
  return {
    fileNumber: '2026/1',
    filingDate: '2026-01-01',
    executionOffice: { name: '', city: '' },
    creditors: [],
    lawyers: [],
    debtors: [],
    claimItems: [],
    totals: { principal: 2500, interest: 0, fees: 0, total: 2500, currency: 'TRY' },
    interestInfo: { type: 'YASAL', description: '', variableRate: true },
    caseType: 'CHECK',
    subCategory: 'CEK',
    executionPath: 'HACIZ',
    instrumentInfo,
    instrumentInfos,
  };
}

describe('TemplateEngineService multi-instrument legal document integrity', () => {
  it('tüm CaseInstrument kayıtlarını deterministik sırayla template modeline taşır', async () => {
    const instruments = [
      {
        id: 'instrument-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        instrumentType: 'CEK',
        serialNo: 'SERIAL-1',
        amount: 1250,
        currency: 'TRY',
        issueDate: new Date('2025-12-01T00:00:00.000Z'),
        presentmentDate: new Date('2026-01-02T00:00:00.000Z'),
        bankName: 'Birinci Banka',
        bankBranch: 'Merkez',
      },
      {
        id: 'instrument-2',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        instrumentType: 'SENET',
        serialNo: 'SERIAL-2',
        amount: 500,
        currency: 'EUR',
        issueDate: new Date('2025-12-02T00:00:00.000Z'),
        maturityDate: new Date('2026-02-01T00:00:00.000Z'),
      },
    ];
    const { service, prisma } = buildService(instruments);

    const data = await (service as any).getCaseData('case-1', 'tenant-1');

    expect(prisma.caseInstrument.findMany).toHaveBeenCalledWith({
      where: { caseId: 'case-1' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    expect(data.instrumentInfos.map((instrument: TemplateInstrumentInfo) => instrument.serialNo)).toEqual([
      'SERIAL-1',
      'SERIAL-2',
    ]);
    expect(data.instrumentInfo).toEqual(data.instrumentInfos[0]);

    const udf = service.generateTakipTalebiUdf(data);
    const instrumentSection = udf.content.sections.find(section => section.type === 'INSTRUMENT_INFO');
    expect(instrumentSection?.data.instrumentInfo.serialNo).toBe('SERIAL-1');
    expect(instrumentSection?.data.instrumentInfos.map((instrument: TemplateInstrumentInfo) => instrument.serialNo)).toEqual([
      'SERIAL-1',
      'SERIAL-2',
    ]);
  });

  it('PDF ve Word instrument metninde tüm kayıtları verilen sırayla kullanır', () => {
    const { service } = buildService();
    const instrumentInfos: TemplateInstrumentInfo[] = [
      {
        type: 'CEK',
        instrumentNo: 'CEK-1',
        amount: '1.250,00',
        currency: 'TRY',
        bankName: 'Birinci Banka',
        branchName: 'Merkez',
        presentationDate: '2026-01-02',
      },
      {
        type: 'SENET',
        instrumentNo: 'SENET-2',
        amount: '500,00',
        currency: 'EUR',
        issueDate: '2025-12-02',
        dueDate: '2026-02-01',
      },
    ];
    const data = makeTemplateData(instrumentInfos[0], instrumentInfos);

    const pdfText = (service as any).formatTakipTalebiInstrumentText(data, 'pdf');
    const wordText = (service as any).formatTakipTalebiInstrumentText(data, 'word');

    expect(pdfText).toBe(
      '1.250,00 TL ÇEK ALACAĞI\n' +
      'Çek No: CEK-1\n' +
      'Banka: Birinci Banka Merkez\n' +
      'İbraz Tarihi: 02.01.2026\n\n' +
      '500,00 EUR SENET/BONO ALACAĞI\n' +
      'Vade Tarihi: 01.02.2026\n' +
      'Düzenleme Tarihi: 02.12.2025',
    );
    expect(wordText.indexOf('Çek No: CEK-1')).toBeLessThan(wordText.indexOf('Vade Tarihi: 01.02.2026'));
    expect(wordText).toContain('1.250,00 TL ÇEK ALACAĞI');
    expect(wordText).toContain('500,00 EUR SENET/BONO ALACAĞI');
  });

  it('legacy tek-enstrüman metnini ve UDF veri şeklini korur', () => {
    const { service } = buildService();
    const instrumentInfo: TemplateInstrumentInfo = {
      type: 'CEK',
      instrumentNo: 'CEK-1',
      bankName: 'Banka',
      branchName: 'Şube',
      presentationDate: '2026-01-05',
    };
    const data = makeTemplateData(instrumentInfo);

    expect((service as any).formatTakipTalebiInstrumentText(data, 'pdf')).toBe(
      '2.500,00 TL ÇEK ALACAĞI\n' +
      'Çek No: CEK-1\n' +
      'Banka: Banka Şube\n' +
      'İbraz Tarihi: 05.01.2026',
    );
    expect((service as any).formatTakipTalebiInstrumentText(data, 'word')).toBe(
      '2.500,00 TL ÇEK ALACAĞI\n' +
      'Çek No: CEK-1\n' +
      'Banka: Banka\n' +
      'İbraz Tarihi: 05.01.2026',
    );

    const udf = service.generateTakipTalebiUdf(data);
    const instrumentSection = udf.content.sections.find(section => section.type === 'INSTRUMENT_INFO');
    expect(instrumentSection?.data).toEqual({ instrumentInfo });
  });
});
