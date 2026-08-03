/**
 * C2 REVIEW AUTHORITY EXTENSION — CR-1 sözleşme kanıtı (owner RATIFIED 2026-08-03).
 *
 * X3-B04'ün tüketeceği intake-review komut setinin dondurulmuş shape'i ve CR-1
 * maddelerinin birebir kanıtı: review ≠ promotion (ayrı sinyal, ayrı audit action),
 * hiçbir authenticated tenant kullanıcısı otomatik APPROVE/REJECT yapamaz (rol adı —
 * ADMIN dahil — yetki vermez), aynı aktör iki işlemi ancak iki yetkiyi ayrı ayrı
 * taşıyorsa yapar. Değişiklik yalnız C2 sayfası üzerinden (tek writer).
 */
import { ForbiddenException } from '@nestjs/common';
import {
  CLIENT_MUTATION_REASON,
  decideClientIntakeReviewCommand,
} from '../client-mutation-policy';
import {
  CLIENT_WORKSPACE_COMMAND,
  CLIENT_WORKSPACE_COMMAND_CLASS,
  runAuthorizedClientWorkspaceCommand,
} from '../client-workspace-command-authority';

type AnyRecord = Record<string, any>;

const REVIEW_TYPES = [
  CLIENT_WORKSPACE_COMMAND.INTAKE_REVIEW_CLAIM,
  CLIENT_WORKSPACE_COMMAND.INTAKE_REVIEW_FIELD_DECIDE,
  CLIENT_WORKSPACE_COMMAND.INTAKE_REVIEW_SUBMISSION_REJECT,
] as const;

function buildDeps(opts: { promotion?: boolean; review?: boolean } = {}) {
  return {
    isApproverEligible: jest.fn().mockResolvedValue(opts.promotion ?? false),
    isIntakeReviewAuthorized: jest.fn().mockResolvedValue(opts.review ?? false),
    auditLog: jest.fn().mockResolvedValue(undefined),
  };
}

describe('CR-1 — dondurulmuş shape ve command mapping (X3-B04 sözleşmesi)', () => {
  it('üç review komutu exact string değerleriyle mevcut ve INTAKE_REVIEW sınıfında', () => {
    expect(CLIENT_WORKSPACE_COMMAND.INTAKE_REVIEW_CLAIM).toBe('INTAKE_REVIEW_CLAIM');
    expect(CLIENT_WORKSPACE_COMMAND.INTAKE_REVIEW_FIELD_DECIDE).toBe('INTAKE_REVIEW_FIELD_DECIDE');
    expect(CLIENT_WORKSPACE_COMMAND.INTAKE_REVIEW_SUBMISSION_REJECT).toBe('INTAKE_REVIEW_SUBMISSION_REJECT');
    for (const t of REVIEW_TYPES) {
      expect(CLIENT_WORKSPACE_COMMAND_CLASS[t]).toBe('INTAKE_REVIEW');
    }
  });

  it('workspace komutları WORKSPACE sınıfında kaldı (promotion/eligibility davranışı değişmedi)', () => {
    expect(CLIENT_WORKSPACE_COMMAND_CLASS.INTAKE_LINK_CREATE).toBe('WORKSPACE');
    expect(CLIENT_WORKSPACE_COMMAND_CLASS.NOTIFICATION_SEND_EMAIL).toBe('WORKSPACE');
    expect(CLIENT_WORKSPACE_COMMAND_CLASS.POA_FILE_UPLOAD).toBe('WORKSPACE');
  });

  it('ret kodu sözleşmesi stabil: INTAKE_REVIEW_DENIED', () => {
    expect(CLIENT_MUTATION_REASON.INTAKE_REVIEW_DENIED).toBe('CLIENT_MUTATION_DENIED_INTAKE_REVIEW');
  });

  it('permission mapping: reviewField/bulkReviewFields → FIELD_DECIDE · claim → CLAIM · rejectSubmission → SUBMISSION_REJECT', () => {
    // Envanter kanıtı (client-intake-review.service.ts): claim(:69) · reviewField(:88)
    // · bulkReviewFields(:112) · rejectSubmission(:135). Mapping bu spec'le kilitlenir.
    const mapping: Record<string, string> = {
      claim: 'INTAKE_REVIEW_CLAIM',
      reviewField: 'INTAKE_REVIEW_FIELD_DECIDE',
      bulkReviewFields: 'INTAKE_REVIEW_FIELD_DECIDE',
      rejectSubmission: 'INTAKE_REVIEW_SUBMISSION_REJECT',
    };
    for (const command of Object.values(mapping)) {
      expect(Object.values(CLIENT_WORKSPACE_COMMAND)).toContain(command);
    }
  });
});

describe('CR-1 — decideClientIntakeReviewCommand (SAF politika)', () => {
  it('rol adı yetki VERMEZ: ADMIN + reviewAuthority=false -> INTAKE_REVIEW_DENIED', () => {
    expect(decideClientIntakeReviewCommand({ userId: 'u1', role: 'ADMIN', reviewAuthority: false }))
      .toEqual({ allowed: false, reasonCode: CLIENT_MUTATION_REASON.INTAKE_REVIEW_DENIED });
  });

  it('VIEWER -> VIEWER_DENIED (reviewAuthority=true olsa bile)', () => {
    expect(decideClientIntakeReviewCommand({ userId: 'u1', role: 'VIEWER', reviewAuthority: true }))
      .toEqual({ allowed: false, reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED });
  });

  it('USER + reviewAuthority=true -> ALLOWED', () => {
    expect(decideClientIntakeReviewCommand({ userId: 'u1', role: 'USER', reviewAuthority: true }))
      .toEqual({ allowed: true, reasonCode: CLIENT_MUTATION_REASON.ALLOWED });
  });
});

describe('CR-1 — zincir davranışı (her review komutu için)', () => {
  for (const commandType of REVIEW_TYPES) {
    describe(commandType, () => {
      const ctx = { tenantId: 'tenant-1', clientId: 'client-1', commandType };

      it('promotion-eligible AMA review yetkisi olmayan aktör REDDEDİLİR (review ≠ promotion)', async () => {
        const deps = buildDeps({ promotion: true, review: false });
        const execute = jest.fn();
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'u1', tenantId: 'tenant-1', role: 'USER' },
            ctx,
            execute as any,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.INTAKE_REVIEW_DENIED }),
        });
        expect(execute).not.toHaveBeenCalled();
        // Promotion eşiği review kapısında HİÇ sorgulanmaz — iki kapı bağımsız.
        expect(deps.isApproverEligible).not.toHaveBeenCalled();
        expect(deps.auditLog).not.toHaveBeenCalled();
      });

      it('ADMIN bile review sinyali olmadan REDDEDİLİR (rol adı hardcode yetki değildir)', async () => {
        const deps = buildDeps({ promotion: true, review: false });
        const execute = jest.fn();
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'admin-1', tenantId: 'tenant-1', role: 'ADMIN' },
            ctx,
            execute as any,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.INTAKE_REVIEW_DENIED }),
        });
        expect(execute).not.toHaveBeenCalled();
      });

      it('review-yetkili USER izinlidir; AYRI audit action üretilir (CLIENT_INTAKE_REVIEW_COMMAND)', async () => {
        const deps = buildDeps({ promotion: false, review: true });
        const execute = jest.fn().mockResolvedValue({ status: 'REVIEWED' });
        await runAuthorizedClientWorkspaceCommand(
          deps as any,
          { userId: 'reviewer-1', tenantId: 'tenant-1', role: 'USER' },
          ctx,
          execute as any,
          (r: AnyRecord) => ({ status: r.status }),
        );
        expect(execute).toHaveBeenCalledTimes(1);
        expect(deps.isIntakeReviewAuthorized).toHaveBeenCalledWith('reviewer-1', 'tenant-1');
        expect(deps.auditLog).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'CLIENT_INTAKE_REVIEW_COMMAND',
            tenantId: 'tenant-1',
            userId: 'reviewer-1',
            metadata: expect.objectContaining({ commandType, status: 'REVIEWED' }),
          }),
        );
      });

      it('tenant isolation: cross-tenant aktör sorgusuz kesin ret (TENANT_MISMATCH)', async () => {
        const deps = buildDeps({ review: true });
        const execute = jest.fn();
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'u1', tenantId: 'tenant-EVIL', role: 'USER' },
            ctx,
            execute as any,
          ),
        ).rejects.toMatchObject({
          response: expect.objectContaining({ reasonCode: CLIENT_MUTATION_REASON.TENANT_MISMATCH }),
        });
        expect(execute).not.toHaveBeenCalled();
        expect(deps.isIntakeReviewAuthorized).not.toHaveBeenCalled();
      });

      it('isIntakeReviewAuthorized yapılandırılmamışsa fail-closed hata (sessiz izin YOK)', async () => {
        const deps: AnyRecord = {
          isApproverEligible: jest.fn().mockResolvedValue(true),
          auditLog: jest.fn(),
        };
        const execute = jest.fn();
        await expect(
          runAuthorizedClientWorkspaceCommand(
            deps as any,
            { userId: 'u1', tenantId: 'tenant-1', role: 'USER' },
            ctx,
            execute as any,
          ),
        ).rejects.toThrow('Intake review authority is not configured');
        expect(execute).not.toHaveBeenCalled();
      });
    });
  }

  it('aynı aktör iki yetkiyi AYRI AYRI taşıyorsa iki sınıfta da çalışır (CR-1 md.6)', async () => {
    const deps = buildDeps({ promotion: true, review: true });
    const reviewExec = jest.fn().mockResolvedValue({ status: 'REVIEWED' });
    const workspaceExec = jest.fn().mockResolvedValue({ status: 'sent' });
    const actor = { userId: 'both-1', tenantId: 'tenant-1', role: 'USER' };

    await runAuthorizedClientWorkspaceCommand(
      deps as any, actor,
      { tenantId: 'tenant-1', clientId: 'c1', commandType: CLIENT_WORKSPACE_COMMAND.INTAKE_REVIEW_FIELD_DECIDE },
      reviewExec as any,
    );
    await runAuthorizedClientWorkspaceCommand(
      deps as any, actor,
      { tenantId: 'tenant-1', clientId: 'c1', commandType: CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_CREATE },
      workspaceExec as any,
    );

    expect(reviewExec).toHaveBeenCalledTimes(1);
    expect(workspaceExec).toHaveBeenCalledTimes(1);
    const actions = deps.auditLog.mock.calls.map((c: AnyRecord[]) => c[0].action);
    expect(actions).toEqual(['CLIENT_INTAKE_REVIEW_COMMAND', 'CLIENT_WORKSPACE_COMMAND']);
  });

  it('WORKSPACE sınıfı komutlar review sinyaline HİÇ danışmaz (regresyon)', async () => {
    const deps = buildDeps({ promotion: true, review: false });
    await runAuthorizedClientWorkspaceCommand(
      deps as any,
      { userId: 'u1', tenantId: 'tenant-1', role: 'USER' },
      { tenantId: 'tenant-1', clientId: 'c1', commandType: CLIENT_WORKSPACE_COMMAND.POA_REMINDER_SEND },
      jest.fn().mockResolvedValue({ status: 'sent' }) as any,
    );
    expect(deps.isIntakeReviewAuthorized).not.toHaveBeenCalled();
  });
});
