import { AiService } from './ai.service';

/**
 * COLLECTION-STATUS-FILTER-HOTFIX — AiService.
 *
 * Prompt metinleri (buildSuggestionPrompt/buildPredictionPrompt) ve kural-bazlı
 * fallback (getRuleBasedPrediction) tahsilat toplamını artık yalnız CONFIRMED
 * üzerinden hesaplar. Saf birim test: prisma + config mock'lanır; OPENAI_API_KEY
 * verilmediği için servis fallback modundadır.
 */
describe('AiService — collection status filtresi', () => {
  function makeConfig() {
    return { get: jest.fn().mockReturnValue(undefined) } as any; // OpenAI kapalı → fallback
  }

  function makePrisma(caseData: any) {
    return {
      case: { findFirst: jest.fn().mockResolvedValue(caseData) },
    } as any;
  }

  function makeCaseData(collections: Array<{ amount: number; status: string; allocationHold?: { status: string } | null }>) {
    return {
      id: 'case-1',
      fileNumber: '2026/1',
      type: 'ILAMSIZ',
      workflowStage: 'ENFORCEMENT',
      principalAmount: 100000,
      riskScore: 50,
      isAutoMode: false,
      createdAt: new Date(),
      collections,
      debtors: [],
      enforcementActions: [],
      lifecycleEvents: [],
      decisionLogs: [],
      riskReports: [],
    };
  }

  const NON_CONFIRMED = [
    { amount: 30000, status: 'CANCELLED' },
    { amount: 5000, status: 'PENDING' },
    { amount: 1000, status: 'REFUNDED' },
  ];

  it('REGRESYON (fallback tahmin): yalnız iptal/bekleyen/iade varsa "borçlu ödüyor" sinyali üretilmez', async () => {
    const svc = new AiService(makePrisma(makeCaseData(NON_CONFIRMED)), makeConfig());

    const prediction = await svc.getPrediction('tenant-A', 'case-1');

    // Eski (hatalı) davranış: totalCollected 36000 > 0 → +10 olasılık ve taksitlendirme önerisi.
    expect(prediction.collectionProbability).toBe(50);
    expect(prediction.recommendations.join(' ')).not.toContain('taksitlendirme');
  });

  it('POZİTİF (fallback tahmin): CONFIRMED tahsilat sinyal üretir (+10 olasılık, taksitlendirme önerisi)', async () => {
    const svc = new AiService(
      makePrisma(makeCaseData([...NON_CONFIRMED, { amount: 30000, status: 'CONFIRMED' }])),
      makeConfig(),
    );

    const prediction = await svc.getPrediction('tenant-A', 'case-1');

    expect(prediction.collectionProbability).toBe(60);
    expect(prediction.recommendations.join(' ')).toContain('taksitlendirme');
  });

  it('PROMPT (öneri): "Tahsil Edilen/Kalan Borç" yalnız CONFIRMED üzerinden yazılır', () => {
    const svc = new AiService(makePrisma(null), makeConfig());
    const caseData = makeCaseData([...NON_CONFIRMED, { amount: 25000, status: 'CONFIRMED' }]);

    const prompt = (svc as any).buildSuggestionPrompt(caseData) as string;

    expect(prompt).toContain('- Tahsil Edilen: 25000 TL'); // 36000'lik gürültü hariç
    expect(prompt).toContain('- Kalan Borç: 75000 TL');
  });

  it('PROMPT (tahmin): "Tahsilat Oranı" yalnız CONFIRMED üzerinden yazılır (%0.0 / %25.0)', () => {
    const svc = new AiService(makePrisma(null), makeConfig());

    const noneConfirmed = (svc as any).buildPredictionPrompt(makeCaseData(NON_CONFIRMED)) as string;
    expect(noneConfirmed).toContain('- Tahsil Edilen: 0 TL');
    expect(noneConfirmed).toContain('- Tahsilat Oranı: 0.0%');

    const withConfirmed = (svc as any).buildPredictionPrompt(
      makeCaseData([...NON_CONFIRMED, { amount: 25000, status: 'CONFIRMED' }]),
    ) as string;
    expect(withConfirmed).toContain('- Tahsil Edilen: 25000 TL');
    expect(withConfirmed).toContain('- Tahsilat Oranı: 25.0%');
  });

  it('K3-L PROMPT (öneri): mahsubu BEKLETİLEN tahsilat borçtan düşülmez, ayrı satırda yazılır', () => {
    const svc = new AiService(makePrisma(null), makeConfig());
    const caseData = makeCaseData([
      { amount: 25000, status: 'CONFIRMED' },
      { amount: 15000, status: 'CONFIRMED', allocationHold: { status: 'HELD' } },
      // tamamlanmış (RELEASED) ve iptal edilmiş (REVERSED) bekletme: tahsilat kendi durumuna göre sayılır
      { amount: 5000, status: 'CONFIRMED', allocationHold: { status: 'RELEASED' } },
      { amount: 7000, status: 'CANCELLED', allocationHold: { status: 'REVERSED' } },
    ]);

    const prompt = (svc as any).buildSuggestionPrompt(caseData) as string;

    expect(prompt).toContain('- Tahsil Edilen: 30000 TL');
    expect(prompt).toContain('- Mahsubu Bekleyen Tahsilat (borçtan düşülmedi): 15000 TL');
    expect(prompt).toContain('- Kalan Borç: 70000 TL');
  });

  it('K3-L (fallback tahmin): yalnız mahsubu bekleyen tahsilat varsa "borçlu ödüyor" sinyali üretilmez', async () => {
    const svc = new AiService(
      makePrisma(makeCaseData([{ amount: 30000, status: 'CONFIRMED', allocationHold: { status: 'HELD' } }])),
      makeConfig(),
    );

    const prediction = await svc.getPrediction('tenant-A', 'case-1');

    expect(prediction.collectionProbability).toBe(50);
  });

  it('K3-L: tahsilatlar mahsup durumuyla birlikte okunur (allocationHold.status)', async () => {
    const prisma = makePrisma(makeCaseData([]));
    const svc = new AiService(prisma, makeConfig());

    await svc.getPrediction('tenant-A', 'case-1');

    expect(prisma.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          collections: { include: { allocationHold: { select: { status: true } } } },
        }),
      }),
    );
  });

  it('K3-L PROMPT (tahmin): tahsilat oranı mahsubu bekletilen tahsilatı İÇERMEZ', () => {
    const svc = new AiService(makePrisma(null), makeConfig());
    const caseData = makeCaseData([
      { amount: 25000, status: 'CONFIRMED' },
      { amount: 15000, status: 'CONFIRMED', allocationHold: { status: 'HELD' } },
    ]);

    const prompt = (svc as any).buildPredictionPrompt(caseData) as string;

    expect(prompt).toContain('- Tahsil Edilen: 25000 TL');
    expect(prompt).toContain('- Tahsilat Oranı: 25.0%');
    expect(prompt).not.toContain('40000');
  });
});
