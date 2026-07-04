# Guided-Open + Guarded Edges — Final Yetki · Görevlendirme · Sorumluluk · Audit Modeli

> **Teknik ad:** Guided-Open Authorization with Guarded Edges
> **Tür:** kanonik mimari/karar dokümanı (FINAL). **Kod yok; her uygulama fazı ayrı + açık onay.**
> **Konum:** P0 sayfası [`yetki-agaci-canonical-design.md`](./yetki-agaci-canonical-design.md) gerçek-durum
> haritası + eleştiri + 9-altsistem forensic'i için referanstır. Bu doküman, oradaki **"Case-Scoped
> Permission Enforcement v1 / warn-only→hard-enforce"** stratejisini **Guided-Open + Guarded Edges** ile
> **revize eder ve nihaileştirir** (deny-first dil terk edildi).
> **Temel:** 9-altsistem grounded map + P1 forensic + Ulaş felsefesi (uzun tartışma sentezi, hibrit uzlaşma).

---

## §1. Yönetici özeti

Bu yazılım bir **yönlendirilmiş sıradaki-hamle motoru**dur: doğru adımı söyler, açığı kapatır. Doğruluk
**iş akışından** gelir, deny-first kapı bekçiliğinden değil. Bu yüzden iç operasyonlarda **açık ve hızlıdır
+ her şey loglanır**; **deny-first RBAC kapısı yoktur — ama "guarded-edge" enforcement vardır.** Hukuki /
geri-alınamaz / devlete giden **kenarlar** korunur (route + confirm + approval + audit). İstendiğinde
**tam yetki** verilebilir (kapsamlı/süreli/gerekçeli). En tehlikeli dış işlem (UYAP'a resmî gönderim)
zaten **donanımla** (e-imza flash + 2 partner şifresi) sert-gate'lidir; yazılım onu gate'lemez, geçemez.
Kanun yalnız **geçerlilik** ve **baro hesap-verebilirliğini** belirler; yazılım bunları **kalifiye kişiye
route + gerçek uygulayıcıyı doğru audit** ile karşılar. **İç sorumluluk felsefesi tek-asıl olabilir (Ulaş);
ama audit kaydı HER ZAMAN gerçek uygulayıcıyı yazar.**

Kısaca: **Guided-Open (açık + audit) + Guarded Edges (route/confirm/approval) + Validity-Route (dokunulmaz) +
Truthful Audit + Hardware Boundary (UYAP) + Scoped Full-Authority.**

---

## §2. Felsefe (5 aksiyom — modelin anayasası)

- **A1.** Yazılım sıradaki doğru hamleyi belirler (next-best-action engine).
- **A2.** Tek-asıl iç yazarlık: iç muhasebede nihai sorumlu Ulaş olabilir — **ama bu audit'i değiştirmez.**
- **A3.** Log tutuldukça iç operasyon serbest (audit = sınır). **Kenarlar guarded.**
- **A4.** İstendiğinde tam yetki verilebilir (kapsamlı/süreli/gerekçeli; bkz §7).
- **A5.** Devlete bağlanma (UYAP) yazılım-dışı donanımla gate'li (e-imza + partner şifre).

---

## §3. Üç eksen ayrımı (modelin kalbi)

| Eksen | Soru | Kural |
|---|---|---|
| **EXECUTION** (yürütme) | İşi kim yapar? | İç ops AÇIK + audit; kenarlar guarded. |
| **RESPONSIBILITY** (hesap-verebilirlik) | Sonuçtan kim hesap verir? | Her dosyanın hukuki sorumlu avukatı kalifiye + canonical-change + audit (kurulu: WP-1d-5). |
| **VALIDITY** (geçerlilik) | İşlem hukuken geçerli mi? | Kanun + donanım belirler; **config bükmez** (imza/UYAP/sorumlu-olma). |

> Execution açık olabilir; Responsibility kalifiye+audit kalır; Validity'ye yazılım **karışmaz**, yalnız
> kalifiye kişiye **route** eder + gerçek uygulayıcıyı doğru yazar.

---

## §4. Dört-katman resolver (deny-first değil; yönlendirilmiş engel)

Yeni engine YOK; mevcut **CasePolicyEngine / ActionCode / CpeRequiredGuard** genişler.

```
resolve(user, caseId, action) -> ALLOW | ROUTE_REQUIRED | CONFIRM_REQUIRED
                                | APPROVAL_REQUIRED | HARDWARE_REQUIRED | VALIDITY_BLOCKED | DENY
 1. TENANT BOUNDARY      → tenant yanlışsa DENY. (Tek MUTLAK yazılım güvenlik sınırı.)
 2. VALIDITY ROUTE       → işlem kalifiye kişi gerektiriyorsa (imza/hukuki-sorumlu-olma/UYAP-resmî):
                           kalifiye değilse işlem YAPILMAZ → kalifiye kişiye ROUTE.
                           (tam-yetki bunu AŞAMAZ; UYAP'ta donanım zaten zorlar.)
 3. GUARDED EDGE         → geri-alınamaz / yüksek-riskli / dış-etkili ise:
                           CONFIRM + reason + audit (bazılarında APPROVAL_REQUIRED/approval_id;
                           bazılarında office-admin/fullAuthority). Non-member high-risk dahil.
 4. GUIDED OPEN          → diğer her şey: ALLOW + AUDIT. Yazılım doğru adımı önerir.
```

**Bu deny-first RBAC değildir** (her işleme izin-kontrolü yok). **Ama "herkes bassın, log yeter" de
değildir** — kenarlar `ROUTE/CONFIRM/APPROVAL/HARDWARE/VALIDITY` ile korunur. Bunlar teknik olarak
enforcement'tır; klasik "yasak" değil, **yönlendirilmiş engel**dir.

---

## §5. Aksiyon sınıfları (L0–L4)

**L0 — Tenant hard boundary:** başka büronun verisi → `DENY`. Tartışmasız.

**L1 — Açık operasyon → `ALLOW + AUDIT`:** dosya/görev görüntüleme · not ekleme · taslak hazırlama ·
taslak evrak oluşturma · dahili görev tamamlama · basit belge yükleme.

**L2 — Hassas mutation → context'li:** statü değiştirme · taraf/müvekkil düzenleme · finans verisi
düzenleme · tebligat markAsSent · iletişim bilgisi · export.
```
case-member ise            → ALLOW + AUDIT
case-member değilse         → CONFIRM + REASON + NOTIFY(hukuki sorumlu)   ← guarded edge (sert kapı DEĞİL)
fullAuthority varsa         → ALLOW + AUDIT + decision_source=FULL_AUTHORITY
```
*(Sert dosya-üyeliği kapısı değil; ama non-member high-risk işlemi GÖRÜNMEZ akıtmaz.)*

**L3 — Geri-alınamaz / dış-etki → hard-confirm/route/approval (hard-DENY DEĞİL):**
bank.transfer · UYAP trigger-haciz · UYAP e-Takip submit · resmî evrak generate/send · ceza/hukuk
davası açma · delete due/collection/expense · credential management.
```
Bank transfer → CONFIRM + (gerekirse partner APPROVAL)
Haciz trigger → CONFIRM + VALIDITY/HARDWARE route
Delete        → CONFIRM + reason + audit
Credential    → partner/admin only + audit (+ asla saklanmaz §8)
```

**L4 — Validity actions → `ROUTE` (kalifiye değilse), tam-yetki override EDEMEZ:**
SIGN · LEGAL_RESPONSIBLE_ASSIGNMENT · UYAP official dispatch · official filing.

---

## §6. Capacity zemini + Validity-route invariant (KİLİTLİ)

Capacity GENEL bir permission kapısı **değildir** (Guided-Open). Yalnız **"yanlışsa-geçersiz"** işlemlerde
devreye girer — ve orada bile DENY değil, **kalifiye-ROUTE**:
- **İMZA** → yalnız kalifiye avukat geçerli imza atabilir; stajyer "OK"lasa işlem **void**. Yazılım imzayı
  kalifiye avukata route eder + gerçek uygulayıcıyı yazar.
- **HUKUKİ-SORUMLU OLMA** → yalnız `canBeResponsible` avukat (kurulu).
- **UYAP RESMÎ GÖNDERİM** → e-imza **donanımı** zorlar (partner).

Bu invariant **KODDA sabittir** (config/DB ayarı değil), çünkü **kanun**, tercih değil. **KİLİTLİ KARAR
(D1): "tam yetki" bunu KALDIRAMAZ** — geçersiz imzayı geçerli yapamaz; UYAP'ta zaten donanım kaldırılamaz.

---

## §7. Full Authority (kapsamlı / süreli / gerekçeli — çıplak toggle DEĞİL)

```
fullAuthority:
  scope:      user | office
  duration:   required (auto-expire)
  reason:     required
  enabled_by: required (partner/admin)
  audit:      required (FULL_AUTHORITY_ENABLED/DISABLED)
  override-edebilir:    EXECUTION kapıları · GUARDED-EDGE confirm · L2 non-member uyarısı
  override-EDEMEZ:      tenant boundary · VALIDITY-route · UYAP/e-imza donanımı · credential-storage yasağı
```
- **Per-user fullAuthority = ana akış** (belirli kişiye tam yetki).
- **Office-wide unrestrictedMode = YALNIZ emergency/break-glass** (reason+duration+auto-expire+partner/admin
  +banner zorunlu). Ekranda kırmızı bant: *"Tam yetki modu açık. Tüm işlemler auditleniyor. Validity-route
  ve UYAP donanım sınırı değişmez."*

---

## §8. Devlet sınırı = donanım (yazılım-dışı nihai gate)

- UYAP'a bağlanma = **e-imza flash + Ulaş/Fatma şifresi.** Yazılım gate'lemez, geçemez, zorlamaz —
  gerçeklik gate'liyor. "Tam yetki" bile kimseye fiziksel token veremez.
- Yazılım rolü: **hazırla / kuyruğa al** (açık + audit) → resmî dispatch = partner token-başında.
  Kalifiye-atıf = partnerin e-imzası (gerçek dünyada).
- 🔒 **GÜVENLİK ÇİZGİSİ (değişmez):** yazılım partnerlerin UYAP/e-imza **şifresini ASLA saklamaz /
  otomatik girmez.** Token+şifre partner-elinde, manuel. (Depolarsa tüm donanım-güvenliği çöker + tek-nokta
  hedef olur.)
- **UYAP backend %100 STUB** → gerçek risk "yetkisiz gönderim" değil (donanım engelliyor), **"stub
  'gönderildi' yanılgısı."** Çözüm: bilinçli confirm + truthful audit + **stub ASLA sahte-SUCCESS yazmaz**
  ("HAZIRLANDI/KUYRUKTA" der, "GÖNDERİLDİ" demez).

---

## §9. Tebligat (tek action olamaz — 4'e bölünür)

| Action | Kim yapabilir? | Kontrol |
|---|---|---|
| `PREPARE_NOTIFICATION` | Sekreter / kâtip / stajyer / avukat | ALLOW + AUDIT |
| `APPROVE_NOTIFICATION` | Avukat / hukuki sorumlu | validity-benzeri onay |
| `SEND_APPROVED_NOTIFICATION` | Sekreter / kâtip | `approval_id` şart |
| `SEND_DIRECT_NOTIFICATION` | Avukat / partner | CONFIRM + AUDIT |

> Pratik hayatla uyumlu: işi personel yürütür, hukuki sorumluluk avukat onayına bağlanır. Zamanaşımı
> başlatan resmî gönderim (UETS/KEP) onaysız akıtılmaz.

---

## §10. ActionCode modeli (mevcut omurga; deny değil route/confirm/audit)

- **v1 yaprak** (`CaseLawyer.casePermissions` → ActionCode): `EDIT_CASE` · `GENERATE_DOC` · `SYNC_UYAP` ·
  `VIEW_FINANCE` · `EDIT_FINANCE` · `CHANGE_STATUS` · `EDIT_PARTIES` · `SIGN`(validity-route).
- **Mevcut-ama-bağlı-değil** (yalnız guard wiring eksik): `UYAP_SEND` · `TRIGGER_HACIZ` · `SEND_NOTIFICATION`
  · `UYAP_QUERY`.
- **Guarded-edge (confirm/approval/route):** `INITIATE_BANK_TRANSFER` · `DELETE_*` · `MANAGE_CREDENTIALS` ·
  `TRIGGER_HACIZ` · `UYAP_SEND`(+donanım) · tebligat `SEND_*`.
- Karar çıktıları: `ALLOW · ROUTE_REQUIRED · CONFIRM_REQUIRED · APPROVAL_REQUIRED · HARDWARE_REQUIRED ·
  VALIDITY_BLOCKED · DENY`.
- **Yeni PermissionCatalog/Template tablosu YOK.** ActionCode enum = kod'da yaprak defteri.

---

## §11. Audit modeli (modelin asıl güvencesi)

Mevcut `AuditLog` genişler (yeni store yok). Her event:
```
actor_user_id   ← GERÇEK uygulayıcı (butona kim bastıysa o; "Ulaş yaptı" duruşu kaydı DEĞİŞTİRMEZ)
target_user_id · case_id · action_code · old/new
decision_source ∈ { OPEN, CASE_GRANT, OFFICE_DEFAULT, FULL_AUTHORITY, CONFIRM_REQUIRED,
                    APPROVAL_REQUIRED, VALIDITY_ROUTE, HARDWARE }
reason · approval_id? · created_at · ip/session
```
**Event tipleri:** `PERMISSION_GRANTED/REVOKED` · `SIGNATURE_AUTHORITY_GRANTED/REVOKED` ·
`LEGAL_RESPONSIBLE_CHANGED` · `OPERATION_RESPONSIBLE_CHANGED` · `CASE_TEAM_*_ADDED/REMOVED` ·
`FULL_AUTHORITY_ENABLED/DISABLED` · `ONE_WAY_CONFIRMED` · `NOTIFICATION_APPROVED` · `UYAP_STAGED/DISPATCHED`.

> **İLKE:** iç sorumluluk felsefesi tek-asıl olabilir; **audit kaydı her zaman gerçek uygulayıcıyı yazar.**
> İçeride asıl Ulaş olabilir; ama sistem kaydında butona kim bastıysa o görünür. Bu seni korur.

---

## §12. Drawer / UI (ham checkbox değil)

Drawer üçünü gösterir: **raw grant** (kutu açık mı) · **effective result** (gerçekten izin var mı) ·
**decision source + reason**.
```
[✓] Evrak oluşturabilir     → Allowed         (Guided Open)
[ ] İmza yetkisi            → Route required   (İmza yalnız kalifiye avukatça geçerlidir)
[✓] Finans düzenleme        → Confirm required (geri-alınabilir değil / finansal etki)
```
Kaynak rozetleri: `OPEN · CASE_GRANT · OFFICE_DEFAULT · FULL_AUTHORITY · CONFIRM_REQUIRED · VALIDITY_ROUTE
· HARDWARE`. Validity-route kutusu disabled + açıklama. Ayrıca **gerçek uygulayıcı** görünür.

---

## §13. Escalation fallback (yetki-dışı GERÇEK bug — ayrı ama öncelikli)

Bulgu (P1): `Lawyer.role=EMPLOYEE` (9/9), MANAGER rütbesi=0 → FOUNDER/MANAGER fallback **kimseye**
çözülmüyor → geciken iş üst kademeye çıkamaz. Permission modeline gömülmez; P5/P6 civarı çözülür:
```
görev sahibi → operasyon sorumlusu → hukuki sorumlu → takım lideri → yönetici → partner → admin queue
boşsa bir üste düş; en sonda sistem alarmı.
```
Büro Ayarları **HEALTH-CHECK**: "yönetici tanımlı değil · partner fallback boş · case-task escalation flag
kapalı · opStaffTypes default atamaya bağlı değil."

---

## §14. Üç ekran = projeksiyon

| Ekran | Kanonik kaynak | Yazar |
|---|---|---|
| Büro Ayarları | Office policy + fullAuthority toggle + escalation + health-check | policy (web localStorage → **/office'e bağlanmalı = borç**) |
| Dosya Ekibi + Sorumluluk Geçmişi | CaseLawyer/CaseStaff + Case.responsible* + AuditLog | üyelik + sorumluluk (kanonik) + audit-OKUMA (salt-okuma) |
| Dosya Yetkileri Drawer | CaseLawyer.casePermissions | grant yazar; effective+source+route/confirm+gerçek-uygulayıcı GÖSTERİR |

---

## §15. Non-goals (açılmayacaklar)

Full RBAC / permission-store / role-template-UI · ReBAC/ABAC engine · yeni Person/Catalog/Template/Grant/
Subscription/EventStore tabloları · **deny-first RBAC kapısı** (Guided-Open + guarded-edge yerine) · **sert
dosya-üyeliği kapısı** (L2'de confirm+notify; sert kapı değil) · credential storage/auto-fill (yasak) ·
Codex domain (NAFAKA/scheduler/DueType/balance/tahsil/allocation).

---

## §16. Güvenlik bütçesi nereye gider (deny-first kapı değil)

1. Sıradaki-hamle motorunun **doğruluğu** ← asıl emniyet.
2. Geri-alınamaz/hukuki adımda **bilinçli confirm/approval** ← "OK" bilinçli olsun.
3. **Truthful audit** (gerçek uygulayıcı + decision_source).
4. **Donanım sınırının korunması** ← credential asla saklanmaz.

İnşa edilecek **deny-first permission kapısı yok**; korumalı kenar (route/confirm/approval) + audit var.

---

## §17. Faz planı (route/confirm/approval enforcement — hard-DENY dili yok)

| Faz | İçerik | Kod? |
|---|---|---|
| **P0** | P0 kanonik sayfa (#499) + bu Guided-Open final | docs-only ✅ |
| **P1** | Forensic risk haritası (TAMAMLANDI; kaydedilmedi) | read-only |
| **P2** | `EffectivePermissionResolver` + ActionCode mapping + **truthful AUDIT** + `decision_source`. Hepsi **ALLOW+log** (gözlem; engel yok). | kod |
| **P3** | Guided-Open canlı: **GUARDED-EDGE** (CONFIRM/APPROVAL) tek-yön işlemlerde + `fullAuthority` (scoped/süreli/gerekçeli) + UYAP-stub-dürüstlüğü. | kod |
| **P4** | **VALIDITY-ROUTE**: imza/hukuki-sorumlu kalifiye-yönlendirme (çoğu kurulu) + drawer route rozeti. | kod |
| **P5** | Audit yüzeyi (`PERMISSION_*`/`FULL_AUTHORITY_*`) + escalation health-check + fallback düzeltme. | kod |
| **P6** | Office Settings wiring (localStorage→/office) + opStaffTypes default. | kod |
| **P7+** | (ihtiyaç-gated, yalnız büyürse/çok-ofis) sert üyelik / read-scope / geniş katalog / RBAC. | gate |

**Dil:** hard-deny yok; **route/confirm/approval enforcement** var. Sıra: gözlem (P2) → guarded-edge+
fullAuth (P3) → validity-route (P4) → audit/fallback (P5) → office wiring (P6).

---

## §18. Kilitli kararlar

- **D1 (KİLİTLİ):** fullAuthority, VALIDITY-route'u **kaldırmaz** (açık karar değil, **değişmez invariant**).
  Tenant boundary · validity-route · UYAP/e-imza donanımı · credential-storage yasağı override **edilemez.**
- **D2 (KİLİTLİ):** fullAuthority granülaritesi — **per-user = ana akış**; **office-wide = yalnız
  emergency/break-glass** (reason+duration+auto-expire+partner/admin+banner).
- **D3:** escalation fallback ayrı şerit ama P5/P6 civarı öncelikli (yetkiden bağımsız).

---

## §19. Hüküm

Bu sistemin omurgası RBAC değil — **Guided-Open + Guarded Edges + Validity-Route + Truthful Audit +
Hardware Boundary + Scoped Full-Authority.** Yazılım iş akışını ve doğru-adımı belirler; insan yürütür ve
iç muhasebede asıl (Ulaş) yazar sayılır **ama audit gerçek uygulayıcıyı yazar**; kanun yalnız geçerlilik+
hesap-verebilirliği belirler, onu da yazılım kalifiye-route + doğru-kayıt ile karşılar; en sert dış sınır
(UYAP) donanımdadır. **Deny-first kapı yok; korumalı kenar var.** Klasik kurumsal IAM değil — ama
kontrolsüz de değil. İnşa: motor-doğruluğu + confirm/approval + audit-sadakati + donanım-sınırı koruması.

**İlk kod fazı = P2 (resolver + truthful audit, ALLOW+log) ve ayrı onay bekler.**
