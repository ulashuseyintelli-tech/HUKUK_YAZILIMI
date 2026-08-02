/**
 * CLIENT-OWN-13-MUTATION-AUTHORIZATION-I01 — KANONİK CLIENT MUTATION POLİTİKASI.
 *
 * Owner kararları (D01/D02/D03, RATIFIED 2026-08-01):
 *
 *  D01 CREATE  — müvekkil oluşturma operasyonel bir büro işlemidir:
 *                VIEWER: DENY · USER: ALLOW · ADMIN: ALLOW. Lawyer profili ŞART DEĞİL.
 *
 *  D02 UPDATE  — önce coarse gate: VIEWER hiçbir mutation yapamaz · USER yalnız STANDARD
 *                alanları · ADMIN standart + hassas. Hassas alan için ek eşik:
 *                ADMIN **veya** officeApproval.isApproverEligible(actor).
 *                Bilinmeyen/yeni alan FAIL-CLOSED biçimde HASSAS kabul edilir.
 *                Tek request hem standart hem hassas alan içeriyorsa TAMAMI hassas
 *                yetki gerektirir — partial update UYGULANMAZ.
 *
 *  D03 KAYNAK  — CLIENT ikinci/paralel bir rol-capability altyapısı KURMAZ. İki mevcut
 *                primitive yeniden kullanılır: `UserRole` (coarse) ve OFFICE'in
 *                `isApproverEligible` hesabı (elevated). OFFICE eligibility hesabı
 *                KOPYALANMAZ/YENİDEN ÜRETİLMEZ — yalnız çağrılır (bkz. client.service.ts).
 *
 * Bu modül SAF ve yan etkisizdir: DB'ye erişmez, `isApproverEligible`'ı kendisi
 * çağırmaz; çağıran, o boolean'ı `elevatedAuthority` olarak GEÇİRİR. Böylece OFFICE
 * bağımlılığı tek bir yerde (service) kalır ve politika bağımsız test edilebilir.
 */

/** Repo `UserRole` enum'unun (ADMIN/USER/VIEWER) yapısal karşılığı — Prisma'ya bağımlılık yok. */
export type ClientActorRole = 'ADMIN' | 'USER' | 'VIEWER';

export interface ClientMutationActor {
  userId?: string | null;
  role?: string | null;
  /**
   * OFFICE `officeApproval.isApproverEligible(userId, tenantId)` sonucu. Politika bunu
   * KENDİSİ HESAPLAMAZ (D03: OFFICE hesabı kopyalanmaz), çağırandan alır.
   */
  elevatedAuthority?: boolean;
}

/** Sınıflandırma — owner D02 tanımına birebir. */
export type ClientFieldClass = 'STANDARD' | 'SENSITIVE' | 'LIFECYCLE';

/** Stabil makine-okunur ret kodları. Mesaj metni değişse de bu kodlar SÖZLEŞMEDİR. */
export const CLIENT_MUTATION_REASON = {
  ALLOWED: 'CLIENT_MUTATION_ALLOWED',
  NO_ACTOR: 'CLIENT_MUTATION_DENIED_NO_ACTOR',
  VIEWER_DENIED: 'CLIENT_MUTATION_DENIED_VIEWER',
  UNKNOWN_ROLE: 'CLIENT_MUTATION_DENIED_UNKNOWN_ROLE',
  SENSITIVE_DENIED: 'CLIENT_MUTATION_DENIED_SENSITIVE_FIELDS',
  LIFECYCLE_DENIED: 'CLIENT_MUTATION_DENIED_LIFECYCLE',
  /**
   * OWN-13 I02-R1 (owner req. 7): actor'un tenant'ı ile hedef tenant EXACT eşit değil.
   * Tenant isolation `where` yan-tümceleriyle zaten uygulanır; bu ondan ÖNCE gelen ayrı
   * bir katmandır ve hiç sorgu üretmeden reddeder.
   */
  TENANT_MISMATCH: 'CLIENT_MUTATION_DENIED_TENANT_MISMATCH',
} as const;

export type ClientMutationReason =
  (typeof CLIENT_MUTATION_REASON)[keyof typeof CLIENT_MUTATION_REASON];

export interface ClientMutationDecision {
  allowed: boolean;
  reasonCode: ClientMutationReason;
  /** Reddi tetikleyen alan ADLARI — DEĞER ASLA taşınmaz (PII sızıntısı yasağı). */
  offendingFields?: string[];
}

/**
 * STANDART OPERASYONEL ALANLAR (owner D02) — iletişim bilgileri, operasyonel notlar,
 * tebrik/iletişim TERCİHLERİ ve hukuki kimliği veya temsil yetkisini DEĞİŞTİRMEYEN alanlar.
 *
 * Bu liste bir ALLOWLIST'tir: burada olmayan her alan hassas sayılır (fail-closed).
 */
export const CLIENT_STANDARD_FIELDS: readonly string[] = [
  // iletişim
  'email',
  'phone',
  'phones',
  'emails',
  // adres (iletişim bilgisi; hukuki kimlik veya temsil yetkisi değiştirmez)
  'address',
  'city',
  'district',
  'region',
  'postalCode',
  'addresses',
  // operasyonel not
  'notes',
  // tebrik/iletişim TERCİHLERİ (tarih verisi değil, tercih bayrağı)
  'sendBirthdayGreeting',
  'sendAnniversaryGreeting',
  'sendHolidayGreeting',
  'greetingChannel',
];

/**
 * HASSAS ALANLAR (owner D02) — kişi/şirket türü · resmî kimlik numaraları · ad/soyad ve
 * ticari unvanın hukuki kimliği değiştiren bölümü · vergi dairesi/kimliği · vekalet ve
 * temsil yetkisi niteliğindeki alanlar.
 *
 * Bu liste AÇIKLIK içindir; enforcement allowlist tabanlıdır (standart olmayan = hassas),
 * dolayısıyla buraya eklemeyi unutmak bir alanı SESSİZCE serbest bırakmaz.
 */
export const CLIENT_SENSITIVE_FIELDS: readonly string[] = [
  // kişi/şirket türü
  'type',
  'companyType',
  // resmî kimlik numaraları
  'tckn',
  'vkn',
  'identityNo',
  'detsisNo',
  'mersisNo',
  'ticaretSicilNo',
  // hukuki kimliği taşıyan ad/unvan (clientDisplayName zincirinin tamamı)
  'firstName',
  'lastName',
  'companyName',
  'name',
  'displayName',
  // vergi
  'taxOffice',
  // hukuki statü (tebligat/yetki sonucu doğurur)
  'nationality',
  'isForeigner',
  'gender',
  // vekalet / temsil yetkisi
  'canCollect',
  'canWaive',
  'canSettle',
  'canRelease',
  'poaStartDate',
  // kimlik/kuruluş verisi (tebrik TERCİHİ değil, verinin kendisi)
  'birthDate',
  'foundingDate',
];

/** LIFECYCLE — mevcut `assertCanManageLifecycle` semantiğine tabidir, bu politika onu DEĞİŞTİRMEZ. */
export const CLIENT_LIFECYCLE_FIELDS: readonly string[] = ['isActive'];

/**
 * FAIL-CLOSED sınıflandırıcı: standart allowlist'te olmayan ve lifecycle olmayan HER alan
 * HASSAS'tır. Yeni bir DTO alanı eklendiğinde politika güncellenmese bile alan sessizce
 * serbest kalmaz — bu, owner'ın "bilinmeyen/yeni alanlar fail-closed hassas" hükmüdür.
 */
export function classifyClientField(field: string): ClientFieldClass {
  if (CLIENT_LIFECYCLE_FIELDS.includes(field)) return 'LIFECYCLE';
  if (CLIENT_STANDARD_FIELDS.includes(field)) return 'STANDARD';
  return 'SENSITIVE';
}

export interface ClientPayloadClassification {
  standard: string[];
  sensitive: string[];
  lifecycle: string[];
  /** En az bir hassas alan (bilinmeyen alanlar dahil) var mı. */
  hasSensitive: boolean;
  hasLifecycle: boolean;
}

/**
 * Payload'daki ALANLARI sınıflandırır. `undefined` değerli anahtarlar YOK SAYILIR:
 * Prisma'da `undefined` "dokunma" demektir, dolayısıyla mutasyon oluşturmaz.
 * `null` YOK SAYILMAZ — null yazmak gerçek bir mutasyondur.
 */
export function classifyClientPayload(payload: Record<string, unknown> | null | undefined): ClientPayloadClassification {
  const standard: string[] = [];
  const sensitive: string[] = [];
  const lifecycle: string[] = [];

  for (const [key, value] of Object.entries(payload ?? {})) {
    if (value === undefined) continue;
    const cls = classifyClientField(key);
    if (cls === 'LIFECYCLE') lifecycle.push(key);
    else if (cls === 'STANDARD') standard.push(key);
    else sensitive.push(key);
  }

  return {
    standard,
    sensitive,
    lifecycle,
    hasSensitive: sensitive.length > 0,
    hasLifecycle: lifecycle.length > 0,
  };
}

function normalizeRole(role: string | null | undefined): ClientActorRole | null {
  if (role === 'ADMIN' || role === 'USER' || role === 'VIEWER') return role;
  return null;
}

/** D01 — create: VIEWER DENY, USER/ADMIN ALLOW. Lawyer profili şart DEĞİL. */
export function decideClientCreate(actor: ClientMutationActor): ClientMutationDecision {
  if (!actor?.userId) {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.NO_ACTOR };
  }
  const role = normalizeRole(actor.role);
  if (role === null) {
    // Tanınmayan/eksik rol → fail-closed.
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE };
  }
  if (role === 'VIEWER') {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED };
  }
  return { allowed: true, reasonCode: CLIENT_MUTATION_REASON.ALLOWED };
}

/**
 * D02 — update. Sıra:
 *   1. actor/rol yoksa DENY
 *   2. VIEWER → hiçbir mutation DENY
 *   3. payload hassas alan içeriyorsa → ADMIN **veya** elevatedAuthority şart
 *      (tek request hem standart hem hassas içeriyorsa TAMAMI hassas sayılır —
 *       partial update UYGULANMAZ)
 *   4. aksi hâlde ALLOW
 *
 * LIFECYCLE alanları bu fonksiyonun kararına DAHİL DEĞİLDİR: onların yetkisi mevcut
 * `assertCanManageLifecycle()`'da kalır (owner: "yetki gevşetme veya davranış
 * değişikliği yapma"). Burada yalnız raporlanır.
 */
export function decideClientUpdate(
  actor: ClientMutationActor,
  payload: Record<string, unknown> | null | undefined,
): ClientMutationDecision {
  if (!actor?.userId) {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.NO_ACTOR };
  }
  const role = normalizeRole(actor.role);
  if (role === null) {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE };
  }
  if (role === 'VIEWER') {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED };
  }

  const classification = classifyClientPayload(payload);
  if (classification.hasSensitive) {
    const elevated = role === 'ADMIN' || actor.elevatedAuthority === true;
    if (!elevated) {
      return {
        allowed: false,
        reasonCode: CLIENT_MUTATION_REASON.SENSITIVE_DENIED,
        // YALNIZ alan ADLARI — değerler asla taşınmaz.
        offendingFields: classification.sensitive,
      };
    }
  }

  return { allowed: true, reasonCode: CLIENT_MUTATION_REASON.ALLOWED };
}

/**
 * FE görünürlük sinyali için türetilmiş yetenek özeti. Backend-derived'dir: frontend
 * politikayı YENİDEN HESAPLAMAZ, bu nesneyi tüketir.
 */
export interface ClientMutationCapabilities {
  canCreate: boolean;
  canUpdateStandard: boolean;
  canUpdateSensitive: boolean;
  /** Mevcut lifecycle eşiği (ACT-11 `canManageLifecycle`) ile AYNI kaynaktan gelir. */
  canManageLifecycle: boolean;
}

export function deriveClientMutationCapabilities(
  actor: ClientMutationActor,
  lifecycleEligible: boolean,
): ClientMutationCapabilities {
  const role = normalizeRole(actor?.role);
  const isActorPresent = !!actor?.userId && role !== null;
  const isViewer = role === 'VIEWER';
  const elevated = role === 'ADMIN' || actor?.elevatedAuthority === true;

  return {
    canCreate: isActorPresent && !isViewer,
    canUpdateStandard: isActorPresent && !isViewer,
    canUpdateSensitive: isActorPresent && !isViewer && elevated,
    canManageLifecycle: lifecycleEligible === true,
  };
}

// =========================================================================================
// OWN-13 I02-R2 — CLIENT ADRES MUTASYON POLİTİKASI (owner D01 "B+" RATIFIED)
//
// Bu bölüm AYNI modülde ve AYNI `CLIENT_MUTATION_REASON` sözlüğüyle çalışır: paralel bir
// capability sistemi veya ikinci bir RolesGuard KURULMAZ (owner D06).
//
// D07 — **`UserRole.ADMIN` TEK BAŞINA elevated DEĞİLDİR.** `decideClientUpdate`'ten ayrılan
// tek nokta budur: adres tarafında yükseltilmiş yetki YALNIZ `actor.elevatedAuthority`
// (yani mevcut `officeApproval.isApproverEligible` / `canManageLifecycle` predicate'i)
// üzerinden gelir. Rol burada sadece coarse gate'i (VIEWER) belirler.
// =========================================================================================

/** Adres mutasyon sınıfı — controller route'larıyla birebir. */
export type ClientAddressOperation = 'CREATE' | 'UPDATE' | 'ARCHIVE' | 'RESTORE';

export interface ClientAddressMutationInput {
  operation: ClientAddressOperation;
  /** UPDATE/ARCHIVE/RESTORE: hedef adres ŞU AN birincil mi. */
  targetIsPrimary?: boolean;
  /** İstek AÇIKÇA birincillik talep ediyor mu (`dto.isPrimary === true` / `makePrimary`). */
  requestsPrimary?: boolean;
  /** Müvekkilin hâlihazırda AKTİF (current) bir birincil adresi var mı. */
  hasActivePrimary?: boolean;
}

/**
 * Owner D02/D03 — hangi adres mutasyonu lifecycle-level yetki ister?
 *
 * - `ARCHIVE` / `RESTORE`: **her zaman** elevated (restore, `makePrimary`den BAĞIMSIZ).
 * - `UPDATE`: hedef ŞU AN birincilse (mevcut birincil kaydın herhangi bir alanı) **veya**
 *   istek birincillik devri talep ediyorsa elevated.
 * - `CREATE`: yalnız AÇIK birincillik talebi MEVCUT aktif birincili düşürecekse elevated.
 *   **D03:** hiç aktif birincil yokken ilk adresin sistem invariant'ı gereği otomatik
 *   birincil olması STANDARD'dır — bu bir devir değildir.
 */
export function requiresElevatedAddressAuthority(input: ClientAddressMutationInput): boolean {
  switch (input?.operation) {
    case 'ARCHIVE':
    case 'RESTORE':
      return true;
    case 'UPDATE':
      return input.targetIsPrimary === true || input.requestsPrimary === true;
    case 'CREATE':
      return input.requestsPrimary === true && input.hasActivePrimary === true;
    default:
      // Bilinmeyen işlem sınıfı → fail-closed.
      return true;
  }
}

/**
 * Adres mutasyon kararı. Sıra: actor → rol → VIEWER → elevated eşiği.
 * `elevatedAuthority` DIŞINDA hiçbir rol yükseltme sağlamaz (owner D07).
 */
export function decideClientAddressMutation(
  actor: ClientMutationActor,
  input: ClientAddressMutationInput,
): ClientMutationDecision {
  if (!actor?.userId) {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.NO_ACTOR };
  }
  const role = normalizeRole(actor.role);
  if (role === null) {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE };
  }
  if (role === 'VIEWER') {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED };
  }
  if (requiresElevatedAddressAuthority(input) && actor.elevatedAuthority !== true) {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.LIFECYCLE_DENIED };
  }
  return { allowed: true, reasonCode: CLIENT_MUTATION_REASON.ALLOWED };
}

// =========================================================================================
// OWN-13 I02-R3 — BULK / BACKFILL CLIENT MUTATION AUTHORITY (owner D04/D06 RATIFIED)
//
// Seed (`/seed/clients`, `/seed/all`, `/seed/fix-clients`) ve contact-followup backfill
// toplu/idempotent CLIENT mutasyonları üretir. Owner D04/D06: bu operasyonlar YALNIZ
// `elevatedAuthority` aktörü tarafından çalıştırılabilir — `UserRole.ADMIN` TEK BAŞINA
// YETMEZ (adres ARCHIVE/RESTORE ile AYNI eşik, D07'nin bu programdaki üçüncü tekrarı).
// Paralel bir capability sistemi veya ikinci bir RolesGuard KURULMAZ.
// =========================================================================================

/**
 * Toplu/backfill CLIENT mutasyon kararı. Sıra: actor → rol → VIEWER → elevated eşiği.
 * Yalnız `actor.elevatedAuthority` yetki verir; rol (ADMIN dahil) tek başına YETMEZ.
 */
export function decideClientBulkMutation(actor: ClientMutationActor): ClientMutationDecision {
  if (!actor?.userId) {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.NO_ACTOR };
  }
  const role = normalizeRole(actor.role);
  if (role === null) {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.UNKNOWN_ROLE };
  }
  if (role === 'VIEWER') {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.VIEWER_DENIED };
  }
  if (actor.elevatedAuthority !== true) {
    return { allowed: false, reasonCode: CLIENT_MUTATION_REASON.LIFECYCLE_DENIED };
  }
  return { allowed: true, reasonCode: CLIENT_MUTATION_REASON.ALLOWED };
}
