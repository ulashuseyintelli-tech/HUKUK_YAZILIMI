# Reliability — Postmortem (kök sebep + dersler)

> **Bu dosya = "ne yanlış gitti, neden, ne öğrendik" (dördüncü katman).**
> Diğer üçü: Ledger (ne bozuktu/düzelttik) · Design Review (neden böyle karar verdik) ·
> Strategic Backlog (ne yapacağız/neden bekliyor). Bu postmortem **yeni bug aramaz**; kök nedeni
> ve kalıcı süreç derslerini belgeler. Kod YOK.
> **Tarih:** 2026-06-17.

## 0. Tetikleyen olay ("iş 3")
Kullanıcı gerçek UI'da test etti:
```
Müvekkil duplicate uyarısı  → çalışıyor
Avukat   → çalışmıyor (iki "Ulaş Hüseyin" açılabildi)
Personel → çalışmıyor (iki "Fatih" açılabildi)
Borçlu   → çalışmıyor (iki "Ayşe Yılmaz" açılabildi)
```
Talep: "Yeni kod yazma; önce bu üç somut duplicate'in NEDEN oluştuğunu KANITLA." Bu, tek-tek bug
değil **talimat uyumsuzluğu + eksik regresyon testi** problemiydi.

## 1. İki faz (kronoloji — sıkıştırmadan)
- **Faz A — Duplicate-handling KONTRATI** (PR-U serisi #131-139): "iki Ulaş/Fatih/Ayşe" + update
  yan-kapısı → create/update review dialog'ları (Müvekkil/Avukat/Borçlu/Personel). Son halka:
  **PR-U5 #139** (borçlu LİSTE-edit modalında override yoktu; create modalında vardı).
- **Faz B — RELIABILITY FORENSIC AUDIT** (#141-150): Faz A'yı tetikleyen duplicate bug DEĞİL,
  kullanıcının **meta-içgörüsü** başlattı: "Claude fix etti mi/test etti mi? Sadece deneme yetmez,
  sistematik tara, körlemesine güvenme." → ledger + A/B/C güven + 3 turlu forensic.

## 2. İki kök-sebep (failure mode)
- **FM-1 — Eksik-uygulama (talimat bir yola uygulandı, hepsine değil):**
  - PR-U5: borçlu **create** modalı override'lı, **liste-edit** modalı override'sız (aynı talimat, bir yol atlandı).
  - RFA-016: ana `POST /debtors` guard'lı; **case.create wizard inline** (`tx.X.create`) guard'sız.
  - RFA-017: `ClientService.create` guard'lı; **Excel import** düz `prisma.client.create`.
  - Genel ders: **"guard bir endpoint'te var" ≠ "guard tüm yollarda var."** Dış kapılar (wizard/import/legacy/discovery/cron) bypass eder.
- **FM-2 — Fazla-raporlama / bayat bilgi (eşit önemli):**
  - Tur-1: "StaffMember create guard yok" → **YANLIŞ** (guard PR-S/U3 ile zaten merge'liydi). En öncelikli öneri yanlış-pozitifti.
  - "Debtor guard var" → hangi alanlarla (yalnız TCKN/VKN exact; isim-only fuzzy AYRI) test edilmeden varsayıldı.
  - Genel ders: **"koddan bakıldı ≠ çalışıyor" + "bayat bilgi → yanlış öncelik."**

## 3. 6 sorunun cevabı
1. **Bu talimattan hangi RFA işleri doğdu?** RFA-016/017/005/006/008/013/007/010 (8 fix) + DEAD-1 (addressHash canlandı) + DEAD-2 (Asset, Party'ye ertelendi).
2. **Hangi PR'lar kapattı?** PR-U5 #139 (orijinal borçlu-update dialog boşluğu) + RFA fixes #142-150 + ledger #141 + Party review #151 + strategic backlog #152/#153.
3. **Hangi başlangıç varsayımları yanlış çıktı?**
   - "Debtor duplicate guard var → yeterli" (guard yalnız exact kimlik; isim-only ayrı review).
   - "Tek create endpoint'inde guard yeter" (wizard/import/legacy/discovery bypass).
   - "StaffMember guard yok" (Tur-1 yanlış-pozitif; zaten vardı).
   - (Faz A'dan) "özdeş hunk çakışmaz" (lib/api.ts merge conflict çıktı).
4. **Hangi disiplinler kalıcı oldu?**
   - **Süreç:** plan → ulas onayı → branch → **additive** fix (guard tek-kaynak) → unit + **canlı DB-count/e2e** → tsc 93 baseline → PR → CI yeşil → squash-merge → **ledger RESOLVED**.
   - **Güven sınıfı (A/B/C):** A=kod+canlı · B=kod okundu · C=agent raporu spot-check yok.
   - **Kanıt kuralı:** "koddan bakıldı ≠ çalışıyor; canlı tekrar = doğrulama."
   - **Bayat-bilgi savunması:** ledger RESOLVED bölümü + her HIGH bulguyu kendin spot-check.
   - **Tek-kaynak guard:** mantığı 6 kez replike etme (ortak util/servis).
5. **Hâlâ açık risk var mı?** SB-001..012 (Party ailesi HOLD; SB-009/010 READY; SB-011 calc/faiz/TBK100 audit HOLD; SB-012 soft-delete tam sweep READY). **En büyük güncel risk artık duplicate DEĞİL → erken Party (mimari) uygulaması.**
6. **Çıkarılan kalıcı süreç kuralı (TEK CÜMLE):**
   > **"Fix iddiası canlı doğrulama olmadan kabul edilmez; guard bir endpoint'te değil TÜM yazma yollarında olmalı; bayat bilgi spot-check'siz kullanılmaz; her bulgu/karar/iş tek kayıt defterine (ledger/backlog/review) yazılır."**

## 4. Niceliksel özet (kullanıcının "işler birbirine mi girdi?" kaygısına)
- **Fix-without-test vakası bulundu mu?** Evet — PR-U5 tam buydu (create yol fix'li, liste-edit yol atlanmış). Audit bunu **buldu ve kapattı.**
- **Yarım/karışık iş kaldı mı?** Hayır. 12+ PR, hepsi canlı-doğrulamalı, main temiz, tsc baseline korundu.
- **Tek yerden kontrol kuruldu mu?** Evet: 4 katman (ledger/backlog/review/postmortem).

## 5. Sonuç
"iş 3" bir bug raporuydu; ama gerçek kazanım **kod değil süreç değişimiydi.** Bundan sonra
"Staff duplicate olabilir mi?" sorusunun cevabı "bakalım" değil "ledger RFA-016 RESOLVED" oldu.
Bu postmortem, eski alışkanlığa (test-siz fix iddiası, bayat-bilgi, tek-endpoint guard) geri
dönülmesini önlemek için saklanır.

---
İlgili: `reliability-ledger.md` · `strategic-backlog.md` · `party-registry-design-review.md` ·
`debtor-identity-resolution-ir0.md`.
