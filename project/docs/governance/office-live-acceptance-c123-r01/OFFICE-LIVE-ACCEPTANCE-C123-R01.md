# OFFICE P2 HEDEFLİ KABUL — C1 · C2 · C3 — KABUL PAKETİ R01

| alan | değer |
|---|---|
| Paket yazıcısı | Claude oturumu `a8d9121a` (P2 sahipsizdi; owner GO "OFFICE TOPLU DEVAM / #2737 + FİNAL HAZIRLIKLARI" §2 ile üstlenildi) |
| Dayanak | owner GO, 2026-09-22 |
| Taban | main `06647f1f` |
| Hedef artefakt | canlı R25B dist (`1524EDC1…4D4E`), salt okumayla ölçüldü (§8) |
| Durum | **HAZIRLIK TAMAM — İZOLE PROVA PASS (3 tam koşum) — CANLI KABUL YAPILMADI** |

> Bu belge canlı koşumu **yetkilendirmez**. Disposable prova canlı PASS **sayılmaz**.
> C1'in karma kanıt yöntemi (§3.1) **owner tarafından kabul edilmemiştir**.
> Bu paket hiçbir kalemi CLOSED ilan etmez ve OFFICE ürün finali anlamına gelmez.

---

## 1. Ön koşullar ve owner kararları — canlı koşumdan önce

| # | koşul | kim | paket nasıl zorlar |
|---|---|---|---|
| Ö-1 | **C1 karma kanıt yöntemi** (§3.1) kabul edilir mi? | owner | Zorlayamaz. Kabul edilmezse C1 sonucu "PASS (yöntem onaysız)" olarak raporlanır |
| Ö-2 | **FD zinciri canlıda koşulsun mu?** Önceki kayıt "FD canlıda KOŞULMAZ" ve "FD zinciri üç ayrı kişi ister" diyor. Bu paket üç **sentetik** aktör (A/B/C) kullanır | owner | Zorlayamaz. Owner "sentetik aktörler üç kişi sayılmaz" derse C3-P0..A5 canlıda koşulmaz (§11) |
| Ö-3 | Canlı `CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED=true` | owner/infra | Kapalıysa C3-P1 ve sonrası 4xx döner. Hüküm FAIL/OLCULEMEDI olur, yanlış PASS üretmez |
| Ö-4 | Canlı dist §8 pinleriyle aynı artefakt | paket | G-6: tutmazsa **exit 4, yazma YOK**. R26 canlıya çıkarsa pinler yeniden ölçülmeli (§8) |
| Ö-5 | Canlı koşum GO'su: `OWNER-GO-OFFICE-C123-YYYYMMDD-Rnn` ve canlı jeton | owner | G-0 biçim + jeton kontrolü |
| Ö-6 | Eşzamanlı canlı kabul veya yayın penceresi yok (CLIENT R26 dahil) | owner | Zorlayamaz. Login hız sınırı (IP başına 10/dk) ortaktır |
| Ö-7 | Canlı outbox tüketicisinin C1-S olaylarına etkisi (§6, E-2) kabul edilir | owner | Zorlayamaz |

---

## 2. Kapsam

| madde | kanıtlanan | kaynak |
|---|---|---|
| **C1** | Taraf yazmaları (müvekkil, alacaklı, borçlu, dava) tek transaction'dadır. Geç bir hata hepsini geri alır. Yinelenen dosya no yazmadan önce reddedilir. VIEWER reddedilir | #2641 · #2645 |
| **C2** | VIEWER, genel onay kutusunun 4 kararını, dispozisyon onayını ve FD ofis/içerik onayını **veri yazmadan** reddeder. Uygun aktör aynı kararları verebilir (pozitif kontrol) | #2606 |
| **C3** | Genel kutu, alan (FD) taleplerinde 4 kararı `DOMAIN_ACTION_REQUIRED` ile reddeder ve iptalde sahiplik kontrolü önce çalışır. FD zinciri A→B→C üç ayrı aktörle ilerler; kendi kendini onaylama ve dört-göz ihlali reddedilir | #2608 · #2612 |

**Kapsam dışı:**
- FD `publish` / `retry-publication` / `reverse` / `supersede` — müşteriye gönderim yalnız bu uçlarda oluşur (G-5).
- Onaylanan taleplerin executor ile yürütülmesi.
- client-intake-promotion mükerrerliği (owner: bu işte düzeltilmez).
- Geçmiş kayıt onarımı.
- AK-2/AK-1a (runId `e1293381` ile kapandı, **yeniden açılmaz**).
- H8 ≤4 sn (P3/CLIENT).

**Mevcut testleri tekrar etmeme gerekçesi:** Birim ve entegrasyon spec'leri (#2606/#2608/#2612/#2645) kod davranışını CI'da zaten kanıtlıyor. Bu paket yalnız CI'nın ölçemediği şeyi ölçer: **derlenmiş canlı artefaktın** gerçek HTTP yüzeyinde aynı davranışı gösterdiğini, ve bunu tenant düzeyinde yazma ve yazmama ölçümüyle.

---

## 3. Senaryolar — 33 kontrol

### 3.1 C1 — geri alma + artefakt bağı (7)

| id | aktör | istek | beklenen |
|---|---|---|---|
| C1-S | ADMIN | `POST /cases`: satır içi alacaklı + borçlu | 201. Commit sonrası 2 sn beklenir, ardından yazma şekli §5'teki pinle **birebir** karşılaştırılır |
| C1-R1 | ADMIN | aynı gövde + var olmayan `staff[].staffMemberId` | 400. Taraf yazmaları tx içinde yapıldıktan **sonra** düşer. Dava/müvekkil/borçlu/alacaklı kalıntısı **0**; tenant diff'i 0 |
| C1-R2 | ADMIN | C1-S ile aynı `fileNumber` | 409, yazma 0 (tx öncesi ön kontrol) |
| C1-V1 | VIEWER | satır içi alacaklı ile dava açılışı | 403 `CLIENT_MUTATION_DENIED_VIEWER`, yazma 0 |

**Karma kanıt yöntemi (owner onayı YOK):** Canlıda hata enjeksiyonu yapılamaz. Geri alma, doğal bir geç hatayla (C1-R1) HTTP üzerinden ölçülür. "Bu davranışı gösteren kod canlıda çalışan koddur" iddiası ise G-6 dist pinleriyle (§8) kurulur. İki parça birlikte kanıttır. Tek başına hiçbiri yeterli değildir. Bu yöntemin yeterliliği **owner kararıdır (Ö-1)**.

### 3.2 C2 — VIEWER ret matrisi + beklenmeyen yazma 0 (9 + 2 pozitif)

| id | aktör | istek | beklenen |
|---|---|---|---|
| C2-G1..G4 | VIEWER (+ bağlı PARTNER avukat) | CHANGE_STATUS talebine approve / reject / request-revision / approve-with-changes | 403 `OFFICE_APPROVAL_DECISION_DENIED_VIEWER`, tenant diff'i **0** |
| C2-D1 | VIEWER | `POST /collection-dispositions/:id/approve` | 403 aynı kod, diff 0 |
| C2-F1 | VIEWER | FD `complete-office-approval` | 403 `DISCLOSURE_APPROVAL_NOT_ELIGIBLE`, diff 0 |
| C2-F2 | VIEWER | FD `complete-content-approval` | 403 aynı kod, diff 0 |
| C2-GP | elev3 (USER + delege) | CHANGE_STATUS approve | başarı; şekil `AuditLog+,OfficeApprovalRequest~` |
| C2-DP | elev1 (USER + PARTNER) | dispozisyon approve | başarı; şekil `AuditLog+,CollectionDisposition~,OfficeApprovalRequest~` |

VIEWER'a kasıtlı olarak bağlı bir **PARTNER** avukat kaydı verildi. Böylece ret, avukat yetkisi eksikliğinden değil rol kuralından gelir.

### 3.3 C3 — üç sentetik aktör, genel kutu retleri, izinli FD ilerleyişi (14)

| id | aktör | istek | beklenen |
|---|---|---|---|
| C3-P0 | A=elev1 | dispozisyon `post` | POSTED |
| C3-P1 | A | `financial-disclosure` | DRAFT sürüm |
| C3-A2 | A | `request-office-approval` | OFFICE_APPROVAL_PENDING + FD talebi |
| C3-G1..G4 | B=elev2 (uygun onaylayıcı) | FD talebine genel kutudan 4 karar | 409 `DOMAIN_ACTION_REQUIRED`, diff 0 |
| C3-G5 | A (talep sahibi) | genel kutu cancel | 409 `DOMAIN_ACTION_REQUIRED` |
| C3-G6 | B (sahip değil) | genel kutu cancel | 403 (sahiplik kontrolü alan kontrolünden önce) |
| C3-N1 | A | `complete-office-approval` | 403 `DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN` |
| C3-A3 | B (USER + MANAGER) | `complete-office-approval` | OFFICE_APPROVED |
| C3-A4 | A | `request-content-approval` | CONTENT_APPROVAL_PENDING |
| C3-N2 | B | `complete-content-approval` | 403 `DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION` |
| C3-N3 | A | `complete-content-approval` | 403 `DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN` |
| C3-A5 | C=elev3 (USER + LAWYER + `canApproveOfficeActions`) | `complete-content-approval` | CONTENT_APPROVED |
| C3-X1 | — | FD sürüm durumu | gönderim durumuna **geçmedi**; publish çağrılmadı |

**Zincir C3-A5'te DURUR.** `publish` G-5 ile paketin HTTP katmanından çağrılamaz.

### 3.4 Kapanış ve izolasyon (4)

| id | ölçüm |
|---|---|
| K-1 | Aktif kullanıcı 0, aktif dava 0, bekleyen talep 0; audit korundu |
| K-2 | Dağıtılmış 5 JWT kapanıştan sonra 401 (`tokenVersion++`) |
| I-1 | Aktörlerin başka tenant'ta audit izi 0 |
| I-3 | Yabancı tenant sayı özeti: kurulum sonrası = kapanış sonrası |

---

## 4. Aktör / rol envanteri (tenant `off-c123-<runId>`, 8 hex, her koşumda yeni)

| etiket | User.role | Lawyer | kullanıldığı adımlar |
|---|---|---|---|
| admin | ADMIN | — | kurulum doğrulama login'i, C1-S/R1/R2 |
| viewer | VIEWER | PARTNER (bağlı) | C1-V1, C2-G1..G4, C2-D1, C2-F1, C2-F2 |
| elev1 (**A**) | USER | PARTNER | C2-DP, C3-P0/P1/A2/A4, C3-G5, C3-N1, C3-N3 |
| elev2 (**B**) | USER | MANAGER | C3-G1..G4, C3-G6, C3-A3, C3-N2 |
| elev3 (**C**) | USER | LAWYER + `canApproveOfficeActions` | C2-GP, C3-A5 |

- E-postalar `off-c123-<runId>-<etiket>@office-acceptance.invalid` biçimindedir (RFC 2606, teslim edilemez). Müvekkil e-postası da `.invalid` alan adındadır.
- Parola süreç belleğinde üretilir. Dosyaya ve çıktıya yazılmaz (G-4).
- Login sayısı 5'tir (hız sınırı 10/dk altında).
- Ofiste `autoGreetingEnabled=false` ayarlıdır.

---

## 5. Veri yazma envanteri

**Kurulum** tek transaction'dır ve yalnız sentetik tenant'a yazar:
- Tenant, Office, 5 User, 5 Lawyer;
- Client, Case (`C123-<runId>`), CaseClient;
- 5 CHANGE_STATUS bekleyen talep (G1–G4, GP);
- D1 zinciri (DISTRIBUTION_RECOMMENDED dispozisyon + bekleyen talep);
- FD zinciri (DISTRIBUTION_APPROVED dispozisyon + onaylı talep).

**Adım başına yazma şekli** DMMF ile ölçülür: tenantId'li 145 model + 37 çocuk model; kapsam dışı 27 model. Şekil pinlidir (`c-expect-shapes.json`) ve sapma **FAIL** sayılır.

| adım | beklenen şekil |
|---|---|
| C1-S | `AccountingJournalEntry+, AccountingJournalLine+x2, AuditLog+x3, Case+, CaseClient+, CaseDebtor+, Client+, Debtor+, ExpenseAuditLog+, ExpenseRequest+, ExpenseRequestItem+x6, IcrabotOutboxAction+x2, IcrabotTimelineEntry+x2, Task+x2` |
| C2-GP | `AuditLog+, OfficeApprovalRequest~` |
| C2-DP | `AuditLog+, CollectionDisposition~, OfficeApprovalRequest~` |
| C3-P0 | `AccountingJournalEntry+x3, AccountingJournalLine+x6, AuditLog+, CollectionDispositionExpenseApplication+, CollectionDisposition~, OfficeApprovalRequest~` |
| C3-P1 | `ClientFinancialDisclosure+, ClientFinancialDisclosureLine+x2, ClientFinancialDisclosureVersion+` |
| C3-A2 | `ClientFinancialDisclosureVersion~, OfficeApprovalRequest+` |
| C3-A3 | `ClientFinancialDisclosureVersion~, OfficeApprovalRequest~` |
| C3-A4, C3-A5 | `ClientFinancialDisclosureVersion~` |
| tüm retler | **boş** (diff 0) |

Prova toplamı: runId `61b38a80`, 27 satır yazıldı ve **üç koşumda da şekil aynıydı**.

---

## 6. Dış etki envanteri

| # | etki | durum | önlem |
|---|---|---|---|
| E-1 | Müşteriye FD gönderimi | **YOK** | G-5, `publish`/`retry-publication`/`reverse`/`supersede` isteklerini istek yapılmadan reddeder. N1 ile ölçüldü (4/4). C3-X1 sürümün gönderim durumuna geçmediğini doğrular |
| E-2 | C1-S'nin iç outbox olayları (`IcrabotOutboxAction` ×2: CASE_OPENED, INTEREST_POLICY_ASSIGNED) | Provada `pending` kaldı; işleyen olmadı. **Canlıda tüketicinin etkisi ÖLÇÜLMEDİ (BİLİNMİYOR)** | Owner kararı Ö-7. Tüketici bir dış kanala (e-posta/SMS/UYAP) yazarsa alıcı yalnız sentetik `.invalid` adreslerdir. Provada e-posta, SMS, bildirim, UYAP ve kuyruk tabloları **0** satırdı |
| E-3 | E-posta | Prova API'sinde `EMAIL_PROVIDER=mock`. Canlıda gerçek sağlayıcı çalışır | Paketin hiçbir adımı e-posta tetiklemez. Tüm adresler `.invalid`; `autoGreetingEnabled=false` |
| E-4 | Executor | Prova API'sinde kapalı. Canlıdaki durum owner/infra'dadır | C2-GP/C2-DP'nin onayladığı talepler CHANGE_STATUS/dispozisyon onayıdır. Executor yürütürse etkisi yalnız sentetik tenant içinde kalır |
| E-5 | Login hız sınırı | 5 login | Eşzamanlı koşum yok (Ö-6) |

---

## 7. Temizlik / kapanış ve kalıcı iz

`c-99-close.js` (runId ile) **silme yapmaz**:
- kullanıcıları pasifler ve `tokenVersion++` uygular;
- ACTIVE davaları kapatır;
- PENDING_APPROVAL talepleri CANCELLED yapar;
- audit'in korunduğunu doğrular.

Hata veya abort olsa bile kapanış çalışır; N4 ile ölçüldü. Kurtarma komutu kurulumdan **önce** yazdırılır.

**Canlıda kalıcı kalanlar:** sentetik tenant ve tüm satırları. Buna muhasebe fişleri (C1-S 1 + C3-P0 3 fiş, 8 satır), masraf talepleri, FD taslağı/sürümü, audit ve outbox satırları dahildir. Hepsi `off-c123-` tenant'ındadır. Silme ve geçmiş kayıt onarımı **yapılmaz**. Owner bu kalıcı izi kabul etmelidir (Ö-2/Ö-7 ile birlikte).

---

## 8. Artefakt bağı (G-6) — kaynak ↔ hedef

`c-dist-pins.json` 8 dist dosyasının sha256 değerini ve işaret metnini içerir. Değerler canlı R25B dist'ten salt okumayla, 2026-09-21'de ölçüldü:

| dosya | madde | sha256 (ilk 8) |
|---|---|---|
| `common/party-write-tx.js` | C1 #2645 | `9155D538` |
| `modules/case/case.service.js` | C1 #2641/#2645 | `742C0D86` |
| `modules/client/client.service.js` | C1 #2645 | `22AED88D` |
| `modules/office-approval/office-write-role.policy.js` | C2 #2606 | `13119AF4` |
| `…/client-financial-disclosure-approval-eligibility.js` | C2 #2606 | `ABBC6ED8` |
| `…/client-financial-disclosure-approval.service.js` | C2/C3 | `BD006592` |
| `modules/office-approval/office-approval-domain-ownership.js` | C3 #2608/#2612 | `2ABBFEA5` |
| `modules/office-approval/office-approval.service.js` | C2/C3 | `14F78420` |

- **Soy:** kaynak commitler `b9fd97a1`, `e65ff5de`, `42d109fe`, `b335cc4a` ve `13740670`, R25B kaynağı `4443600a`'nın ve R26 adayı `47fcf395`'in atasıdır (`merge-base --is-ancestor` exit 0). Atalık tek başına derleme kanıtı **değildir**.
- **Test edilmiş bağ:** Pinle birebir kopya (fakedist) G-6'yı geçer (prova-3). Tek dosyaya 4 bayt eklenirse **exit 4, yazma 0** (N2').
- **R26 notu:** R26 canlıya çıkarsa bu dosyalardan biri değişebilir. O zaman G-6 durur. Pinler yeni dist'ten yeniden ölçülmeli ve belge revize edilmelidir. Paket, kendi başına eski pinle yanlış PASS üretmez.

---

## 9. Güvenlik kapıları ve durma koşulları

| kapı | kural | davranış |
|---|---|---|
| G-0 | Ortam allowlist'i (disposable: `127.0.0.1:5456/hukuk_office_c123_acc_test`; live: `5432/hukuk_db` + API **yalnız** 8080), canlı jeton, GO ref biçimi, API/DB çapraz kilidi. `C123_ENVIRONMENT` verilmezse `live` (en kısıtlı dal) | exit 4, yazma YOK |
| G-1 | slug `off-c123-`; `off-acc-`, `off-ak-`, `cl-acc-`, `f04-acc-`, `ah-` YASAK | durur |
| G-2 | Yazan her adım tenant'ını doğrular | durur |
| G-3 | slug çakışması | durur |
| G-4 | Sır dosyaya ve çıktıya yazılmaz (`assertNoSecrets`) | durur |
| G-5 | Dış etkili FD uçları çağrılamaz | istek yapılmadan hata |
| G-6 | Dist pin + işaret | exit 4, yazma YOK |

**Çıkış kodları:**
- 0 PASS
- 1 FAIL
- 2 OLCULEMEDI / koşum hatası
- 3 kapanış doğrulanamadı
- 4 G-0/G-6

**Operatör DURUR:**
- exit ≠ 0;
- beklenmeyen şekil;
- tenant dışı diff;
- I-1/I-3 sapması;
- K-1/K-2 başarısız (→ `C123_RUN_ID=<runId> node c-99-close.js` ile yeniden kapat ve owner'a bildir).

Yeniden deneme **yeni GO** ister.

---

## 10. İzole prova sonuçları (disposable, oturuma özel konteyner, 2026-09-22)

Ortam:
- API: R25B **canlı dist'in kendisi** (salt okuma), port 8113;
- Redis: dinleyicisiz 6391;
- `EMAIL_PROVIDER=mock`, FD yazma açık, yayın ve executor kapalı;
- canlı 5432/6379 bağlantısı **0**.

| koşum | runId | sonuç | kanıt |
|---|---|---|---|
| prova-1 | — | PASS 33/33 | (günlük çalışma alanında) |
| prova-2 | `61b38a80` | **PASS 33/33**, 27 satır, kapanış doğrulandı | `evidence/prova-2-61b38a80.{log,result.json}` |
| prova-3 | `fc24ed36` | **PASS 33/33** (pinle birebir kopya dist üzerinden) | `evidence/prova-3-fc24ed36.result.json` |
| N1 G-5 | — | 4/4 yasak uç istek yapılmadan reddedildi; izinli uç engellenmedi | `evidence/neg-n1-n3.log`, `evidence/neg-g5.js` |
| N2' G-6 | — | tek dosyaya 4 bayt eklendi → exit 4, tenant sayısı değişmedi | `evidence/neg-n1-n3.log` |
| N3 G-0 | — | `live` + jeton yok → exit 4 | aynı |
| N3b G-0 | — | disposable + DB adı `hukuk_db` → exit 4 | aynı |
| N4 abort | `fd58a939` | C2-G2 sonrası abort → **OLCULEMEDI** (PASS sayılmadı). Kapanış yine çalıştı; K/I 10/10 | `evidence/neg-n4-abort-fd58a939.{log,result.json}` |

---

## 11. Canlı koşum komutu — YALNIZ ayrı owner GO'su ile

Owner, kanonik checkout'ta, main'deki bu belgenin §12 SHA'larıyla çalıştırır. `C123_DATABASE_URL` owner'ın kendi kabuğunda set edilir ve yazdırılmaz.

```powershell
$env:C123_ENVIRONMENT   = 'live'
$env:C123_CONFIRM_LIVE  = 'YES-LIVE-OFFICE-ACCEPTANCE-C123'
$env:C123_OWNER_GO_REF  = '<owner GO referansı>'   # biçim OWNER-GO-OFFICE-C123-YYYYMMDD-Rnn
$env:C123_API_BASE_URL  = 'http://127.0.0.1:8080/api'
$root = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE23/project/apps/api'
$env:C123_PRISMA_ROOT   = "$root/node_modules/@prisma/client"
$env:C123_BCRYPT_PATH   = "$root/node_modules/bcrypt"
$env:C123_DIST_ROOT     = "$root/dist/apps/api/src"
$env:C123_STATE_FILE    = '<repo DIŞI>/c123-state.json'
$env:C123_RESULT_FILE   = '<repo DIŞI>/c123-result.json'
node project/docs/governance/office-live-acceptance-c123-r01/scripts/c-run.js
```

Ö-2 "FD canlıda koşulmaz" olarak kalırsa canlı koşum **yapılmaz**. Bu pakette C3'ü atlayan bir mod yoktur. Kısmi kapsam isteniyorsa paket revize edilir (R02) ve yeniden prova edilir.

`c-start-api.js` yalnız prova içindir; **canlıda kullanılmaz**.

---

## 12. Araç SHA256

| dosya | sha256 |
|---|---|
| `scripts/c-lib.js` | `527C89E35B11F2D83A384333EB7237FAE9ED105A252E9D8EC4F94F5C31CA69DC` |
| `scripts/c-setup.js` | `179381E2B37A7C22B486BCD5DE177DE487463358529B479B652750AC14CAB3F6` |
| `scripts/c-cases.js` | `C67873D56D69A6FFC69D3A21015333A66CE49727788E592A782971EFB0E99532` |
| `scripts/c-99-close.js` | `1A5B4C3A6B51E40B301B125403D4B10F4D610803F3399184C6917339798EE9BC` |
| `scripts/c-run.js` | `6981B7F7A52E405DA53826DF0D67A5B0E1088AEF09604F035210F6AA24B51FD2` |
| `scripts/c-start-api.js` | `D4012B54E6605EBDC8167B8253D4615D158DD781CCEE960EF214A09F906E9222` |
| `scripts/c-dist-pins.json` | `FE747553041587579E88C67ADBD04488C2D6F4B2A10AD8DB869D5E536DD8C678` |
| `scripts/c-expect-shapes.json` | `8E7FFD9C7DDD2FEC062D9A76DAE7291A1AB8151E2E6085A92370D0D3DBDACF0E` |
| `../office-delivery-r01/scripts/ow-lib.js` (yeniden kullanım, değiştirilmedi) | `612D20D1439DCAFEEB2C86AC867988133F26AE900D95F102571240D3A12F988A` |

Provalar bu SHA'larla koşuldu. Sonuç JSON'larının `tools` alanı da aynı değerleri taşır.

---

## 13. Kalan işlem

1. Owner kararları Ö-1, Ö-2, Ö-3, Ö-7.
2. R26 canlıya çıkarsa §8 pinlerinin yeniden ölçülmesi.
3. Ayrı canlı GO → §11 → sonucun bu belgeye §14 olarak **ayrı PR ile** eklenmesi.

Bunlar yapılmadan C1/C2/C3 **KAPANMAZ**.
