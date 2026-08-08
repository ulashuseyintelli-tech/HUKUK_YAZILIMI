# C2 — C3/KVKK OFİS YÜZEYLERİ (P2)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    CLAUDE-C2        LANE OWNER: CLAUDE
PREDECESSOR:  C1-B01 + C1-B02          SUCCESSOR: C1-B03 (UAT)
PARALEL:      C3 ∥ X1 ∥ X2 ∥ X3-B01    (kesişim YOK — master plan §3-A)
MUTATION:     FRONTEND — şema YOK, migration YOK, backend sözleşmesi DEĞİŞMEZ

ALLOWED PATHS:
  project/apps/web/src/components/client-compliance/**                    (YENİ)
  project/apps/web/src/app/(dashboard)/clients/[clientId]/compliance/**   (YENİ)
  project/apps/web/src/lib/api/client-compliance.ts                       (YENİ)
  <navigasyon/sekme kaydı>            → PAYLAŞIMLI APPEND-ONLY (master plan §3-B)

FORBIDDEN PATHS:
  apps/web/src/components/client-disclosure/**                            (X1)
  apps/web/src/app/(dashboard)/clients/[clientId]/disclosures/**          (X1)
  apps/web/src/components/client-accounting/**                (ÇALIŞAN EKRAN)
  apps/web/src/components/client/**                           (C1-B02 manifest yüzeyi)
  apps/web/src/app/portal/**                                  (C1-B03 doğrular)
  apps/api/**  ·  apps/api/prisma/                            (C3 · X2 · X3)
  project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/

BLOCK ORDER (DEĞİŞTİRİLEMEZ):
  C2-B01 → C2-B02 → C2-B03 → C2-B04
BLOCKS TOTAL: 4   COMPLETED: 4   ACTIVATION DEBT: NONE   PAGE: ENGINEERING_COMPLETE (2026-08-07)
PROGRAM LOCK: CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```

---

## C2-B01 — YÜZEY ENVANTERİ VE SÖZLEŞME OKUMASI  *(ekran yazılmaz)*

Ekran yazmadan önce mevcut C3 backend sözleşmeleri **koddan** çıkarılır:

- KVKK rıza (consent) · aydınlatma teslim · DSAR/Bilgi Talepleri · legal hold ·
  özel nitelikli veri yüzeylerinin **mevcut** route / DTO / hata kodları.
- Her yüzeyin **fail-closed** gerekçe ve hata kodları — B02–B04'te kullanıcıya
  **açık** gösterilecek.
- Efektif capability / POA görünümünün hangi mevcut endpoint'ten türetileceği.

**Kural:** backend sözleşmesi **yeniden yazılmaz**. Eksik endpoint bulunursa
implementation başlatılmaz; master plana disposition için bildirilir
(NEW FINDING RULE — blok sayacı değişmez).

**BLOCK RESULT:** `ANALYSIS_DELIVERED`

---

## C2-B02 — RIZA VE AYDINLATMA TESLİM EKRANLARI

**Kapsam:** KVKK rıza kayıtları · aydınlatma metni teslim kayıtları
(`ClientDisclosureText` / `ClientDisclosureDelivery` sürümlemesi dahil).

**Zorunlu davranışlar**

```text
- Kayıtlar salt-görüntü + MEVCUT yetkili aksiyon; YENİ yetki modeli KURULMAZ.
- Fail-closed reddi kullanıcıya GEREKÇESİYLE gösterilir — sessiz boş ekran YASAK.
- Hangi aydınlatma SÜRÜMÜNÜN hangi tarihte teslim edildiği açıkça görünür.
- Tenant izolasyonu ekran seviyesinde de doğrulanır (D-3).
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## C2-B03 — DSAR / BİLGİ TALEPLERİ VE LEGAL HOLD

**Zorunlu davranışlar**

```text
- Legal hold aktifken kısıtlanan aksiyonlar GÖRÜNÜR şekilde kısıtlı gösterilir;
  tıklanıp sunucudan reddedilen "sahte aktif" buton BIRAKILMAZ.
- DSAR durum makinesi MEVCUT backend durumlarından türetilir; UI kendi durum
  makinesini KURMAZ.
- "Bilgi Talepleri" boş-durum metni C1-B02'de düzeltilmiştir; C2 onu YENİDEN
  DEĞİŞTİRMEZ (aynı dosya çakışması).
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## C2-B04 — ÖZEL NİTELİKLİ VERİ + EFEKTİF CAPABILITY/POA GÖRÜNÜMÜ

**Zorunlu davranışlar**

```text
- Özel nitelikli veri VARSAYILAN GİZLİ; açma eylemi yetkiye ve audit'e bağlıdır.
- CLIENT_SPECIAL_CATEGORY_DATA_KEY hedef ortamda yoksa yüzey FAIL-CLOSED davranır
  ve bunu operatöre AÇIKÇA söyler — sessiz boş içerik YASAK.
- POA görünümü canonical POA kaynağını PROJEKTE EDER; yeniden HESAPLAMAZ.
- Efektif capability görünümü mevcut projeksiyonu gösterir; yeni türetme KURMAZ.
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## ÇÖZÜM DAYATMASI YASAĞI

Yerleşim (müvekkil detayında yeni sekme / ayrı route / sağ panel genişletmesi) ve
liste-detay deseni **peşinen belirlenmemiştir**; mevcut
`(dashboard)/clients/[clientId]` desenine bakılarak kanıta dayanarak seçilir.

## GERÇEK DURMA KOŞULLARI (bu hatta)

**D-2** başka müvekkil verisi sızıntısı · **D-3** tenant izolasyonu ihlali.
Diğer durumlarda master plan §8-A geçerlidir: bağımsız blok yürüyebiliyorsa yürür.
