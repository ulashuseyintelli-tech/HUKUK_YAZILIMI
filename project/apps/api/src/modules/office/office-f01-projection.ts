/**
 * F01 server-side projection vocabulary.
 *
 * Unknown keys are intentionally dropped. The classification matrix is a
 * closed production inventory; silently copying a newly-added field would
 * widen a projection without an owner decision.
 */

export type F01ProjectionAccess = 'PUBLIC_S0_ONLY' | 'AUTHORIZED_S0_S1';

const OFFICE_S0_FIELDS = new Set([
  'name',
  'address',
  'city',
  'district',
  'postalCode',
  'phone',
  'fax',
  'email',
  'website',
  'barAssociation',
]);

const OFFICE_S1_FIELDS = new Set([
  'id',
  'tenantId',
  'vergiNo',
  'vergiDairesi',
  'mersisNo',
  'kepAddress',
  'defaultExecutionOfficeId',
  'smtpHost',
  'smtpPort',
  'smtpUser',
  'smtpSecure',
  'smtpFromName',
  'smtpFromEmail',
  'smsProvider',
  'smsSender',
  'autoGreetingEnabled',
  'autoGreetingTime',
  'lastGreetingRunAt',
  'inactivityThresholdDays',
  'inactivityWarningDays',
  'opReminderDays',
  'opFounderDays',
  'opRepeatMonths',
  'opEmailEnabled',
  'opSmsEnabled',
  'opStaffTypes',
  'caseTaskOwnerDays',
  'caseTaskTeamLeadDays',
  'caseTaskManagerDays',
  'poaExpiryNotificationEnabled',
  'poaExpiryThresholdDays',
  'createdAt',
  'updatedAt',
]);

const BANK_ACCOUNT_S1_FIELDS = new Set(['officeId']);

const LAWYER_S0_FIELDS = new Set(['barNumber', 'barCity', 'tbbNo', 'barName']);

const LAWYER_S1_FIELDS = new Set([
  'id',
  'tenantId',
  'officeId',
  'name',
  'surname',
  'title',
  'lawyerType',
  'isInHouseCounsel',
  'isEmployee',
  'lawyerRank',
  'canApproveOfficeActions',
  'permissionsLocked',
  'permissionsLockedAt',
  'canModifyOtherPermissions',
  'role',
  'canSign',
  'canAppearInUyap',
  'canBeResponsible',
  'isDefaultForNewCases',
  'uyapUsername',
  'isActive',
  'sortOrder',
  'userId',
  'createdAt',
  'updatedAt',
  'displayName',
  // PR-1.5 — PERSONEL İLETİŞİM ALANLARI (owner kararı 2026-08-11).
  //
  // BULGU: bu alanlar hiçbir katmanda sınıflandırılmamıştı, dolayısıyla allowlist onları
  // sessizce düşürüyordu. Sonuç iki katlıydı: (1) Avukat Düzenle ekranı kayıtlı e-posta/
  // telefon/adresi BOŞ gösteriyordu, (2) form aynı boş değerleri geri POST ettiği için her
  // kaydetme bu alanları GERÇEKTEN siliyordu. Giriş daveti kartı da e-postayı bulamadığı
  // için hiç açılamıyordu.
  //
  // SINIF: bunlar `name`/`surname`/`title` ile AYNI sınıf personel iletişim verisidir —
  // yetkili aktöre görünür (S1), yetkisiz aktöre görünmez (S0 DEĞİL).
  //
  // KAPSAM DIŞI (bilinçli): `tckn`, `iban`, `bankName`, `branchName`, `vergiDairesi`,
  // `vergiNo` kimlik/finans verisidir ve S1'e ALINMAZ; `tckn`/`iban` hariçliği ayrıca
  // office-f01-authorization.spec.ts ile sabitlenmiştir.
  'email',
  'phone',
  'mobilePhone',
  'whatsappPhone',
  'fax',
  'address',
  'city',
  'district',
]);

function projectFields<T extends Record<string, unknown>>(
  row: T,
  s0: Set<string>,
  s1: Set<string>,
  access: F01ProjectionAccess,
): Partial<T> {
  const allowed = access === 'AUTHORIZED_S0_S1' ? new Set([...s0, ...s1]) : s0;
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(row, key)) out[key] = row[key];
  }
  return out as Partial<T>;
}

export function projectF01Lawyer<T extends Record<string, unknown>>(
  row: T,
  access: F01ProjectionAccess,
): Partial<T> {
  return projectFields(row, LAWYER_S0_FIELDS, LAWYER_S1_FIELDS, access);
}

export function projectF01Office<T extends Record<string, unknown>>(
  row: T & { lawyers?: Record<string, unknown>[]; bankAccounts?: Record<string, unknown>[] },
  access: F01ProjectionAccess,
): Partial<T> {
  const out = projectFields(row, OFFICE_S0_FIELDS, OFFICE_S1_FIELDS, access) as Partial<T> & {
    lawyers?: Record<string, unknown>[];
    bankAccounts?: Record<string, unknown>[];
  };

  if (Array.isArray(row.lawyers)) {
    out.lawyers = row.lawyers.map((lawyer) => projectF01Lawyer(lawyer, access));
  }
  if (Array.isArray(row.bankAccounts)) {
    out.bankAccounts = row.bankAccounts.map((account) =>
      projectFields(account, new Set(), BANK_ACCOUNT_S1_FIELDS, access),
    );
  }
  return out;
}
