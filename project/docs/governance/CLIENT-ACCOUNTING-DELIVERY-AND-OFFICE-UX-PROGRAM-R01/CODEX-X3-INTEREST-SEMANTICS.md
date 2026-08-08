# X3 — FAİZ SEMANTİĞİ (P7)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    CODEX-X3         LANE OWNER: CODEX
PREDECESSOR:  C1-B01 (B01 analiz için)  ·  C3 (B02+ uygulama için — XL-C)
SUCCESSOR:    C1-B03 (UAT)
MUTATION:     B01 docs-only · B02+ ŞEMA + BACKEND
MIGRATION OWNER: X3 — programda TEK aktif migration görevi

ALLOWED PATHS:
  B01: project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/
  B02+: project/apps/api/prisma/                              (yalnız X3 migration paketi)
        project/apps/api/src/modules/client-statement/**      (C3 MERGE EDİLDİKTEN SONRA)

FORBIDDEN PATHS:
  apps/api/src/modules/client-financial-disclosure/**         (X2)
  apps/web/**                                                 (C1 · C2 · X1)
  project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/

BLOCK ORDER (DEĞİŞTİRİLEMEZ):
  X3-B01 → X3-B02 → X3-B03
BLOCKS TOTAL: 3   COMPLETED: 0
ACTIVATION DEBT: HENÜZ DOĞMADI — X3-B02 üretecek (migration production APPLY)
PROGRAM LOCK: CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```

---

## CROSS-LANE BAĞ — XL-C (neden X3 uygulaması C3'ün ardılı)

X3'ün ürün etkisi `client-statement` servisine ve ekstre PDF renderer'ına satır tipi
eklemektir — **C3 ile aynı dosyalar**. Paralel açılırsa gerçek same-file competing
writer doğar.

```text
X3-B01  docs-only  → C3 ile PARALEL yürür (kesişim yok)
X3-B02  şema       → C3'ten bağımsız (prisma/), fakat B03'ün öncülü
X3-B03  entegrasyon→ C3 MERGE EDİLMEDEN BAŞLAMAZ → WAITING_FOR_PREDECESSOR
```

---

## OWNER POLİTİKASI (bu hattın çekirdeği)

```text
POL-2  Tahakkuk etmiş fakat TAHSİL EDİLMEMİŞ faiz:
       INFORMATIONAL / NON-CASH. Açılış ve kapanış bakiyesini DEĞİŞTİRMEZ.

POL-3  TAHSİL EDİLMİŞ faiz:
       Yalnız gerçek POSTED Collection/Disposition zincirinden sonra ve gerçek
       allocation oranında müvekkil bakiyesine yansır.
```

Bu iki kural birlikte **çift-sayımı yapısal olarak imkânsızlaştırır**. Şemada emsali
zaten var: `COLLECTION_OFFSET_ADVANCE` yorumu — *"BİLGİ; bakiye etkisi
BalanceLedger'dan, çift-sayım yok"*. X3 aynı deseni faize uygular.

---

## X3-B01 — FAİZ SEMANTİĞİ ANALİZİ VE MEVCUT AUTHORITY TESPİTİ  *(docs-only)*

**Tespit edilecekler**

```text
1. Başka modülde MEVCUT bir faiz authority'si var mı?
   Varsa CLIENT YENİDEN HESAPLAMAZ — yalnız canonical sonucu PROJEKTE EDER.
   Bu tespit exact dosya/fonksiyon referansıyla yapılır.
2. Faiz hangi olaydan doğuyor (temerrüt / avans / gecikme) — repository kanıtıyla.
3. Tahsil edilmiş faizin POSTED zincirdeki taşıyıcısı hangi kayıt?
4. Mevcut enum'lardaki boşluğun teyidi:
   ClientStatementLineType (17 üye) ve CollectionDispositionLineType (7 üye) —
   ikisinde de faiz YOK (baseline c867c18a).
```

**Kural:** faiz hesaplama politikası **UYDURULMAZ**. Kanonik kaynak bulunamazsa
exact teknik boşluk raporlanır ve blok `WAITING_FOR_OWNER_DECISION` olur —
diğer hatlar durmaz (master plan §8-A).

**BLOCK RESULT:** `ANALYSIS_DELIVERED` veya `WAITING_FOR_OWNER_DECISION`

---

## X3-B02 — EN KÜÇÜK ŞEMA/ENUM DEĞİŞİKLİĞİ

```text
- İki kavram AYRI temsil edilir:
    INFORMATIONAL ACCRUED INTEREST   (tahakkuk — bilgi satırı)
    COLLECTED CLIENT INTEREST        (tahsil edilmiş — nakit etkili)
- Şema etkisi B01'in fresh analizinden sonra EN KÜÇÜK migration ile SINIRLANIR.
- Tahakkuk satırı debit=0 / credit=0 olarak modellenir; runningBalance'ı OYNATMAZ.
- Tahsil edilmiş faiz yalnız POSTED finansal kaynağa BAĞLI olur (POL-3).
- Migration üretilir; production APPLY YAPILMAZ → ACTIVATION DEBT olarak kaydedilir.
  APPLY yalnız taze backup/restore kapısı ve owner'ın mevcut production mutation
  disipliniyle yapılır (D-7).
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE` + `ACTIVATION_PENDING`

---

## X3-B03 — EKSTRE ENTEGRASYONU  ⟵ XL-C

**ÖNCÜL:** C3 MERGED (aynı dosya writer'ı devralınır).

```text
- Faiz satırları ekstre okumasına ve PDF render'ına eklenir.
- Tahakkuk satırının bakiyeyi OYNATMADIĞI görsel olarak da anlaşılır olur
  (POL-2'nin kullanıcıya görünen karşılığı).
- C3'ün kurduğu render sözleşmesi ve client-safe referans kullanımı KORUNUR;
  X3 kendi kopyasını ÜRETMEZ.

KİLİTLENECEK REGRESYONLAR:
  (1) tahakkuk satırı açılış/kapanış bakiyesini DEĞİŞTİRMEZ
  (2) tahsil edilmiş faiz POSTED kaynak olmadan bakiyeye GİREMEZ
  (3) aynı faiz iki kez sayılamaz (çift-sayım kilidi)
  (4) tenant izolasyonu korunur
```

**BLOCK RESULT:** `ENGINEERING_COMPLETE`

---

## ÇÖZÜM DAYATMASI YASAĞI

Faizin taşıyıcısı (yeni `ClientStatementLineType` üyeleri / mevcut tipin metadata ile
ayrıştırılması / ayrı kaynak tablo) **peşinen belirlenmemiştir**; B01'in bulgusuna
göre, en küçük şema etkisi ilkesiyle kanıta dayanarak seçilir.

## GERÇEK DURMA KOŞULLARI (bu hatta)

**D-1** owner politikasıyla gerçek çelişki · **D-7** production migration için
backup/restore kapısının sağlanamaması.
