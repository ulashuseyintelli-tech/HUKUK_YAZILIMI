import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
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
// UYAP-CPE-AUTHORITY-FACT-BRIDGE-I01: authority zinciri CPE computed fact'lerine baglanir.
import { UyapAuthorityFactProvider } from './authority/uyap-authority-fact.provider';
import { ComputedFactRegistry } from '../policy-engine/fact-store/computed-fact-registry';
import { LawyerModule } from '../lawyer/lawyer.module';

// Re-export UYAP codes for external use
export * from './uyap-codes';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PoaModule),
    forwardRef(() => PolicyEngineModule), // CPE gate kontrolü için
    ValidationGateModule, // PR-D4e-6: haciz karar-anı risk snapshot (cycle yok: validation-gate yalnız Prisma)
    PermissionDiagnosticsModule, // P2b-2: UYAP_SEND observe hook için GuidedOpenObserveService
    // I04: canonical acting-lawyer cozumlemesi Lawyer domain'inden tuketilir
    // (UYAP-BC-OFFICE-001 — connector authority truth URETMEZ).
    forwardRef(() => LawyerModule),
  ],
  controllers: [UyapController],
  providers: [
    UyapService,
    UyapXmlService,
    UyapOperationWriterService,
    UyapCpeDecisionLinkWriterService,
    UyapOperationEvidenceOrchestrator,
    UyapSendAuthorityResolverService,
    UyapAuthorityFactProvider,
  ],
  exports: [UyapService, UyapXmlService, UyapSendAuthorityResolverService],
})
export class UyapModule implements OnModuleInit {
  constructor(
    private readonly factRegistry: ComputedFactRegistry,
    private readonly authorityFactProvider: UyapAuthorityFactProvider,
  ) {}

  /**
   * I04: authority fact provider'i CPE registry'sine kendi bounded context'imizden kaydeder.
   * Boylece PolicyEngineModule UyapModule'u import etmek zorunda kalmaz (ters bagimlilik yok).
   */
  onModuleInit(): void {
    this.factRegistry.register(this.authorityFactProvider);
  }
}
