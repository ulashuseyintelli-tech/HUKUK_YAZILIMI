import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PoaModule } from '../poa/poa.module';
import { PolicyEngineModule } from '../policy-engine/policy-engine.module';
import { ValidationGateModule } from '../validation-gate/validation-gate.module'; // PR-D4e-6: haciz karar-anı risk audit
import { PermissionDiagnosticsModule } from '../permission-diagnostics/permission-diagnostics.module';
import { UyapService } from './uyap.service';
import { UyapXmlService } from './uyap-xml.service';
import { UyapController } from './uyap.controller';
// P05C-P04: dormant P-E5B + P05C-P03 writer'ları + ince evidence orchestrator RUNTIME'a bağlanır.
// Yalnız UYAP_SEND/TRIGGER_HACIZ, flag-gated (default-OFF). ConfigService global.
import { UyapOperationWriterService } from './operation-writer/uyap-operation-writer.service';
import { UyapCpeDecisionLinkWriterService } from './operation-writer/uyap-cpe-decision-link-writer.service';
import { UyapOperationEvidenceOrchestrator } from './operation-writer/uyap-operation-evidence.orchestrator';
// UYAP-SEND-AUTHORITY-RESOLVER-I01: MODEL B yetki zinciri (acting-lawyer matched POA).
// Henüz CPE akışına BAĞLI DEĞİL — bağlama UYAP-CPE-AUTHORITY-FACT-BRIDGE-I01'dedir.
import { UyapSendAuthorityResolverService } from './authority/uyap-send-authority-resolver.service';

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
  providers: [
    UyapService,
    UyapXmlService,
    UyapOperationWriterService,
    UyapCpeDecisionLinkWriterService,
    UyapOperationEvidenceOrchestrator,
    UyapSendAuthorityResolverService,
  ],
  exports: [UyapService, UyapXmlService, UyapSendAuthorityResolverService],
})
export class UyapModule {}
