/**
 * PR-ASSIGN-4a — buildBulkAssignPayload saf testleri (frontend-only, UI YOK).
 *
 * Kabul kriterleri (Ulaş):
 * - staff → POST /cases/batch-update payload'u
 * - lawyer → null (geçici devre dışı; sorumlu-avukat modeli ASSIGN-4d)
 * - boş → null (per-case PATCH döngüsü ve responsibleLawyerId gönderimi YOK)
 */

import { describe, it, expect } from 'vitest';
import { buildBulkAssignPayload } from '../lib/bulk-assign';

describe('PR-ASSIGN-4a buildBulkAssignPayload — bulk-assign payload', () => {
  it('staff → batch-update payload (sorumluPersonelId)', () => {
    expect(buildBulkAssignPayload('staff', ['c1', 'c2'], 'u1')).toEqual({
      caseIds: ['c1', 'c2'],
      updates: { sorumluPersonelId: 'u1' },
    });
  });

  it('lawyer → null (avukat toplu atama geçici devre dışı)', () => {
    expect(buildBulkAssignPayload('lawyer', ['c1'], 'law1')).toBeNull();
  });

  it('bilinmeyen/boş tür → null', () => {
    expect(buildBulkAssignPayload('', ['c1'], 'u1')).toBeNull();
    expect(buildBulkAssignPayload('whatever', ['c1'], 'u1')).toBeNull();
  });

  it('boş seçim (assigneeId yok) → null', () => {
    expect(buildBulkAssignPayload('staff', ['c1'], '')).toBeNull();
  });

  it('boş hedef (caseIds yok/boş) → null', () => {
    expect(buildBulkAssignPayload('staff', [], 'u1')).toBeNull();
    // @ts-expect-error — runtime savunması: caseIds undefined gelse de null döner
    expect(buildBulkAssignPayload('staff', undefined, 'u1')).toBeNull();
  });
});
