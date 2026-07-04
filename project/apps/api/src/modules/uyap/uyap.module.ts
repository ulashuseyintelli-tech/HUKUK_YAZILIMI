import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PoaModule } from '../poa/poa.module';
import { PolicyEngineModule } from '../policy-engine/policy-engine.module';
import { ValidationGateModule } from '../validation-gate/validation-gate.module'; // PR-D4e-6: haciz karar-anı risk audit
import { PermissionDiagnosticsModule } from '../permission-diagnostics/permission-diagnostics.module';
import { UyapService } from './uyap.service';
import { UyapXmlService } from './uyap-xml.service';
import { UyapController } from './uyap.controller';

// Re-export UYAP codes for external use
export * from './uyap-codes';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PoaModule),
    forwardRef(() => PolicyEngineModule), // CPE gate kontrolü için
    ValidationGateModule, // PR-D4e-6: haciz karar-anı risk snapshot (cycle yok: validation-gate yalnız Prisma)
    PermissionDiagnosticsModule, // P2b-2: UYAP_SEND observe hook için GuidedOpenObserveService
  ],
  controllers: [UyapController],
  providers: [UyapService, UyapXmlService],
  exports: [UyapService, UyapXmlService],
})
export class UyapModule {}
