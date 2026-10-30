import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ActionCode } from '../../modules/policy-engine/types/action-code.enum';

/**
 * collection-cancel-executor.ts `COLLECTION_VOID_ACTION_CODE` — modülü import etmek DomainEventIngest (icrabot)
 * grafiğini saf teste taşır; sabit statik olarak kaynaktan okunur (drift yine yakalanır).
 */
const COLLECTION_VOID_ACTION_CODE = (() => {
  const src = readFileSync(join(__dirname, '../../modules/collection/collection-cancel-executor.ts'), 'utf8');
  const m = /export const COLLECTION_VOID_ACTION_CODE = "([A-Z_]+)";/.exec(src);
  if (!m) throw new Error('COLLECTION_VOID_ACTION_CODE kaynakta bulunamadı');
  return m[1];
})();
import {
  APPROVAL_IDENTITY_PROOF_FLAG,
  APPROVAL_IDENTITY_PROOF_SENSITIVE_ACTION_CODES,
  APPROVAL_IDENTITY_UNPROVEN,
  approvalIdentityUnprovenMessage,
  findUnprovenApprovalIdentities,
  isApprovalIdentityProofRequired,
  type ApprovalIdentityDb,
} from '../approval-identity';

/**
 * K-A1 SINIR — kişi kimliği kanıtı yükleminin saf sözleşmesi (DB yok; `user.findUnique` saplanır).
 *  1. Bayrak yalnız 'true' ile açılır; KAPALI iken hiçbir sorgu çalışmaz ve sonuç [] (davranış değişmez).
 *  2. Duyarlı türler enum/sabitlerle BİREBİR aynı (drift yakalanır); CHANGE_STATUS / CLIENT_PAYOUT_POST dahil DEĞİL.
 *  3. Kanıt = aynı büroda kart + geçerli TCKN; kartsız, TCKN'siz, geçersiz TCKN'li ve başka büronun kartı KANITSIZ.
 *  4. Mesaj onaylayana "kart bağlayın" der; kişisel veri (TCKN/e-posta) içermez.
 */
const P1 = '10000000146';
type UserRow = { lawyer: { tenantId: string; tckn: string | null } | null; staffMember: { tenantId: string; tckn: string | null } | null };

function dbOf(rows: Record<string, UserRow>): ApprovalIdentityDb & { calls: number } {
  const db = {
    calls: 0,
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        db.calls += 1;
        return rows[where.id] ?? null;
      }),
    },
  };
  return db as unknown as ApprovalIdentityDb & { calls: number };
}

describe('K-A1 sınır — approval-identity kanıt yüklemi (saf)', () => {
  it('bayrak adı / kod sabiti / açılış kuralı', () => {
    expect(APPROVAL_IDENTITY_PROOF_FLAG).toBe('OFFICE_APPROVAL_IDENTITY_PROOF_REQUIRED');
    expect(APPROVAL_IDENTITY_UNPROVEN).toBe('APPROVAL_IDENTITY_UNPROVEN');
    for (const [value, expected] of [[undefined, false], ['', false], ['false', false], ['1', false], ['true', true], ['TRUE', true]] as const) {
      const env: NodeJS.ProcessEnv = value === undefined ? {} : { [APPROVAL_IDENTITY_PROOF_FLAG]: value };
      expect(isApprovalIdentityProofRequired(env)).toBe(expected);
    }
  });

  it('duyarlı türler = COLLECTION_VOID sabiti + FINANCIAL_CASE_CLOSE + CLAIM_ITEM_HIGH_IMPACT_CHANGE + FD onayı; başka tür yok', () => {
    expect([...APPROVAL_IDENTITY_PROOF_SENSITIVE_ACTION_CODES].sort()).toEqual(
      [COLLECTION_VOID_ACTION_CODE, ActionCode.FINANCIAL_CASE_CLOSE, ActionCode.CLAIM_ITEM_HIGH_IMPACT_CHANGE, ActionCode.CLIENT_FINANCIAL_DISCLOSURE_APPROVE].sort(),
    );
    expect(APPROVAL_IDENTITY_PROOF_SENSITIVE_ACTION_CODES.has(ActionCode.CHANGE_STATUS)).toBe(false);
    expect(APPROVAL_IDENTITY_PROOF_SENSITIVE_ACTION_CODES.has(ActionCode.CLIENT_PAYOUT_POST)).toBe(false);
  });

  it('bayrak KAPALI → [] ve HİÇ sorgu yok (kartsız taraflar bile)', async () => {
    const db = dbOf({});
    await expect(findUnprovenApprovalIdentities(db, 't1', [{ party: 'REQUESTER', userId: 'kartsiz' }, { party: 'APPROVER', userId: undefined }], {})).resolves.toEqual([]);
    expect(db.calls).toBe(0);
  });

  it('bayrak AÇIK → kanıtsız taraflar sırayla: hesap yok, kart yok, TCKN yok, geçersiz TCKN, başka büronun kartı; kartlı taraf kanıtlı', async () => {
    const env = { [APPROVAL_IDENTITY_PROOF_FLAG]: 'true' };
    const db = dbOf({
      kartli: { lawyer: { tenantId: 't1', tckn: P1 }, staffMember: null },
      personel: { lawyer: null, staffMember: { tenantId: 't1', tckn: P1 } },
      kartsiz: { lawyer: null, staffMember: null },
      tcknsiz: { lawyer: { tenantId: 't1', tckn: null }, staffMember: null },
      gecersiz: { lawyer: { tenantId: 't1', tckn: '12345678901' }, staffMember: null },
      yabanci: { lawyer: { tenantId: 't2', tckn: P1 }, staffMember: null },
    });
    await expect(findUnprovenApprovalIdentities(db, 't1', [
      { party: 'REQUESTER', userId: 'kartli' },
      { party: 'APPROVER', userId: 'personel' },
    ], env)).resolves.toEqual([]);
    await expect(findUnprovenApprovalIdentities(db, 't1', [
      { party: 'REQUESTER', userId: undefined },
      { party: 'OFFICE_APPROVER', userId: 'yok' },
      { party: 'APPROVER', userId: 'kartsiz' },
      { party: 'CONTENT_APPROVER', userId: 'tcknsiz' },
    ], env)).resolves.toEqual(['REQUESTER', 'OFFICE_APPROVER', 'APPROVER', 'CONTENT_APPROVER']);
    await expect(findUnprovenApprovalIdentities(db, 't1', [{ party: 'APPROVER', userId: 'gecersiz' }], env)).resolves.toEqual(['APPROVER']);
    await expect(findUnprovenApprovalIdentities(db, 't1', [{ party: 'APPROVER', userId: 'yabanci' }], env)).resolves.toEqual(['APPROVER']);
    await expect(findUnprovenApprovalIdentities(db, 't1', [{ party: 'REQUESTER', userId: 'kartli' }, { party: 'APPROVER', userId: 'kartsiz' }], env)).resolves.toEqual(['APPROVER']);
  });

  it('mesaj: tarafı adlandırır, "kart bağlayın" der, TCKN içermez', () => {
    const m = approvalIdentityUnprovenMessage(['REQUESTER']);
    expect(m).toContain('talep edenin');
    expect(m).toContain('kart bağlayın');
    expect(m).not.toContain(P1);
    expect(approvalIdentityUnprovenMessage(['REQUESTER', 'APPROVER'])).toContain('talep edenin ve karar verenin');
    expect(approvalIdentityUnprovenMessage(['OFFICE_APPROVER', 'CONTENT_APPROVER'])).toContain('ofis onaylayıcısının ve içerik onaylayıcısının');
  });
});
