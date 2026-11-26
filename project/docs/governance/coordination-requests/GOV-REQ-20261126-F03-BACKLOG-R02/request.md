# GOV-REQ-20261126-F03-BACKLOG-R02

Owner-authorized F03 preparation completion. Fresh main binding at 402037788dece023579ad33c7df2ae3c967715e6; earlier unpublished request GOV-REQ-20261126-F03-BACKLOG-R01 remains unchanged as provenance. Original owner decisions, the fixed migration exception, F03-before-R8 order and maintenance-only rollback are bounded by the direct 2026-11-26 owner instruction. No live authority is granted.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261126-F03-BACKLOG-R02",
  "requestFingerprint": "9d56121b253b1d2e91fd114d979bfaa2fd0e0be3a7830801bf93e820751f5618",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-26T20:36:07Z",
  "baseMainSha": "402037788dece023579ad33c7df2ae3c967715e6",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "402037788dece023579ad33c7df2ae3c967715e6"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "402037788dece023579ad33c7df2ae3c967715e6"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/product-backlog.md",
    "recordIdentity": "# Product Backlog\n\nBacklog pasif fikir listesi değildir. Her backlog maddesi gelecekte uygulanabilecek potansiyel bir ürün kararıdır.\n\nYeni fikir akışı:\n\n```tex",
    "anchor": "r\nworktree'de (`OFF_R23_REC`, main'de degil, izlenmeyen `release23-candidate-r01/`) aday kaydi hazirlandigi goruldu;\nkaynak olarak KULLANILMADI ve dokunulmadi.\n",
    "expectedOldValue": "r\nworktree'de (`OFF_R23_REC`, main'de degil, izlenmeyen `release23-candidate-r01/`) aday kaydi hazirlandigi goruldu;\nkaynak olarak KULLANILMADI ve dokunulmadi.\n",
    "newValue": "\n\n## F03 — dar devir kaydi 2026-11-26\r\n\r\nID: F03-GOREV-YASAM-DONGUSU-YAYIN-HAZIRLIK\r\nStatus: GELISTIRME TAM / KESIN ADAY YEREL DOGRULANDI / YAYIN VE KULLANICI KABULU BEKLIYOR.\r\nCandidate: 1794a0f736182903472b1b3967fd78f38974bce2; tree 1f899cc673db4ed4176d6c2c61f0225bf648388b; base 31c8f763c18905c37a12304d000cae9c2560237a.\r\nScope: #3344–#3351; D1/B2/A1/A2/C/D2 + ret ve suzgec duzeltmeleri. Adayin gecerli 26/26 yerel CI adimi yeniden kosulmadi; main CI aday kaniti sayilmadi.\r\nOwner 2026-11-26: exact aday icin contract 3.3/4 dar istisnasi ONAYLI; once F03 sonra R8; F03'suz runtime tum gorev yazicilari ve otomatik yeniden baslaticilar kapali teknik kanitli bakimda kalir. Canonical kayit zinciri ve yerel runner hazirligi bu gorevde yetkili; canli authority NONE. Yayin icin taze P-0, yedek/restore/zincir provasi ve P-3 halen BEKLIYOR.\r\nOwner kaynaklari: F03-OWNER-DECISIONS-20261125-R01 kaydi ve owner-kaynak.json raw UUID/hash satirlari.\r\n\r\n# F03 açık maddeler — korunmuş kapsam ve sorumluluk\r\n\r\nKaynak: `CODEX-TALEP-TASLAGI-F03.md` §3–4 ve `F03-SONUC-RAPORU-R01.md`.\r\nAşağıdaki sorumlular mevcut devir kaydındaki sahiplerdir; “owner seçmedi”\r\nsatırları atama yapılmış sayılmaz. Hiçbir madde READY/roadmap'e taşınmadı.\r\n\r\n| Kimlik | Açık kalan / kullanıcı etkisi | Sorumlu veya karar sahibi | Bitme koşulu ve yayın ilişkisi |\r\n|---|---|---|---|\r\n| F03-AÇIK-1 | Sistem üreticilerinin görev geçmişi yok; masraf ödemesiyle kapanma dahil bu yazımlar birleşik geçmişte görünmez. | Kapsam kararı owner; masraf parçası Codex/M2. | K10 ile kapsam dışı. Kapsam genişlemesi kararı + üretici bazında atomik iz kanıtı olmadan kapanmaz. F03 yayınına ürün engeli değil. |\r\n| F03-AÇIK-2 | “Masraf Takibi” görevinin üretici izi yok; kullanıcı görevi sanılıp kontrol gerekli işaretlenebilir. | Codex/M1. | Üretici izi ve uygunluk davranışı için ayrı dar yetkili iş. Yeni kolon zorunlu kabul edilmez. Mevcut pakette isteğe bağlı. |\r\n| F03-AÇIK-3 | Kontrolde bekleme için süre aşımı/bildirim alıcısı açık; rapor süresi kontrol beklemesini içerir. | Mevcut devirde F05; yürütücü seçimi ayrı. | F05 sözleşmesinde ölçüt ve alıcı kararı; bu görev F05 başlatmaz. F03 engeli değil. |\r\n| F03-AÇIK-4 | S-06 kabul metni ayarın yalnız saklandığını ve ayar ekranı bulunmadığını yansıtmalı; kullanıcı ayarın hesabı değiştirdiğini sanmamalı. | Codex, kabul metni kaydı. | Doğru S-06 kaynağında dar metin hizalaması. Kayıt içeriği bu pakette hazır; eski belgenin yeri doğrulanmadan değişmedi. F03 engeli değil. |\r\n| F03-AÇIK-5 | `m0-phase7-off.perf.spec.ts` dalgalanması yayın hattında yanlış kırmızı üretebilir; D1 ilk main koşusu düşmüş, tekrar geçmişti. | Codex, CI/test şeridi. | Ayrı kök neden ve kararlı ölçüm. Bu görevde test/CI ayarı değiştirilmedi. Adayın geçerli kanıtını iptal etmez. |\r\n| F03-AÇIK-6 | Dosyadan görev oluştururken atanan seçimi ve dosya iş listesinde iptal eylemi yok. | Owner henüz ürün kapsamı/yürütücü seçmedi. | Ayrı ürün kararı + uygulama/kabul. F03-R02 bunları istemedi; açık korunur. |\r\n| F03-AÇIK-7 | Kartsız ikinci hesapta kişi eşitliği kurulamaz; aynı kişiye ait iki hesabı ayırma güvencesi bu durumda kanıtlanmış değildir. | F02 kimlik şeridi; karar owner. | F02 K-A1 sınırının kendi kaydında kapatılması. F03 kişi bağımsızlığı yalnız kimliği ilişkilendirilmiş hesaplarda doğrulandı; genel güvenceye genişletilemez. |\r\n| F03-AÇIK-8 | Eskalasyon motorunun gerçek bayrak değeri ekranda görünmüyor; kullanıcı etkinliği göremiyor. | Owner henüz kapsam/yürütücü seçmedi. | Ayrı ürün kararı. F03 engeli değil; canlı bayrak bu görevde okunmadı. |\r\n| F03-AÇIK-9 | Tam tip denetimi borcu: main web 7/API 555; yayın hattı web 3/API 550. Tam tsc hatasız değildir. | Codex, CI/test şeridi. | Ayrı tip borcu işi. Aday üretim tsc 0 ve tabana göre yeni hata 0; tam tsc mevcut CI kapısı değildir. |\r\n| F03-AÇIK-10 | F03'süz sürüm kontrol zorunluluğunu ve geçmiş yazımını uygulamaz; onaysız tamamlama ve geri üretilemez geçmiş boşluğu doğabilir. | Owner bakım işletimini seçti; teknik doğrulama F03 yayın yürütücüsünde. Yeni ürün/DB engeli geliştirme kapsam dışı. | `ICRA-PAKETI.md` bakım/yazma engelleme ve D0/T1/T2/T3 koşulları. Bildirim tek başına yeterli değildir. **Yayın güvenliği kapısıdır; koşullar sağlanmadan yayın/geri dönüş yapılamaz.** |\r\n\r\n## Masraf şeridinde kayda alınan iki dar iş\r\n\r\n| İş | Kapsam ve korunacak davranış | Yetki / durum |\r\n|---|---|---|\r\n| M1 / F03-MASRAF-URETICI-IZI | `expense-notification.service.ts`: oluşturma anında mevcut `dedupeKey` deseniyle üretici izi; öneri `EXPENSE_FOLLOWUP:<talepId>`. Manuel kullanıcı görevi sanılmasını önleme; mevcut görevleri backfill etme yetkisi yok. F03-AÇIK-2 bağlantısı. | BACKLOG / NOT_STARTED. Bu görev yalnız kayıt hazırladı. Tasarım önerisi owner kararı değildir. |\r\n| M2 / F03-MASRAF-KAPANIS-GECMISI | `expense-request.service.ts`: PAID→AUTO_SYSTEM kapanışını aynı transaction içinde `systemTaskHistoryRow(...)` ile kaydetme önerisi; `taskId`, 409 ve ödeme atomikliği korunmalı, `expense-payment-atomic` kanıtı gerekir. F03-AÇIK-1 bağlantısı. | BACKLOG / OWNER_SCOPE_DECISION_REQUIRED. K10 bu üreticiyi kapsam dışında bıraktı; yeni karar olmadan kod yazılmaz. |\r\n\r\nS-06 için hazırlanmış dar hizalama: “İİK-78 büro ayarı yalnız saklanır;\r\ndosya pasiflik hesabında kullanılmaz. Bu ayarı değiştirecek kullanıcı ekranı\r\nbulunmuyor.” Bu, mevcut uygulama ve K6 kararının kaydıdır; yeni hukuki süre yorumu değildir.\n",
    "evidenceSha": "402037788dece023579ad33c7df2ae3c967715e6",
    "expectedResultSha256": "766bb2a1604fddd8f93dbc30ca3c8085a9fb320fafbb5ae48b06dc3cd0d678fa"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/product-backlog.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
