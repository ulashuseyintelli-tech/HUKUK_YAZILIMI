import { Reflector } from '@nestjs/core';
import { ValidationGateController } from '../validation-gate.controller';
import { ValidationGateService } from '../validation-gate.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * CLIENT-SEC-H1 (S3) regression — Validation Gate authentication + tenant scoping.
 *
 * Kapsam:
 * - (T-01) Altı case-data POST endpoint'i JwtAuthGuard ile korunur (anon → 401 wiring kanıtı).
 * - (T-03/T-06) getCaseData fail-closed tenant-scoped: case load findFirst {id, tenantId}
 *   (findUnique {id} DEĞİL); cross-tenant caseId eşleşmez → null (türev/varlık ifşası yok).
 *   Cross-tenant case null döndüğü için child-tablo sorgularına (caseInstrument/lease/judgment/
 *   collateral) HİÇ ulaşılmaz — bunlar tenant-verified case arkasında gated.
 */
describe('CLIENT-SEC-H1 (S3) — Validation Gate auth + tenant', () => {
  describe('6 POST endpoint JwtAuthGuard ile korunur (T-01)', () => {
    const methods = [
      'validateGate',
      'validateAllGates',
      'validateCaseCreation',
      'validateOrnek1Generation',
      'validateServiceOfProcess',
      'validateUyapIntegration',
    ];
    it.each(methods)('%s method-level JwtAuthGuard taşır', (m) => {
      const guards =
        new Reflector().get<any[]>('__guards__', (ValidationGateController.prototype as any)[m]) || [];
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  describe('getCaseData tenant-scoped fail-closed (T-03/T-06)', () => {
    it('case load findFirst {id, tenantId}; findUnique KULLANILMAZ; cross-tenant → null', async () => {
      const prisma: any = {
        case: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn() },
        caseInstrument: { findFirst: jest.fn() },
        caseLease: { findFirst: jest.fn() },
        caseJudgment: { findFirst: jest.fn() },
        caseCollateral: { findFirst: jest.fn() },
      };
      const svc = new ValidationGateService(prisma);

      const res = await (svc as any).getCaseData('case-B', 'tenant-A');

      expect(prisma.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'case-B', tenantId: 'tenant-A' } }),
      );
      expect(prisma.case.findUnique).not.toHaveBeenCalled();
      // cross-tenant → erken null; child-tablo sorgularına ulaşılmaz:
      expect(res).toBeNull();
      expect(prisma.caseInstrument.findFirst).not.toHaveBeenCalled();
    });
  });
});
