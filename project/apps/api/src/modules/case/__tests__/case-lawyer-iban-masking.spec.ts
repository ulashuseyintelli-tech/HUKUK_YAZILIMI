/**
 * CANDIDATE-H1 (WAVE 3 — Privacy Revival, RATIFIED WITH RECORDED LIMITATIONS):
 * Case-Embedded Personnel Sensitive Field Edit-Safe Masking (READ side).
 * CaseService.findOne() + getCaseLawyers() case-embedded avukat IBAN'ını null-preserving
 * maskeler (pii-mask.util REUSE, F1 deseni). null/'' KORUNUR (sentinel yazılmaz);
 * diğer alanlar (phone/email/bankName/branchName) RAW döner. Yalnız response projeksiyonu.
 */
import { CaseService } from '../case.service';

const TENANT = 't1';
const CASE_ID = 'C1';

const buildLawyer = (iban: string | null) => ({
  id: 'L1',
  name: 'Ada',
  surname: 'Lovelace',
  barNumber: 'B-1',
  phone: '5551112233',
  email: 'a@x.com',
  address: 'Addr',
  bankName: 'Bank',
  branchName: 'Br',
  iban,
  lawyerRank: 'LAWYER',
  defaultPermissions: null,
  isActive: true,
});

// findOne/getCaseLawyers YALNIZ prisma kullanır; diğer 9 dep positional-null (constructor body boş).
const buildService = (prisma: any): any =>
  new CaseService(
    prisma,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
  );

describe('CANDIDATE-H1 — CaseService case-embedded lawyer IBAN masking', () => {
  it('findOne: lawyers[].lawyer.iban MASKELİ; diğer alanlar RAW', async () => {
    const prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue({
          id: CASE_ID,
          lawyers: [{ id: 'CL1', lawyer: buildLawyer('TR330006100519786457841326') }],
        }),
      },
      caseInstrument: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const res = await buildService(prisma).findOne(TENANT, CASE_ID);
    expect(res.lawyers[0].lawyer.iban).toBe('TR33****1326');
    // OFF-INV-10 ratifiye-set dışı alanlar DEĞİŞMEZ (F1 OWNER-REVIEW carried forward):
    expect(res.lawyers[0].lawyer.phone).toBe('5551112233');
    expect(res.lawyers[0].lawyer.email).toBe('a@x.com');
    expect(res.lawyers[0].lawyer.bankName).toBe('Bank');
    expect(res.lawyers[0].lawyer.branchName).toBe('Br');
  });

  it('findOne: null IBAN → null; boş IBAN → boş (null-preserving, sentinel YOK)', async () => {
    const prismaNull = {
      case: {
        findFirst: jest.fn().mockResolvedValue({
          id: CASE_ID,
          lawyers: [{ id: 'CL1', lawyer: buildLawyer(null) }],
        }),
      },
      caseInstrument: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const r1 = await buildService(prismaNull).findOne(TENANT, CASE_ID);
    expect(r1.lawyers[0].lawyer.iban).toBeNull();

    const prismaEmpty = {
      case: {
        findFirst: jest.fn().mockResolvedValue({
          id: CASE_ID,
          lawyers: [{ id: 'CL1', lawyer: buildLawyer('') }],
        }),
      },
      caseInstrument: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const r2 = await buildService(prismaEmpty).findOne(TENANT, CASE_ID);
    expect(r2.lawyers[0].lawyer.iban).toBe('');
  });

  it('getCaseLawyers: lawyer.iban MASKELİ; presence (truthy) korunur', async () => {
    const prisma = {
      case: { findFirst: jest.fn().mockResolvedValue({ id: CASE_ID }) },
      caseLawyer: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'CL1',
            lawyerId: 'L1',
            role: 'ASSIGNED',
            canSign: true,
            hasSignatureAuthority: false,
            isResponsible: true,
            casePermissions: null,
            permissionSource: null,
            receiveNotifications: true,
            lawyer: buildLawyer('TR330006100519786457841326'),
          },
        ]),
      },
    };
    const res = await buildService(prisma).getCaseLawyers(TENANT, CASE_ID);
    expect(res[0].lawyer.iban).toBe('TR33****1326');
    expect(!!res[0].lawyer.iban).toBe(true); // presence göstergesi (hasPaymentBank) korunur
  });
});
