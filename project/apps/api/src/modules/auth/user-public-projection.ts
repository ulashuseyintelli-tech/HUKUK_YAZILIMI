/**
 * OFFICE-AUTH-PUBLIC-USER-PROJECTION-R02 — auth public-user response sınırı (TEK KAYNAK).
 *
 * BULGU (R01 sertifikasyonu, doğrulanmış): auth yüzeylerinin ÜÇÜ de Prisma satırını
 * doğrudan yanıta taşıyordu:
 *   - `GET  /auth/me`      → `{ user }` (ham `request.user`; select yok, `include: { tenant: true }`)
 *   - `POST /auth/login`   → `{ token, user: sanitizeUser(user), tenant: user.tenant }`
 *   - `POST /auth/register`→ `{ token, user: sanitizeUser(user), tenant: result.tenant }`
 * `sanitizeUser` bir BLACKLIST'ti (`const { passwordHash, ...rest }`) ve yalnız `passwordHash`
 * düşürüyordu → `tokenVersion`, `passwordChangedAt`, `isActive`, timestamps ve TÜM `Tenant`
 * satırı (`settings` JSON dahil) yanıta çıkıyordu. Global serializer/@Exclude YOKTUR
 * (`main.ts` yalnız `useGlobalPipes`).
 *
 * SÖZLEŞME — TEK MERKEZİ ALLOWLIST (blacklist/sanitize DEĞİL).
 * ---------------------------------------------------------------------------
 * 1. Alanlar tek tek SİLİNMEZ; yalnız açıkça izin verilenler AÇIK NESNE LİTERALİ ile
 *    kurulur. Object spread + `delete` KULLANILMAZ.
 * 2. Prisma `User`/`Tenant` nesnesi yanıta ASLA doğrudan taşınmaz.
 * 3. Şemaya yeni alan eklendiğinde yanıta KENDİLİĞİNDEN GİRMEZ (fail-closed).
 *    Hassas alanın adı önceden bilinmese bile dışarıda kalır.
 * 4. Dönüş tipleri explicit'tir; `any` kullanılmaz.
 * 5. AYNI projeksiyon register · login · `/auth/me` için kullanılır.
 *
 * ALLOWLIST GERÇEK TÜKETİCİDEN TÜRETİLDİ (tahmin YOK):
 *   apps/web/src/lib/auth-context.tsx
 *     interface User   { id, email, name, surname, role, tenantId }
 *     interface Tenant { id, name, slug }
 *     checkAuth : setUser(response.user)      · setTenant(response.user?.tenant || null)
 *     login     : setUser(response.user)      · setTenant(response.tenant)
 *   Mekanik tarama: web kodunda `user.isActive|createdAt|updatedAt|tokenVersion|
 *   passwordChangedAt` ve `tenant.settings|plan|accountType|createdAt|updatedAt`
 *   kullanımı 0 eşleşme. `register` yanıtının web tüketicisi YOK (yalnız `login` çağrılıyor).
 *
 * YASAK (allowlist dışı kaldığı için OTOMATİK): password · passwordHash · tokenVersion ·
 * passwordChangedAt · reset/invite token alanları · isActive · createdAt · updatedAt ·
 * Tenant.settings · Tenant.plan · Tenant.accountType · secret/config/lifecycle alanları.
 */

/** Projeksiyonun okuduğu User alanları. Prisma `User` satırı bu şekle yapısal olarak uyar. */
export interface AuthUserProjectionSource {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly name: string;
  readonly surname: string;
  readonly role: string;
  /** `include: { tenant: true }` ile gelen satır; yoksa/null ise yanıtta `tenant` anahtarı OLMAZ. */
  readonly tenant?: AuthTenantProjectionSource | null;
}

/** Projeksiyonun okuduğu Tenant alanları. Prisma `Tenant` satırı bu şekle yapısal olarak uyar. */
export interface AuthTenantProjectionSource {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

/** `/auth/me`, `login` ve `register` yanıtlarındaki public tenant nesnesi. */
export interface PublicAuthTenant {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

/** `/auth/me`, `login` ve `register` yanıtlarındaki public user nesnesi. */
export interface PublicAuthUser {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly name: string;
  readonly surname: string;
  readonly role: string;
  /** Kaynakta `tenant` varsa projeksiyonu; yoksa anahtar hiç bulunmaz (null sözleşmesi üretilmez). */
  readonly tenant?: PublicAuthTenant;
}

/**
 * Public allowlist anahtarları — testlerin differential olarak sabitlediği tek kaynak.
 * Bu diziler DOKÜMANTASYON DEĞİL, sözleşmedir: projeksiyon nesne literali ile bunlara
 * birebir uyar ve `auth-public-user-projection.spec.ts` eşitliği zorlar.
 */
export const PUBLIC_AUTH_USER_FIELDS = [
  'id',
  'tenantId',
  'email',
  'name',
  'surname',
  'role',
] as const;

export const PUBLIC_AUTH_TENANT_FIELDS = ['id', 'name', 'slug'] as const;

/** Tenant satırını public tenant nesnesine çevirir (açık allowlist). */
export function toPublicAuthTenant(source: AuthTenantProjectionSource): PublicAuthTenant {
  return {
    id: source.id,
    name: source.name,
    slug: source.slug,
  };
}

/**
 * User satırını public auth user nesnesine çevirir (açık allowlist).
 *
 * `register`, `login` ve `/auth/me` yüzeylerinin TAMAMI bu fonksiyonu kullanır.
 * Kaynakta `tenant` varsa `toPublicAuthTenant` ile birlikte projekte edilir.
 */
export function toPublicAuthUser(source: AuthUserProjectionSource): PublicAuthUser {
  // Object spread KULLANILMAZ: her iki dal da alan alan AÇIK nesne literali kurar.
  // Böylece "kaynağı yay, sonra sil" deseni hiçbir yolda oluşmaz.
  if (source.tenant === undefined || source.tenant === null) {
    return {
      id: source.id,
      tenantId: source.tenantId,
      email: source.email,
      name: source.name,
      surname: source.surname,
      role: source.role,
    };
  }

  return {
    id: source.id,
    tenantId: source.tenantId,
    email: source.email,
    name: source.name,
    surname: source.surname,
    role: source.role,
    tenant: toPublicAuthTenant(source.tenant),
  };
}
