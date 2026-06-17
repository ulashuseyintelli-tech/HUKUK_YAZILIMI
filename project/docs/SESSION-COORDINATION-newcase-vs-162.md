# Oturum Koordinasyonu — "Yeni Takip Oluştur" çalışması ↔ açık #162 (intake şeması)

> **Amaç:** İki paralel oturum (bu repo'da) çakışmasın.
> **Durum:** Oturum-A (bu) #162 merge'ini bekliyor — branch `feat/client-intake-phase42-models` AÇIK, merge YOK.
> Oturum-B (yeni) "Yeni Takip Oluştur" ön işlerini yapacak.

## 0. Özet karar
Özellik düzeyinde çakışma yok (farklı alanlar). Çakışma yalnız **dev-workflow** düzeyinde olur. Aşağıdaki kurallar uyulursa risk ≈ 0.

## 1. ⭐ EN ÖNEMLİ: ayrı git worktree kullan (fiziksel izolasyon)
Oturum-B bu çalışma dizinini PAYLAŞMASIN. Ayrı worktree aç:
```
git worktree add ../HUKUK_yeni-takip -b feat/yeni-takip main
```
→ Oturum-B `../HUKUK_yeni-takip` içinde çalışır; Oturum-A'nın branch'i/dosyaları/parked state'i etkilenmez.
(Hafıza dersi: paylaşılan worktree = tekrarlayan collision. Bu kural kritik.)

## 2. Aynı dizinde çalışmak ZORUNDAYSA (worktree açılamıyorsa)
- Bu dizin şu an `feat/client-intake-phase42-models` branch'inde, **untracked planlama dökümanları** var (client-intake-phase43/44/45 + bu dosya). **`git clean -fd`, `git stash -u`, `git checkout -- .` ÇALIŞTIRMA** → bu dökümanları siler.
- main'den temiz dallan: `git checkout main && git checkout -b feat/yeni-takip`. (Branch değiştirmek Oturum-A'nın gh-tabanlı watcher'ını bozmaz ama parked state'i değiştirir — tercihen worktree.)
- `feat/client-intake-phase42-models` branch'ine veya **PR #162'ye DOKUNMA** (force-push/commit/rebase yok).

## 3. schema.prisma (gerçek conflict riski)
- Mümkünse Oturum-B bu PR'da schema.prisma'ya dokunmasın (UI/ön iş önce).
- Dokunması gerekirse: **yalnız yeni SCALAR alan ekle**, ve şu **ilişki bloklarına DOKUNMA** (oraya #162 intake relation'ları ekledi → merge conflict olur):
  - `Client` modeli ilişki bloğu (~satır 455-465; clientStatements/clientIntake* civarı)
  - `Case` modeli ilişki bloğu (~satır 1034-1045; expenseRequests/caseBalance/clientIntake* civarı)
  - `Debtor` modeli ilişki bloğu (~satır 704-716)
- Yeni alanı modelin başka (alan) bölümüne ekle, relation listesinin ortasına değil.

## 4. Migration sırası
- Yeni migration timestamp'i **mevcut en yüksekten BÜYÜK** olsun: en yüksek `20260617070000_add_client_intake_models`. Yani `20260617080000_...` veya üstü.
- Var olan migration'ları **düzenleme/yeniden adlandırma**.

## 5. Paylaşılan dev DB (hukuk_db) — DİKKAT
- **`prisma migrate reset` / DROP / db push --force-reset ÇALIŞTIRMA** → Oturum-A'nın dev-applied migration'larını (finans/intel/intake) ve test verisini siler.
- Additive `migrate dev`/`deploy` sorun değil. Şüphedeysen Oturum-A'ya sor.

## 6. app.module / diğer
- #162 app.module'e DOKUNMADI (şema-only). Oturum-B yeni modül kaydederse app.module'de conflict olmaz (farklı satırlar). Yine de aynı dizinde paralel düzenleme riskli — worktree çöz.

## 7. Çakışma çıkarsa
Oturum-A (bu) uyaracak. Şüpheli durumda Oturum-B durup sorsun:
- "schema.prisma ilişki bloğuna mı dokunuyorum?" → dur, sor.
- "migrate reset gerekiyor mu?" → ASLA, sor.
- "feat/client-intake-phase42-models'e mi commit atıyorum?" → hayır, dur.

> **TL;DR:** Oturum-B ayrı worktree'de main'den dallanıp UI/ön işe başlasın; schema.prisma ilişki bloklarına ve dev DB reset'e dokunmasın; #162 branch/PR'a dokunmasın. Bu kurallarla çakışma yok.
