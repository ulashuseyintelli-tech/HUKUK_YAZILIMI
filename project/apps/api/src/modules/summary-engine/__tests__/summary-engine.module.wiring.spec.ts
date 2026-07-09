import { Test } from '@nestjs/testing';
import { SummaryEngineModule } from '../summary-engine.module';
import { SummaryEngineService } from '../summary-engine.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Regresyon: SummaryEngineModule -> InterestEngineModule zincirinde
 * TBK100AllocatorService export edilmezse, SummaryEngineService constructor'daki
 * @Optional() tbk100Allocator sessizce undefined kalır ve allocatePaymentToLedgerInTx()
 * hep allocateLegacy() (deprecated, yanlış sıra) fallback'ine düşer.
 */
describe('SummaryEngineModule wiring', () => {
  it('injects a real (non-undefined) TBK100AllocatorService into SummaryEngineService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SummaryEngineModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    const service = moduleRef.get(SummaryEngineService);
    expect((service as any).tbk100Allocator).toBeDefined();
  });
});
