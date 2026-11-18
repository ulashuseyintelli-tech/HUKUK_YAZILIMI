import { Injectable, OnModuleInit } from '@nestjs/common';
import { OfficeApprovalDomainSyncService } from '../office-approval/office-approval-domain-sync.service';
import { CaseService } from './case.service';

/**
 * Due (dosya kalemi) değişikliği onayının yürütme işleyicisini onay altyapısına kaydeder — owner kararı 19.11.2026.
 *
 * Onay altyapısı dosya modülünü içe aktarmaz; bağlantı ters yönde, modül açılışında tek kayıtla kurulur (borçlu
 * sorumluluğu seçimiyle aynı desen). İşleyici karar transaction'ı İÇİNDE çalışır: fırlatırsa karar dahil hiçbir yazma
 * kalmaz ve talep onay bekler durumda kalır.
 *
 * Çağrıldığı yerler:
 * - NestJS modül açılışı (CaseModule sağlayıcısı) → OfficeApprovalDomainSyncService.registerCaseDueChangeHandler()
 */
@Injectable()
export class CaseDueApprovalHandlerService implements OnModuleInit {
  constructor(
    private readonly caseService: CaseService,
    private readonly domainSync: OfficeApprovalDomainSyncService,
  ) {}

  onModuleInit(): void {
    this.domainSync.registerCaseDueChangeHandler(async (tx, req) => {
      await this.caseService.applyApprovedDueCreateInTx(tx, req);
    });
  }
}
