/**
 * Branded ID'ler - String Karışıklığını Önler
 * 
 * TypeScript'te string'ler birbirine atanabilir:
 * const caseId: string = debtorId; // ❌ Hata vermez ama yanlış!
 * 
 * Branded ID'ler bunu önler:
 * const caseId: CaseId = debtorId; // ✅ Compile error!
 * 
 * @example
 * function getCase(id: CaseId): Case { ... }
 * 
 * const caseId = CaseId('abc-123');
 * const debtorId = DebtorId('xyz-456');
 * 
 * getCase(caseId);   // ✅ OK
 * getCase(debtorId); // ❌ Compile error
 */

// ============================================
// BRAND UTILITY
// ============================================

declare const __brand: unique symbol;

/**
 * Brand tipi - string'e görünmez etiket ekler
 */
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ============================================
// BRANDED ID TYPES
// ============================================

/** Dosya ID'si */
export type CaseId = Brand<string, 'CaseId'>;

/** Borçlu ID'si */
export type DebtorId = Brand<string, 'DebtorId'>;

/** Müvekkil ID'si */
export type ClientId = Brand<string, 'ClientId'>;

/** Tahsilat ID'si */
export type CollectionId = Brand<string, 'CollectionId'>;

/** Alacak Kalemi ID'si */
export type ClaimItemId = Brand<string, 'ClaimItemId'>;

/** Tenant ID'si */
export type TenantId = Brand<string, 'TenantId'>;

/** Kullanıcı ID'si */
export type UserId = Brand<string, 'UserId'>;

/** Görev ID'si */
export type TaskId = Brand<string, 'TaskId'>;

/** Belge ID'si */
export type DocumentId = Brand<string, 'DocumentId'>;

/** Tebligat ID'si */
export type TebligatId = Brand<string, 'TebligatId'>;

/** İcra Dairesi ID'si */
export type ExecutionOfficeId = Brand<string, 'ExecutionOfficeId'>;

/** Avukat ID'si */
export type LawyerId = Brand<string, 'LawyerId'>;

/** Personel ID'si */
export type StaffId = Brand<string, 'StaffId'>;

// ============================================
// ID FACTORY FUNCTIONS
// ============================================

/**
 * CaseId oluştur
 * @example const id = CaseId('abc-123');
 */
export const CaseId = (id: string): CaseId => id as CaseId;

/**
 * DebtorId oluştur
 */
export const DebtorId = (id: string): DebtorId => id as DebtorId;

/**
 * ClientId oluştur
 */
export const ClientId = (id: string): ClientId => id as ClientId;

/**
 * CollectionId oluştur
 */
export const CollectionId = (id: string): CollectionId => id as CollectionId;

/**
 * ClaimItemId oluştur
 */
export const ClaimItemId = (id: string): ClaimItemId => id as ClaimItemId;

/**
 * TenantId oluştur
 */
export const TenantId = (id: string): TenantId => id as TenantId;

/**
 * UserId oluştur
 */
export const UserId = (id: string): UserId => id as UserId;

/**
 * TaskId oluştur
 */
export const TaskId = (id: string): TaskId => id as TaskId;

/**
 * DocumentId oluştur
 */
export const DocumentId = (id: string): DocumentId => id as DocumentId;

/**
 * TebligatId oluştur
 */
export const TebligatId = (id: string): TebligatId => id as TebligatId;

/**
 * ExecutionOfficeId oluştur
 */
export const ExecutionOfficeId = (id: string): ExecutionOfficeId => id as ExecutionOfficeId;

/**
 * LawyerId oluştur
 */
export const LawyerId = (id: string): LawyerId => id as LawyerId;

/**
 * StaffId oluştur
 */
export const StaffId = (id: string): StaffId => id as StaffId;

// ============================================
// TYPE GUARDS
// ============================================

/**
 * String'in geçerli UUID formatında olup olmadığını kontrol et
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * String'in geçerli CUID formatında olup olmadığını kontrol et
 */
export function isValidCUID(id: string): boolean {
  // CUID: c + 24 karakter
  return /^c[a-z0-9]{24}$/.test(id);
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Herhangi bir Branded ID
 */
export type AnyBrandedId = 
  | CaseId 
  | DebtorId 
  | ClientId 
  | CollectionId 
  | ClaimItemId 
  | TenantId 
  | UserId 
  | TaskId 
  | DocumentId 
  | TebligatId 
  | ExecutionOfficeId 
  | LawyerId 
  | StaffId;

/**
 * Branded ID'den raw string'e dönüşüm
 */
export function unwrapId<T extends AnyBrandedId>(id: T): string {
  return id as unknown as string;
}
