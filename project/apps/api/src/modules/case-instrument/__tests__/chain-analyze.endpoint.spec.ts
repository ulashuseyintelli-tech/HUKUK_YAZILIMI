/**
 * A1 Faz 2b-A — POST /case-instruments/chain/analyze WIRING + NORMALİZE testi.
 * Motorun iç hukuk mantığı 2a (instrument-chain-engine.spec.ts) ile test edilir; burada YALNIZ
 * controller → service → motor bağlantısı + DTO normalize (position/diziler) + güvenlik invaryantı.
 * SAF: Prisma stub'lanır (analyze DB'ye dokunmaz). CaseDebtor YARATILMAZ.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CaseInstrumentController } from '../case-instrument.controller';
import { CaseInstrumentService } from '../case-instrument.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AnalyzeChainDto } from '../dto/analyze-chain.dto';

const prov = { source: 'MANUAL' as const, confidence: 1 };

type NodeInput = {
  role?: 'DRAWER' | 'PAYEE' | 'ENDORSER' | 'AVALIST';
  name?: string;
  type?: 'INDIVIDUAL' | 'COMPANY' | 'PUBLIC_INSTITUTION';
  position?: number | null;
};

/** position verilmezse KEY EKLENMEZ (undefined) → serviste null'a normalize sınanır. */
const node = (o: NodeInput = {}): Record<string, unknown> => ({
  role: o.role ?? 'ENDORSER',
  party: { name: o.name ?? 'X', type: o.type ?? 'INDIVIDUAL' },
  ...(o.position !== undefined ? { position: o.position } : {}),
  provenance: prov,
});

const chain = (nodes: Record<string, unknown>[], avals: Record<string, unknown>[] = []): AnalyzeChainDto =>
  ({ nodes, endorsements: [], avals } as unknown as AnalyzeChainDto);

describe('CaseInstrumentController.analyzeChain (Faz 2b-A wiring)', () => {
  let controller: CaseInstrumentController;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CaseInstrumentController],
      providers: [
        CaseInstrumentService,
        { provide: PrismaService, useValue: {} }, // analyze DB'ye dokunmaz → boş stub yeter
      ],
    }).compile();

    controller = moduleRef.get<CaseInstrumentController>(CaseInstrumentController);
  });

  it('tam sıralı zincir → RESOLVED; müracaat = keşideci + önceki cirantalar (hamil hariç)', () => {
    const a = controller.analyzeChain(
      chain([
        node({ role: 'DRAWER', position: 0, name: 'Keşideci', type: 'COMPANY' }),
        node({ role: 'ENDORSER', position: 1, name: 'C1' }),
        node({ role: 'ENDORSER', position: 2, name: 'Hamil' }),
      ]),
    );
    expect(a.holder.status).toBe('RESOLVED');
    expect(a.holder.holderNode?.party.name).toBe('Hamil');
    expect(a.recourse.status).toBe('RESOLVED');
    expect(a.recourse.parties.map((p) => p.name)).toEqual(['Keşideci', 'C1']);
    expect(a.recourse.parties.some((p) => p.name === 'Hamil')).toBe(false);
  });

  it('sırasız (position: null) → NEEDS_REVIEW; aday borçlu YOK (güvenlik invaryantı)', () => {
    const a = controller.analyzeChain(
      chain([
        node({ role: 'DRAWER', position: null, name: 'Keşideci', type: 'COMPANY' }),
        node({ role: 'ENDORSER', position: null, name: 'C1' }),
      ]),
    );
    expect(a.holder.status).toBe('NEEDS_REVIEW');
    expect(a.recourse.status).toBe('NEEDS_REVIEW');
    expect(a.recourse.parties).toEqual([]);
  });

  it('position ALANI YOK (undefined) → serviste null normalize → NEEDS_REVIEW (motor undefined görmez)', () => {
    const a = controller.analyzeChain(
      chain([
        node({ role: 'DRAWER', name: 'Keşideci', type: 'COMPANY' }), // position yok
        node({ role: 'ENDORSER', name: 'C1' }), // position yok
      ]),
    );
    expect(a.holder.status).toBe('NEEDS_REVIEW');
    expect(a.recourse.parties).toEqual([]);
  });

  it('endorsements/avals verilmezse [] normalize → tam sıralı yine RESOLVED', () => {
    const dto = {
      nodes: [
        node({ role: 'DRAWER', position: 0, name: 'Keşideci', type: 'COMPANY' }),
        node({ role: 'ENDORSER', position: 1, name: 'Hamil' }),
      ],
    } as unknown as AnalyzeChainDto;
    const a = controller.analyzeChain(dto);
    expect(a.holder.status).toBe('RESOLVED');
    expect(a.recourse.parties.map((p) => p.name)).toEqual(['Keşideci']);
  });

  it('aval kenarı uçtan uca akar: keşideci için avalist müracaat adaylarına eklenir', () => {
    const a = controller.analyzeChain(
      chain(
        [
          node({ role: 'DRAWER', position: 0, name: 'Keşideci', type: 'COMPANY' }),
          node({ role: 'AVALIST', position: 1, name: 'Avalist' }),
          node({ role: 'ENDORSER', position: 2, name: 'C1' }),
          node({ role: 'ENDORSER', position: 3, name: 'Hamil' }),
        ],
        [{ avalistPosition: 1, guaranteesPosition: 0, provenance: prov }], // keşideci için aval
      ),
    );
    expect(a.holder.status).toBe('RESOLVED');
    expect(a.holder.holderNode?.party.name).toBe('Hamil');
    const avalist = a.recourse.parties.find((p) => p.role === 'AVALIST');
    expect(avalist?.name).toBe('Avalist');
    expect(avalist?.basis).toContain('aval');
    expect(a.recourse.parties.some((p) => p.name === 'Hamil')).toBe(false);
  });
});
