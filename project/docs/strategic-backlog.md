# Strategic Backlog

> **Bu dosya = gelecekteki BÜYÜK işler + bekleme nedenleri (tek giriş noktası).**
> Üç katman ayrı tutulur:
> - **Ledger** (`reliability-ledger.md`) → geçmiş audit bulguları / teknik borç (RFA-*).
> - **Design Review** (`party-registry-design.md`, `party-registry-design-review.md`, `debtor-identity-resolution-ir0.md`) → "neden böyle karar verdik".
> - **Strategic Backlog** (BU dosya) → "ne yapacaktık, neden bekliyor, ön-şartı ne". Büyük fikir/karar gelince **buraya** yaz (sabit-not/chat/whatsapp değil).
>
> **Durum:** HOLD = ön-şart bekliyor (başlatma) · READY = başlatılabilir (öncelik düşük olabilir) · DONE = kapandı (ledger'a/PR'a referans).
> Kapsam: kod YOK; bu yalnız izleyici. Bir madde başlayınca kendi plan→onay→PR akışına girer.

## Backlog

| ID | Başlık | Durum | Neden bekliyor / Ön-şart | Ref |
|----|--------|-------|--------------------------|-----|
| SB-001 | **Party Registry** (5 dış-taraf kimliği konsolidasyon + CaseParty + cross-case istihbarat) | HOLD | (a) gerçek veri girişi başlasın (gerçek müvekkil/borçlu/3.kişi/mirasçı hacmi + duplicate desenleri), (b) borçlu istihbarat yüzeyi stabilize + characterization test, (c) SB-005 dahil açık ürün/hukuk kararları, (d) Av. sign-off | `party-registry-design.md` + `-review.md` (#151) |
| SB-002 | **IR-0 → PartyMatch** (kimlik çözümleme motoru) | HOLD | Party Faz 5 İÇİNDE inşa edilecek; standalone YAPILMAYACAK (DebtorIdentityCandidate ⊂ PartyMatchCandidate) | `debtor-identity-resolution-ir0.md` (#140) |
| SB-003 | **Debtor soft-delete** (RFA-009) | HOLD | Party lifecycle ile çözülecek (Faz 1/3: Party.isActive + CaseParty role-detach); standalone = iki kez iş | ledger RFA-009 |
| SB-004 | **Asset → PartyAsset + CaseAssetAttachment** (DEAD-2) | HOLD | Party Faz 2; PartyAsset=kişinin bilinen varlığı (istihbarat) vs CaseAssetAttachment=bu dosyada haciz (işlem) | ledger DEAD-2 |
| SB-005 | **EstateHeir modeli** (mirasçı) | HOLD | Hukuki karar: `PartyRelation(HEIR_OF)` mı alt-Party mı? Karar verilince Party Faz 2'de | review §11 |
| SB-006 | **PublicInstitution kapsamı** (DETSİS) | HOLD | Ürün kararı: tam Party mı hafif referans mı? | review §11 |
| SB-007 | **Cross-case istihbarat besleme** ("bu borçlu N dosyada; son adres/telefon/haciz/temas") | HOLD | Party §5; alt-ağaçlar (Faz 2) + okuyucular (Faz 4) taşınınca | `party-registry-design.md` §5 |
| SB-008 | **Saha istihbaratı idempotency** (RFA-015 DebtorIntelligence çift-submit) | HOLD* | Party-family (DebtorIntelligence→PartyIntelligence Faz 2). *İstisna: gerçek saha-istihbarat girişi Party'den ÖNCE başlarsa o zaman küçük guard olarak yapılır | ledger RFA-015 |
| SB-009 | **Junk/test verisi cleanup** (9 junk adres `street="."` + Ayşe Yılmaz test borçluları + diğer QA kayıtları) | READY | Düşük öncelik; Party'den bağımsız; dry-run'lı op | audit junk notu |
| SB-010 | **Bağımsız küçük temizlikler** (RFA-011 legacy debtor bypass · RFA-012 _count · RFA-014 GroupDefinition reactivate) | READY | Party'den bağımsız; sıradaki geliştirme döngüsünde küçük PR'lar; detay ledger'da | ledger RFA-011/012/014 |

## Çakışma kuralları (kayıt için)
- **Party ailesine (SB-001..008) Party Faz 0 öncesi DOKUNMA** → erken mimari uygulama riski (duplicate bug'dan pahalı).
- **Bağımsız kovaya (SB-009/010) istendiğinde dokunulabilir** (Party ile çakışmaz).
- En büyük güncel risk artık duplicate DEĞİL → **erken Party uygulaması**.

## Yeni madde ekleme
Büyük fikir/karar geldiğinde: yeni SB-XXX satırı + Durum + Neden bekliyor/Ön-şart + Ref. Başlayınca Durum güncelle; bittiğinde DONE + PR referansı (detay ledger/PR'da).

_Oluşturuldu: 2026-06-17 — Reliability Audit + Party design review sonrası, dağılmış fikirleri tek yere toplamak için._
