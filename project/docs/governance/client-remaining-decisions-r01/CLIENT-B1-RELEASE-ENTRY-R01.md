# CLIENT B-1 — OFFICE/C33 YAYIN GİRDİSİ (R01)

**Ne istiyor:** main'de düzeltilmiş **tek dosyalık** CLIENT ürün yamasının, **mevcut yayın
hattı** üzerinden canlıya taşınması. Bu belge **ayrı bir yayın hattı kurmaz**, cutover
başlatmaz, deploy/restart istemez — C33'ün kendi prosedürüne **girdi**dir.

**Durum:** kod **main'de**, **canlıda DEĞİL**. İ9 canlı kabulü bu yayına bağlıdır.
Sayaç **8/17**, hizmet kabulü **0/8 tam** — bu girdi ikisini de değiştirmez.

---

## 1. Kimlikler

| Ne | Değer |
|---|---|
| **Yama commit'i (squash)** | `845b92d9343a54bf98d642cdfe3d67eae93e9739` (PR #2609) |
| `main` ucu (bu belge yazılırken) | `845b92d9343a54bf98d642cdfe3d67eae93e9739` — yama **main ucunun kendisi** |
| **Canlı sürüm** | RELEASE21 `2187a78b1621f168605920cdffccb17381dc171a` · web `BUILD_ID g91HUaBesekB-R2rRawQj` |
| Canlı süreçler | API `:8080` PID 50716 · Web `:3002` PID 22440 (ölçüldü, dokunulmadı) |
| İ9 kabul paketi | `d6c51ca0` (PR #2605) — belge + betikler, **ürün kodu içermez** |

## 2. Ürün farkı — yalnız bu yama

| Dosya | Fark |
|---|---|
| `project/apps/api/src/modules/client/client.service.ts` | **+71 / −12** |
| `project/apps/api/src/modules/client/__tests__/client-lifecycle-activation-race.db-gated.integration.spec.ts` | +170 / −0 (test) |

**Tek fonksiyon, tek dal:** `ClientService.update()` içindeki `count === 0` dalı.
Şema değişikliği **yok**, migration **yok**, yeni bağımlılık **yok**, yeni env/flag **yok**,
API yüzeyi (route/DTO) **değişmedi**.

### 2.1 Davranış değişikliği — tam sınır

**ÖNCE:** kayıt aktifken `PUT /clients/:id` `{isActive:true}` → **404 "Müvekkil bulunamadı"**
(kayıt dururken). Kök neden: no-op istekte Prisma'ya verilen `data`nın tüm alanları
`undefined`; `updateMany` bunu `count=0` sayıyor; ürün `count===0` dalında
`NotFoundException` fırlatıyordu.

**SONRA:** başarıya devam **üç koşulun birlikte** sağlanmasına bağlı —
1. Prisma'ya verilen ana güncelleme verisi **gerçekten boş** (test **yalnız `undefined`**
   üzerinden; `null`/`false`/`0`/`''` **gerçek değerdir** ve yazma sayılır),
2. satır **aynı tenant** kapsamında hâlâ mevcut (ayrım **aynı transaction içinde** ölçülür),
3. ilişkisel yazma **niyeti yok** (`phones`/`emails`/`addresses` gönderilmemiş).

Ayrıca **saf no-op'ta** transaction sonrası `syncContactFollowUpTaskSafe` **atlanır** — bu
senkron `Client.contactFollowUpStatus` yazıp yeni `Task` açıyor, dolayısıyla `updatedAt`
ilerletiyordu.

**DEĞİŞMEYENLER (regresyonla kilitli):** gerçek kayıt yokluğunda **404** · lifecycle
yarışında **409 `CLIENT_STATE_CHANGED`** · `assertCanUpdateClient` / `assertActorTenantMatches`
/ `assertCanManageLifecycle` / D-1b checksum kapıları · `create()` ve dedup-reaktivasyon yolu
· gerçek iletişim güncellemelerinde iletişim-görevi senkronu.
`count=1` üretmek için `isActive`, `updatedAt` veya audit'e **yapay yazma eklenmedi**.

**Açıkça bildirilen mevcut davranış:** genel `CLIENT_UPDATE` audit'i saf no-op'ta **da**
yazılır. Kaldırılmadı, gizlenmedi; testte `toHaveLength(1)` ile kilitlendi.

## 3. Test kanıtı

| Aşama | Ölçüm |
|---|---|
| Kusurun yeniden üretimi (yamasız) | jest **exit 1** · `SAF NO-OP → NotFoundException at client.service.ts:1888` |
| Yamalı suite (gerçek PostgreSQL) | **11/11 PASS** · jest **exit 0** |
| Tip kontrolü | `tsc` fark **0** (529 baseline hata; bu iki dosyada **sıfır**) |
| Yamalı derleme | `nest build` **exit 0** · `client.service.js` `01CA99AE…` (RELEASE21 karşılığı `5D3DF71C…`) |
| Yamalı derlemeyle İ9 provası | **PASS 14 / FAIL 0 / ÖLÇÜLEMEYEN 0** — **A-8a artık 200**, A-8b `updatedAt` değişmedi |
| Merge öncesi CI | **9/9 SUCCESS** (`Test Suite` dahil) · MERGEABLE/CLEAN |
| Post-merge main CI | **3/3 SUCCESS** — `CI` · `GOV-COORD-V2 Orchestration Tests` · `Push on main`, **kendi SHA'm `845b92d9` üzerinde**, iptal edilen koşum yok |

Regresyonlar mevcut `client-lifecycle-activation-race.db-gated.integration.spec.ts` içine
eklendi; dosya `apps/api/ci-manifests/db/domain-integration.txt` manifestinde **zaten kayıtlı**
→ CI'da koşar (ayrı CI adımı açılmadı).

Prova ortamı: disposable PostgreSQL `127.0.0.1:5439/hukuk_fix1_test`, yamalı dist ayrı portta
(`:8099`). **Canlı DB'ye 0 yazma**, canlı servislere dokunulmadı, prova süreci koşum sonunda
kapatıldı.

## 4. C33 için yayın kapsamı uyarısı — ÖNEMLİ

`main` (`845b92d9`) canlı RELEASE21'den (`2187a78b`) **ileridedir** ve arada **başka
oturumların** ürün değişiklikleri de vardır. `apps/api/src` altında toplam **11 ürün dosyası**
farklıdır; bunun **yalnız 1'i** bu yamadır:

| Modül | Dosya | Sahibi |
|---|---|---|
| **client** | `client.service.ts` | **bu yama (B-1)** |
| case | `case.service.ts` | başka oturum (AK hattı) |
| lawyer | `dto/create-lawyer.dto.ts` · `lawyer.service.ts` | başka oturum (AK-2) |
| office-approval | `office-approval.service.ts` · `office-f01-authorization.guard.ts` · `office-write-role.policy.ts` | başka oturum (AK-1a + eki) |
| client-financial-disclosure | `client-financial-disclosure-approval-eligibility.ts` · `...-approval.service.ts` | başka oturum (CLF-O0-01) |
| seed | `seed.controller.ts` · `seed.service.ts` | başka oturum |

**Bu belge yalnız kendi yamasının kanıtını taşır.** Diğer on dosyanın kabul/kanıt durumu
kendi hatlarındadır; yayın adayının kapsamı ve sürüm kararı **C33'ündür**. Buradan
"tüm main yayına hazır" sonucu **çıkarılamaz**.

## 5. Canlı doğrulama önerisi (yayından SONRA, ayrı yetkiyle)

İ9'un canlı kabulü zaten paketlidir (`client-live-acceptance-i9-r01`, betik hash'leri
`d6c51ca0`'da sabit). Yayın tamamlandıktan sonra **owner GO'suyla** koşulacak tek şey odur;
bu belge o koşumu **başlatmaz** ve yeni bir onay talebi **değildir**.

Yayının bu yamayı gerçekten taşıdığının ucuz kontrolü: canlı dist'te
`apps/api/dist/apps/api/src/modules/client/client.service.js` içinde `pureNoOpDetected`
geçişinin **bulunması** (RELEASE21'de **0**, yamalı derlemede **3**).

## 6. Kapsam DIŞI

Deploy · restart · cutover başlatma · migration · yeni yayın hattı · canlı yazma ·
İ10…İ15 · B-2 (UPDATE yolundaki lifecycle reddinin stabil kod taşımaması — **açık**, bu
yamaya katılmadı).
