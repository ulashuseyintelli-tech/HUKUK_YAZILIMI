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
// UYAP-EXPENSE-BLOCKING-FACT-BRIDGE-I01: EXPENSE_BLOCKING gate'inin canonical kaynagi.
// ExpenseBlockReasonModule YALNIZ PrismaModule'e baglidir -> CPE/UYAP cycle'i YOKTUR.
// `ExpenseGateService` BILEREK kullanilmaz: o servis canPerformAction cagirir ve
// `CPE UYAP_SEND -> provider -> ExpenseGateService -> CPE UYAP_SEND` cycle'i olusur.
import { UyapExpenseBlockingFactProvider } from './authority/uyap-expense-blocking-fact.provider';
import { ExpenseBlockReasonModule } from '../expense-block-reason/expense-block-reason.module';
// UYAP-AUTHORITY-FRESHNESS-TX-I01: Phase 1 snapshot + TX-1 revalidation.
// NOT: `UYAP_AUTHORITY_COORDINATION_HOOK` token'i BILEREK KAYDEDILMEZ — test barrier'i
// production DI grafiginde cozulmez ve butun cagrilar no-op olur.
import { UyapAuthoritySnapshotService } from './authority/uyap-authority-snapshot.service';
// UYAP-M01: RECEIVABLE-owned Legal Basis authority is consumed through its
// existing exact-version port. The module-local adapter has no production
// call-site and remains fail-closed unless both explicit flags are enabled.
import { LegalBasisExactVersionResolverPort } from '../claim-item/formation-intent/claim-item-formation-resolver.ports';
import { LegalBasisRegistryResolverService } from '../claim-item/formation-intent/legal-basis-registry-resolver.service';
import { UyapM01LegalBasisConsumerService } from './legal-basis/uyap-m01-legal-basis-consumer.service';

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
    // I04B: masraf blok siniflandirmasi salt-okuma tuketilir (cycle YOK).
    ExpenseBlockReasonModule,
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
    UyapExpenseBlockingFactProvider,
    UyapAuthoritySnapshotService,
    {
      provide: LegalBasisExactVersionResolverPort,
      useFactory: () => new LegalBasisRegistryResolverService(),
    },
    UyapM01LegalBasisConsumerService,
  ],
  exports: [
    UyapService,
    UyapXmlService,
    UyapSendAuthorityResolverService,
    UyapAuthoritySnapshotService,
  ],
})
export class UyapModule implements OnModuleInit {
  constructor(
    private readonly factRegistry: ComputedFactRegistry,
    private readonly authorityFactProvider: UyapAuthorityFactProvider,
    private readonly expenseBlockingFactProvider: UyapExpenseBlockingFactProvider,
  ) {}

  /**
   * I04/I04B: authority ve masraf-blok fact provider'lari CPE registry'sine kendi bounded
   * context'imizden kaydedilir. Boylece PolicyEngineModule UyapModule'u import etmek
   * zorunda kalmaz (ters bagimlilik yok). Kayit sirasi onemsizdir; iki fact bagimsizdir.
   */
  onModuleInit(): void {
    this.factRegistry.register(this.authorityFactProvider);
    this.factRegistry.register(this.expenseBlockingFactProvider);
  }
}
