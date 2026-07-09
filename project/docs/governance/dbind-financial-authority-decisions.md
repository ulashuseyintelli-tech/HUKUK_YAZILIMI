# DBIND — Finansal Otorite ve Domain Karar Kaydı

> **Statü:** ONAYLANDI (2026-07-04, owner Ulaş). Bağlayıcı.
> **Kapsam:** Bu doküman DBIND-1 / DBIND-P1 / DBIND-P2 / DBIND-P2-FE analiz hattında verilen kararları kanonik hale getirir. Yeni feature başlatmaz; yalnız verilmiş kararları kayda geçirir.
> **Bağlantılı:** `docs/finance/tm3-collection-disposition-boundary.md` (§8, çoklu alacaklı/CaseCreditorCluster ilk tanım), `docs/adr/ADR-009-UNIVERSAL-OFFICE-APPROVAL.md` (self-approval/onay çerçevesi).

Bu kararlar sonraki payout, creditor cluster, debtor/estate ve collection disposition işlerinde bağlayıcı referanstır. Kesinleşmiş bir karar tekrar tartışılmaz; yeni görev bir kararı bozuyorsa ajan durur ve owner kararı ister.

---

## 1. Financial Authority

- Finansal otorite `CaseClient` / creditor set'tir.
- `Case.clientId` financial authority DEĞİLDİR; legacy/display/intake alanı olarak kalabilir.
- Yeni finansal akışlarda `Case.clientId` kaynak otorite gibi KULLANILMAZ.

## 2. Creditor Cluster

- Çoklu alacaklı dosyaları tekil müvekkil hesabına indirgenemez.
- Aynı alacaklı kişiler farklı dosyalarda yer alsa bile, pay/entitlement/hak oranı farklıysa hukuken FARKLI finansal kümedir.
- V1'de creditor cluster **computed/projection** olarak ele alınır. Stored cluster entity veya shareRatio/entitlement modeli **v2 hukuki tasarım konusudur** — v1 kapsamında AÇILMAZ.
- V1 final settlement ifadesi "creditor cluster'a teslim edildi" şeklinde olmalıdır — tekil müvekkile ödendi ifadesi kullanılmaz.
- Cluster içi paylaştırma / iç dağıtım / alacaklılar arası paylaşım AYRI domain'dir; DBIND v1 kapsamında kesinleştirilmez.
- Cluster dışındaki bireysel müvekkil borçları, creditor cluster tahsilatından OTOMATİK MAHSUP EDİLEMEZ.

## 3. Collection / Disposition

- Tahsilat create v1'de approval'a ALINMAZ.
- Tahsilat create anında kesin kayıt olarak kalır.
- Asıl onay noktası collection disposition / tahsilat dağıtımı aşamasıdır.
- Kanonik akış:
  ```
  Collection create → confirmed collection → disposition recommendation → approval → post
  ```
- Kesin dağıtım etkisi YALNIZ disposition approval/posting aşamasında doğar.

## 4. Distribution Recommendation Loop

- Distribution recommendation loop ZATEN VARDIR (yeni iş değildir).
- Bu öneri döngüsü **single-case-client scoped** çalışır.
- Creditor-cluster dosyalarında otomatik öneri/auto-apply YAPILMAZ.
- Final posting authority yine `CollectionDisposition recommend → approval → post` akışındadır.
- Müvekkil muhasebesi / dosya finansal durumu tahsilat dağıtımında ÖNERİ üretebilir; tek başına kesin finansal kayıt YARATAMAZ.

## 5. Payout / Money-Out

- Money-out/payout işlemlerinde self-approval yasağı NORMAL kullanıcılar için geçerlidir.
- Super admin, kurucu avukat, ortak veya açıkça yetkilendirilmiş üst seviye avukat rolleri kendi açtıkları payout taleplerini onaylayabilir (istisna).
- Bu istisna dışındaki kullanıcılar kendi money-out taleplerini tek başına KESİNLEŞTİREMEZ.
- Staff/operasyonel kullanıcılar money-out final approver OLAMAZ.
- Runtime uygulama sınırı (VER-36, 2026-07-10): Bu istisna yalnız `CLIENT_PAYOUT_POST` için `approve()` kararında uygulanır; `reject`, `requestRevision`, `approveWithChanges` ve payout dışı OfficeApproval action'ları generic self-approval yasağı altında kalır.

## 6. Estate / Heir Notification

- Estate/miras bırakan için ayrı EstateHeir bazlı takip/finansal debtor domain'i GEREKMEZ.
- Tereke/miras bırakan TEK MUHATAP gibi düz işlenir.
- Mirasçılara tebligat, dosyada farklı borçlular varmış gibi AYRI AYRI çıkarılır.
- Mirasçılar ayrı borç/finansal kimlik değil, **tebligat muhatabı/recipient** bağlamında ele alınmalıdır.

---

## Kapsam Dışı (v1'de kesinleştirilmeyen)

- Stored `CaseCreditorCluster` entity ve shareRatio/entitlement hesap motoru — v2 hukuki tasarım konusu.
- Cluster içi paylaştırma/iç dağıtım — ayrı domain.
- Şema/migration önerisi — bu doküman kapsamında DEĞİL.
- Yeni implementation task — bu doküman yeni iş açmaz.
