import { Test } from '@nestjs/testing';
import { SummaryEngineModule } from '../summary-engine.module';
import { SummaryEngineService } from '../summary-engine.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { StorageModule } from '../../../common/storage/storage.module';

/**
 * Regresyon: SummaryEngineModule -> InterestEngineModule zincirinde
 * TBK100AllocatorService export edilmezse, SummaryEngineService constructor'daki
 * @Optional() tbk100Allocator sessizce undefined kalır ve allocatePaymentToLedgerInTx()
 * hep allocateLegacy() (deprecated, yanlış sıra) fallback'ine düşer.
 */
describe('SummaryEngineModule wiring', () => {
  it('injects a real (non-undefined) TBK100AllocatorService into SummaryEngineService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SummaryEngineModule, ErrorLogModule, StorageModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();

    try {
      const service = moduleRef.get(SummaryEngineService);
      expect((service as any).tbk100Allocator).toBeDefined();
      expect((service as any).claimItemService).toBeDefined();
    } finally {
      await moduleRef.close();
    }
  });
});
