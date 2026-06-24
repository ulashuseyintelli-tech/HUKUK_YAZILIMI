# WP-4c-hotfix-2a — Authless Endpoint Review / Public-vs-Auth Decision

> **Durum:** Karar / review (docs-only). **Kod YOK.** WP-4c-0 envanterinin "auth guard yok" işaretlediği iki uç
> kod-doğrulamasıyla incelendi.
> **Bağlam:** WP-4c-0 inventory ([`wp4c-permission-enforcement-inventory.md`](./wp4c-permission-enforcement-inventory.md))
> satırları `case-013` (`POST /cases/suggest-type`), `fin_063`/`fin_064` (`GET /payment-instructions/purposes*`).
> **Ön sürüm:** origin/main `aa18940`.

## 1. Karar özeti (KOD GEREKMİYOR)

Her iki uç da **zaten JwtAuthGuard ile korunuyor** (controller sınıf düzeyinde `@UseGuards(JwtAuthGuard)`).
WP-4c-0 envanterinin "no auth guard" sınıflandırması **YANLIŞ POZİTİF**'tir — tarama yalnız metot düzeyine baktı,
sınıf düzeyindeki guard'ı kaçırdı. **Güvenlik açığı YOK; eklenecek guard YOK; kod PR'ı gerekmiyor.**

(Bu, WP-4 hattında yakalanan 3. ajan-iddia hatasıdır — XOR DB-CHECK ve önce bu uçlar. Ders: ajan bulguları
kod/`@UseGuards` sınıf düzeyinden doğrulanmadan kesin kabul edilmez — [[verify-live-not-just-code]].)

## 2. Kod-doğrulaması

| Uç | Sınıf guard'ı | Sonuç |
|---|---|---|
| `POST /cases/suggest-type` | `case.controller.ts:24` `@UseGuards(JwtAuthGuard)` (sınıf) | **AUTH-GUARDED** (inherited) |
| `GET /payment-instructions/purposes` | `payment-instruction.controller.ts:23` `@UseGuards(JwtAuthGuard)` (sınıf) | **AUTH-GUARDED** |
| `GET /payment-instructions/purposes-by-payer` | aynı (sınıf) | **AUTH-GUARDED** |

## 3. Beş soruya cevap

1. **Bu uçlar kasıtlı public mi?** — **HAYIR.** Üçü de sınıf düzeyi `JwtAuthGuard` arkasında; auth zorunlu.
2. **Public ise hangi veri sızıyor?** — N/A (public değil). Varsayımsal olarak bile:
   - `purposes*`: yalnız **statik enum metadata** (`PaymentPurpose` değerleri + etiket + hesap-tipi eşlemesi);
     DB okuması/tenant verisi/secret YOK (`Object.values(PaymentPurpose).map(...)`).
   - `suggest-type`: kullanıcının KENDİ gönderdiği metni sınıflandırıcıya verir; DB/tenant verisi dönmez.
3. **Internal ise JwtAuthGuard eklenmeli mi?** — **Zaten ekli** (sınıf düzeyi). Değişiklik gerekmez.
4. **`purposes*` static public lookup mu, tenant-sensitive mi?** — **STATIK lookup** (enum-türevli, tenant-bağımsız).
   Yine de auth-guarded.
5. **`cases/suggest-type` hassas veri içeriyor mu?** — Girdi: kullanıcının kendi belge metni; çıktı: takip türü
   önerisi (+güven). Cross-tenant/DB/secret yok. Auth-guarded.

## 4. WP-4c-0 envanteri düzeltmesi

WP-4c-0'daki şu satırların `Current enforcement status` değeri **düzeltilir** (gerçek durum):

| Satır | Eski (yanlış) | Doğru |
|---|---|---|
| case-013 `POST /cases/suggest-type` | NO_EXPLICIT_PERMISSION | **TENANT_ONLY** (sınıf JwtAuthGuard) |
| fin_063 `GET /purposes` | UNKNOWN_NEEDS_REVIEW | **TENANT_ONLY** (statik metadata; auth-guarded) |
| fin_064 `GET /purposes-by-payer` | UNKNOWN_NEEDS_REVIEW | **TENANT_ONLY** (statik metadata; auth-guarded) |

(Envanter dökümanı merge edilmiş durumdadır; düzeltme burada kayda geçer — ayrı re-open gerekmez. Bu satırlar
genel WP-4c-1+ permission-tree kapsamında normal `cases.view`/`finance.view` leaf'lerine eşlenir; özel güvenlik
aciliyeti YOK.)

## 5. Sonuç ve sonraki adım

- **hotfix-2 KOD GEREKTİRMEZ.** İki uç da güvenli; yanlış pozitif düzeltildi.
- **hotfix-2 bu kararla KAPANIR** (ayrı hotfix-2b kod PR'ı açılmaz).
- Sonraki gate: **WP-4c-1 — Phase 1 diagnostics (kod)** (salt-okuma diagnostics; block yok). Bu karar PR'ı merge
  edildikten sonra başlanır.

## 6. (Opsiyonel, düşük öncelik) gözlemler — bu PR'da YAPILMAZ

- İstenirse netlik/defense-in-depth için metot düzeyinde `@UseGuards` tekrarı eklenebilir; ANCAK sınıf düzeyi guard
  tüm controller'larda standart desendir → tekrar gereksiz gürültü olur. **Önerilmez.**
- `suggest-type` için ileride `cases.classifyDocument` leaf'i (WP-4c-0 §9 önerisi) düşünülebilir — permission-tree
  kapsamı, güvenlik aciliyeti değil.

## 7. Non-goals

- Kod / guard / schema / migration / UI / davranış değişikliği YOK.
- Genel RBAC / permission-tree implementasyonu YOK (WP-4c-1+).
- Rate-limit/CORS değişikliği YOK (uçlar public değil; gerekmez).
