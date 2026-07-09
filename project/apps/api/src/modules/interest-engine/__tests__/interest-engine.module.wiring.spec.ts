import { Test } from '@nestjs/testing';
import { InterestEngineModule } from '../interest-engine.module';
import { TBK100AllocatorService } from '../allocation/tbk100-allocator.service';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * Regresyon: TBK100AllocatorService InterestEngineModule providers'da olup
 * exports'ta olmazsa, bu servisi tüketen modüller (SummaryEngineModule,
 * CollectionModule) @Optional() DI ile sessizce undefined alır ve
 * allocatePaymentToLedgerInTx() deprecated allocateLegacy() fallback'ine düşer.
 */
describe('InterestEngineModule wiring', () => {
  it('exports TBK100AllocatorService so importing modules can resolve it', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [InterestEngineModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    const allocator = moduleRef.get(TBK100AllocatorService, { strict: false });
    expect(allocator).toBeInstanceOf(TBK100AllocatorService);
  });
});
