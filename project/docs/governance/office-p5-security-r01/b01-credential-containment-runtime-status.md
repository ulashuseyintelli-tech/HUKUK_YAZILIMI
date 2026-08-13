# P5-B01 — Credential Containment Runtime Re-Verification

Statü sözlüğü (X1 ile aynı, kapalı küme): `PRESENT_IN_SOURCE` / `PRESENT_IN_DIST` / `ABSENT` / `STALE` / `UNKNOWN`.
Kanıt etiketleri: `VERIFIED` (bu oturumda komutla), `OBSERVED` (bu oturumda dosya içeriği), `INFERRED`, `UNKNOWN`.

Girdi: X1 belgesi `docs/governance/office-p6-runtime-truth-r01/runtime-truth-and-release-readiness.md`
(PR #2352 · `c0f37c58`). X1'in matrisi körlemesine kabul edilmedi; hem scanner yeniden koşuldu hem
scanner'dan bağımsız ham ölçüm yapıldı.

## 1. Sorunun tanımı

PR #1932 (`fix(office): Lawyer credential alanlarini public API yanitlarindan cikar (P1)`,
squash `8899cf5fae135e55955c8cbe01927976f80f1db9`) canonical main'de VAR. Soru: **RUNTIME'da hangi durumda
ve canlı yüzeyde etkili mi?**

Containment mekanizması (`OBSERVED`, #1932 diff'i):
- `src/modules/lawyer/lawyer-public-projection.ts` — `LAWYER_CREDENTIAL_FIELDS = ['uyapToken', 'eSignatureSerial']`;
  `toPublicLawyer` (anahtar tamamen silinir, null'a çekilmez), `toPublicLawyers`, `withPublicLawyers` (Office nested).
- `lawyer.service.ts` — tüm dönüş yolları projeksiyon sarmalı; `office.service.ts` — `getPublicOffice`/`update`
  nested `lawyers` sarmalı. Spec: `lawyer-credential-response-containment.spec.ts` (304 satır),
  `ci-manifests/pure/office-auth-user.txt`'e bağlı.
- İkinci bağımsız katman (`OBSERVED`, #2076): F01 allowlist projeksiyonu (`office-f01-projection.ts`) —
  `LAWYER_S0/S1_FIELDS` içinde credential alanları yok; bilinmeyen anahtar düşürülür.

## 2. Canlı yüzeyin çözümü — hangi kök fiilen servis ediyor?

Taze süreç envanteri (`VERIFIED`, 2026-08-13 09:19):

| Port | PID | Süreç | Kök | Kanıt |
|---|---|---|---|---|
| 3002 | 26372 | `next start --port 3002` | `HY_W4_RELEASE11` (web) | komut satırında mutlak yol (`VERIFIED`) |
| 8080 | 13824 (start 2026-08-12 14:45:50) | `node dist/apps/api/src/main.js` | **`HY_W4_RELEASE10`** | aşağıdaki üçlü kanıt |

8080 → RELEASE10 ataması:
1. Scanner consumer tespiti (`VERIFIED`, benim koşumum): `--runtime-root=HY_W4_RELEASE10` için
   `consumer.state=PRESENT, processIds=[10652,13824], signatures=[node.exe:api-main], reason=RUNTIME_ROOT_API_PROCESS_DETECTED`.
   Aynı scanner RUNTIME kökü için `ABSENT NO_RUNTIME_ROOT_API_PROCESS`, RELEASE11 için `ABSENT` verdi.
2. Eleme (`VERIFIED`): RELEASE11'de API dist **yok** (`dist/apps/api/src/main.js` mevcut değil) — 8080 oradan koşamaz.
   RELEASE10 dist'i mevcut aday kökler içinde en yenisi (build 2026-08-11 13:36; süreç start'ı ondan sonra).
3. X1'in 2026-08-12 gözlemi de 8080'i RELEASE10'a çözmüştü (`OBSERVED`, X1 belgesi §2.2).

API global prefix `api`, default port 8080 (`main.ts:28-31`, `OBSERVED`). Kimliksiz problar (`VERIFIED`):
`GET /api/lawyers → 401`, `GET /api/staff → 401`, `GET /api/office → 401` (guard zinciri canlıda aktif),
prefixsiz yollar 404.

**Sonuç:** RUNTIME kökü (`C:\Development\HY_WT\RUNTIME`) canlı tüketici DEĞİL; fiili canlı API yüzeyi
`HY_W4_RELEASE10` @ `77a347a9831522aebddcb4a0ec14767ff21c851b`.

## 3. X1 yeniden-doğrulaması — RUNTIME kökü (X1'in ölçtüğü hedef)

Scanner yeniden koşumu (`VERIFIED`): 9 capability satırının tamamı X1'in yayınladığı matrisle **birebir aynı**
(F01 `STALE [RUNTIME_SOURCE_PARTIAL, RUNTIME_DIST_PARTIAL, RUNTIME_DIST_MARKER_MISSING]`;
Lawyer containment `PRESENT_IN_DIST [SOURCE_PARITY, DIST_MARKERS_PRESENT]`;
approval engine `STALE [RUNTIME_SOURCE_BLOB_DRIFT]`; kalan 6 satır `PRESENT_IN_DIST`; consumer `ABSENT`).

Scanner'dan bağımsız ham çapraz kontrol (`VERIFIED`):

| Artifact | Ölçümüm | X1 tablosu | Eşleşme |
|---|---|---|---|
| RUNTIME dist `lawyer-public-projection.js` SHA-256 | `923cf90f…8ed6` | aynı | ✔ |
| RUNTIME dist `lawyer.service.js` SHA-256 | `430837b9…11f1f` | aynı | ✔ |
| RUNTIME dist `office.service.js` SHA-256 | `698de18f…7082` | aynı | ✔ |
| RUNTIME kaynak overlay `git hash-object` (3 dosya) | `d2a6a602` / `e62a4ec1` / `605409e6` | canonical bloblarla birebir | ✔ |
| `8899cf5f` (#1932) → RUNTIME HEAD `3c73708d` ancestry | **HAYIR** | X1: "not an ancestor … source overlay" | ✔ |
| RUNTIME dist `office-f01-authorization.guard.js` | **YOK**; `staff.controller.js` F01 referansı **0** | X1: F01 guard/dist absent | ✔ |

**Hüküm:** X1'in RUNTIME-kök matrisi bağımsız ölçümle 1:1 yeniden üretildi. RUNTIME kökündeki containment
"PRESENT_IN_DIST" durumu commit ancestry değil **source-overlay** ürünüdür (X1'in nüansı doğru).

## 4. Canlı kök (RELEASE10) — işleyen runtime gerçeği

Scanner koşumu `--runtime-root=HY_W4_RELEASE10` (`VERIFIED`) + ham ölçüm:

| Capability | Scanner statüsü | Ham kanıt | Nihai değerlendirme |
|---|---|---|---|
| **Lawyer credential containment** | `PRESENT_IN_DIST` `[SOURCE_PARITY, DIST_MARKERS_PRESENT]`; ancestry `inRuntimeHead=true` | dist `lawyer-public-projection.js` SHA-256 `923cf90f…` (RUNTIME ve canonical ile **bayt-birebir**); `lawyer.service.js` `154bf29e…` marker `lawyer-public-projection` VAR; `office.service.js` `0cc65295…` marker VAR; `git diff 77a347a9..origin/main` iki serviste wrap-site değişikliği **boş** | **PRESENT_IN_DIST — ancestry ile** (overlay değil) |
| F01 authorization enforcement | `STALE [RUNTIME_DIST_MARKER_MISSING]` (tek eksik marker: `PUBLIC_S0_ONLY`) | `office-f01-authorization.guard.js` **VAR** (SHA-256 `be2cf6dc…`, marker `OFFICE_F01_AUTHORIZATION_REQUIRED` VAR); `staff.controller.js` F01 referansı 4; `lawyer.controller.js` 9; `#2076 (2cae1fb1)` → `77a347a9` ancestry **EVET**; kaynak parity 4/4 | **fiilen PRESENT_IN_DIST** — scanner statüsü yanlış-pozitif `STALE` (bkz. §7 marker defekti) |
| Office approval engine | `PRESENT_IN_DIST` | kaynak parity + dist marker (scanner) | PRESENT_IN_DIST (RUNTIME'daki `STALE`'in aksine) |
| Password recovery + hardening | `PRESENT_IN_DIST` | scanner | PRESENT_IN_DIST; bayrak default OFF (fail-closed) — closure P5-B05/PHASE B konusu |
| Staff/lawyer lifecycle | `PRESENT_IN_DIST` | scanner | PRESENT_IN_DIST |
| CAP-02 telemetri / canary scope / identity-binding / reportingline | `PRESENT_IN_DIST` (4 satır) | scanner | PRESENT_IN_DIST |
| Consumer | **`PRESENT`** `processIds=[10652,13824]` | §2'deki üçlü kanıt | canlı tüketici BU kök |

## 5. Kapsam kalemleri — capability × kanıt tablosu (B01 çıktısı)

| Kalem | Kaynak (canonical main) | Canlı runtime (RELEASE10, 8080) | RUNTIME kökü (tüketicisiz) | Kanıt |
|---|---|---|---|---|
| `uyapToken` yanıt containment'ı | VAR — çift katman (delete-projeksiyon + F01 allowlist), test-kilitli | **PRESENT_IN_DIST, ancestry EVET → ETKİLİ** | PRESENT_IN_DIST (overlay) | §3–§4; spec `lawyer-credential-response-containment.spec.ts` |
| `eSignatureSerial` yanıt containment'ı | VAR — aynı mekanizma | **ETKİLİ** | PRESENT_IN_DIST (overlay) | aynı |
| Lawyer diğer credential alanları | Şemada başka credential alanı yok (`uyapUsername` bilinçli S1-allowlist'te, test-sabitli) | n/a | n/a | schema `2535-2537`; 106 include/select sitesi tarandı, sızıntı adayı yok |
| Lawyer serialize eden DİĞER modül yolları | Dar `select` (16+ site) veya alan-alan kurulum (10 site); ham Lawyer satırı serialize eden yol **bulunamadı** | aynı kod | — | ajan taraması, file:line ile |
| Auth/JWT yüzeyinde Lawyer credential | JwtStrategy Lawyer yüklemiyor; login/register yanıtı `sanitizeUser` | aynı | — | `jwt.strategy.ts:31-37`, `auth.service.ts:72-76,148-151` |
| Office SMTP/SMS secret'ları (HTTP) | `SECRET_FIELDS=[smtpPass,smsApiKey,smsApiSecret]`; F01 allowlist'te anahtarlar YOK → düşer; actor-less dalda `"********"`; GET smtp/sms-settings `"********"`; audit log maskeli | aynı kod dist'te (`office.service.js` marker'ları VAR) | PRESENT_IN_DIST (overlay) | `office.service.ts:17-21, 41-47, 74-82, 297-406` |
| Office secret at-rest | AES-256-GCM `enc:v1:`; **DB (`VERIFIED`)**: TELLİ HUKUK `smtpPass=ENCRYPTED`; `LEGACY_PLAINTEXT` satır sayısı **0**; SMS alanları NULL | — | — | önek sınıflandırma SELECT'i (değer okunmadı) |
| `CREDENTIAL_ENCRYPTION_KEY` fail-closed | **VERIFIED fail-closed (yazma)**: secret'lı payload'da `assertEncryptionConfigured()` `prisma.update`'ten ÖNCE 503 throw; plaintext fallback YOK; `enc:v1:`-önekli değer + anahtar yok → okuma THROW; legacy düz-metin okuma olduğu-gibi-döner (geriye-uyum) | aynı kod | — | `office.service.ts:31-37, 313-318, 356-362`; `office-credential-encryption.util.ts:32-63`; testler `office-settings-security.spec.ts:118-137` |
| Anahtarın ortamda tanımlılığı | — | **UNKNOWN** (no-secrets: `.env` açılmadı, süreç env'i okunmadı). DB'de `enc:v1:` kayıt varlığı anahtarın **en az bir kez** yapılandırılıp kullanıldığını gösterir (`INFERRED`) | UNKNOWN | — |
| Credential alanlarının DB doluluğu | — | `uyapToken` dolu satır **0/31**, `eSignatureSerial` **0/31** (3 tenant toplamı, `VERIFIED`) | — | count SELECT'i |

## 6. B01 hükmü

1. **PR #1932 containment'ı canlı yüzeyde ETKİLİDİR**: fiilen servis eden kök (RELEASE10, port 8080)
   için kaynak parity + dist marker + bayt-birebir projeksiyon modülü + `#1932` commit ancestry'si + canlı
   tüketici kanıtlarının tamamı pozitiftir. Ayrıca korunan iki alanın DB doluluğu bugün 0'dır (ifşa
   etkisi tarihsel pencereyle sınırlı).
2. X1'in "containment PRESENT_IN_DIST ama overlay, ancestry değil" hükmü RUNTIME kökü için doğrudur ve
   bağımsız olarak yeniden üretilmiştir; ancak **RUNTIME kökü canlı tüketici değildir** — canlı yüzeyde
   containment overlay'e değil gerçek ancestry'ye dayanır.
3. F01 enforcement canlı kökte fiilen mevcuttur (staff/lawyer mutasyon kapıları canlıda çalışır);
   scanner'ın RELEASE10 için verdiği `STALE` tek başına `PUBLIC_S0_ONLY` marker defektinden kaynaklanır (§7).
4. `BLOCKED_BY_RUNTIME_MODEL` deployment disposition'ı bu lane'in kapsamı dışında ve değişmemiştir
   (bilinen devredilmiş kalem).

## 7. Cross-lane bulgu — scanner marker defekti (F-B01-02)

```
CROSS-LANE FINDING ID : CLF-P5-01
DISCOVERED BY         : CLAUDE-C2 / P5-B01
TARGET LANE           : X1 teslimatı (office-runtime-release-readiness scanner) — successor ataması PAGE-O0'da
SEVERITY              : MEDIUM (ölçüm doğruluğu; kapatma/karar yanlış yönlendirebilir)
EVIDENCE              : office-f01-projection.ts:9 → PUBLIC_S0_ONLY yalnız TİP birleşiminde
                        (export type F01ProjectionAccess = 'PUBLIC_S0_ONLY' | 'AUTHORIZED_S0_S1');
                        tipler derlemede silinir → hiçbir dist bu string'i içeremez.
                        Ölçüm: RELEASE10 dist PUBLIC_S0_ONLY=0 / AUTHORIZED_S0_S1=1;
                        canonical kök dist'te de 0/1. Sonuç: scanner requiredMarkers'ı
                        derlenemez bir marker istiyor → F01 için yapısal yanlış-pozitif STALE.
                        (X1'in RUNTIME-kök F01=STALE hükmü yine de geçerli — orada gerekçe
                        SOURCE_PARTIAL/DIST_PARTIAL: guard/projection dosyaları tamamen yok.)
DOES IT BLOCK CURRENT LANE? : HAYIR (B01 hükmü ham kanıtla verildi)
RECOMMENDED SUCCESSOR : Scanner requiredMarkers düzeltmesi — PUBLIC_S0_ONLY yerine çalışma-zamanı
                        literal'i (örn. AUTHORIZED_S0_S1 karşılaştırma satırı office-f01-projection.ts:121)
```

## 8. Yeni bulgu — `GET /api/auth/me` credential-material sızıntısı (F-B01-01)

Statik zincir (`OBSERVED`, YÜKSEK güven; runtime `UNKNOWN` — kimlik doğrulamalı çağrı no-secrets gereği yapılmadı):

- `auth.service.ts:147-151` `validateUser` → `prisma.user.findUnique({ include: { tenant: true } })` — select/omit yok, tam satır.
- `jwt.strategy.ts:31-37` → dönen tam satır `request.user` olur.
- `current-user.decorator.ts:8` argümansız `@CurrentUser()` → tüm nesne.
- `auth.controller.ts:48-52` `GET /auth/me` → `return { user }` — `passwordHash`, `tokenVersion`,
  `passwordChangedAt` yanıtta. Global serializer yok; `sanitizeUser` bu yolda çağrılmıyor (`auth.service.ts:189-192` private).

Etki: yalnız çağıranın KENDİ bcrypt hash'i (cross-user değil); yine de credential-material response ihlali
(XSS/log yakalama senaryolarında risk). `docs/governance/` altında mevcut kayıt yok. Diğer argümansız
`@CurrentUser()` tüketicilerinin sızdırmadığı doğrulandı (yalnız `tenantId` okurlar).

**Disposition önerisi:** PHASE B kapsamına dahil owner kararı gerektirir (B01 evidence'ı kapsam
saptamaz): `modules/auth/**` PHASE B exclusive-write listesindedir; düzeltme + negatif assertion
spec'i düşük-riskli eklenebilir. Karar PAGE-O0'a bırakıldı — NEW OWNER DECISION REQUIRED.

## 9. Diğer residual kayıtlar

- F-B01-03 GET/PUT yetki asimetrisi (`office.controller.ts:144-147, 178-181` vs `:151+167, :185+198`).
- F-B01-04 `OfficeService.getOrCreate` (`office.service.ts:115-153`) public ham yüzey; 4 dış çağıranın
  tümü yalnız `office.name` okuyor (`VERIFIED`, file:line ajan raporunda).
- F-B01-05 `Lawyer.uyapToken` "// Şifrelenmiş" yorumu (schema:2536) kod karşılıksız; alana yazan servis
  yolu yok, DB doluluğu 0 — düşük öncelik, kayıt amaçlı.
