# OD-07 narrow reopening — supplied owner decision transcription (claim-item debtor liability selection)

Request-only: append exactly one supplied owner row through V1 request/execution/result. Prepared by the Claude module session on the owner’s direct instruction of 2026-11-15; the owner is the requester. Fresh single-row release or direct owner assignment is required before Decision Log execution; this request does not interfere with any other writer turn. No schema, migration, runtime, flag, live operation or owner WIP mutation is produced by this request.

<!-- GOV_COORD_REQUEST_JSON_BEGIN -->
```json
{
  "schemaVersion": 1,
  "requestId": "GOV-REQ-20261115-DEBTOR-OD07-CLAIM-LIABILITY-SA01",
  "requestFingerprint": "5457008f6f50c982b0f872f8199c64d4a9088cafcf4d9dca5bd168f9fd964691",
  "requestedBy": "OWNER",
  "createdAt": "2026-11-14T21:41:13Z",
  "baseMainSha": "a05763af4187aa41ca2c50c8295713bf727c9650",
  "semanticAuthorityRef": {
    "kind": "SEMANTIC_AUTHORITY",
    "path": "project/docs/governance/decision-log.md",
    "recordId": "GOV-COORD-V2-T1-RATIFICATION",
    "evidenceSha": "a05763af4187aa41ca2c50c8295713bf727c9650"
  },
  "executionGrantRef": {
    "kind": "EXECUTION_GRANT",
    "path": "project/docs/governance/coordination-execution-grants/GOV-COORD-V1-CODEX-LOCAL.md",
    "recordId": "GOV-COORD-V1-CODEX-LOCAL",
    "evidenceSha": "a05763af4187aa41ca2c50c8295713bf727c9650"
  },
  "operation": {
    "type": "EXACT_APPEND_AT_DECLARED_ANCHOR",
    "changeClass": "LEVEL_2_MECHANICAL",
    "targetFile": "project/docs/governance/decision-log.md",
    "recordIdentity": "| Date | Decision | Scope | Source | Follow-up |",
    "anchor": "|---|---|---|---|---|",
    "expectedOldValue": "|---|---|---|---|---|",
    "newValue": "\n| 2026-11-15 | <!-- GOV-COORD-AUTHORITY kind=SEMANTIC_AUTHORITY recordId=DEBTOR-OD07-CLAIM-LIABILITY-SELECTION-SA01 --> **OD-07 DAR KAPSAMLI YENİDEN AÇIŞ — SEÇİMLİK KALEM BAZLI BORÇLU SORUMLULUĞU (SUPPLIED OWNER DECISION):** Owner, 2026-07-17 tarihli `OD-07-DECISION-01-GOV` kaydındaki realization ertelemesini YALNIZ seçimlik kalem bazlı borçlu sorumluluğu işi için kaldırdı. Kabul edilen alt kararlar: (1) sorumluluk, borçlu rolü veya eski tutar alanları yerine kalem–borçlu ilişkisine bağlı, sürümlü seçim kaydında tutulur; (2) müteselsil, paylı, tutarla sınırlı ve belirlenmedi davranışları owner’ın incelediği tasarım R02 ve uygulama planı R02 sınırlarıyla uygulanır; (3) alacağın tek ortak bakiyesi korunur, borçlu bakiyeleri toplanarak dosya borcu üretilmez; (4) dar fazla ödeme istisnası: yalnız açıkça paylı veya tutarla sınırlı seçilmiş kalemlerde borçluya atfedilen ve mahsup edilemeyen ödeme mevcut fazla ödeme altyapısında izlenir, başka borçluya otomatik aktarılmaz, haciz ve icra dairesi kaynaklı ödemelerin mevcut kuralları değişmez; tahsilat eksiksiz uzlaştırılır; güvenli geri dönüş şartları korunur. | Yetki: ayrı çalışma ağacında kod, migration dosyası hazırlığı, tek kullanımlık test veritabanında sınama ve PR hazırlığı. Yetki dışı: canlı migration, yayın, bayrak açma, gerçek tahsilat ve veri yazımı; P02 ve kalan 15 pilot dosya değiştirilmez, P02 için sorumluluk seçimi yapılmış sayılmaz. Geri dönüş: eski derlemenin yeni kayıtları güvenle okuduğu gerçek eski sürümle kanıtlanır; kanıtlanamazsa yeni mali kayıt oluştuktan sonra o sürüme dönüş engellenir; seçimler silinerek veya belirlenmedi yapılarak hesap değiştirilmez. Yazılım ilam metninden, rolden veya borçlu sayısından hukuki sonuç çıkarmaz; seçim avukat/kullanıcı tercihidir. OD-07’nin bu kapsam dışındaki realization’ı (LegalResponsibility aggregate, rol/temsil modeli, kefalet obligation-scope, iflas masası, succession) ERTELENMİŞ kalır; DBP-07 §3 kavram ayrımı bağlayıcıdır. | Owner’ın 2026-11-15 tarihli doğrudan talimatları (seçimlik borçlu sorumluluğu tasarım ve uygulama talimatları; \"OWNER KARARI VE UYGULAMA TALİMATI\"). Bu satır supplied owner kararının transcription’ıdır; ajan ratifikasyonu veya machine grant değildir. İlgili: `OD-07-DECISION-01-GOV` (2026-07-17); DEBTOR-DBP-07 §3/§6/§7/§10/§13; COL/OD-17; COL/OD-19 ve ALC-P1-1 (yalnız dar istisna; PaymentDesignation açık kalır). | Uygulama ayrı PR ile yapılır; canlı migration, yayın ve bayrak ayrı owner talimatı ister. Bu kayıt kalan OD-07 alt kararlarını, LSO/FGO açık kalemlerini veya ALC-P1-1’i kapatmaz. Fresh writer sequencing gerekir. |",
    "evidenceSha": "a05763af4187aa41ca2c50c8295713bf727c9650",
    "expectedResultSha256": "ea990003199e3b7802a533eb0ab20f8978f9e293705d37689dd8371e01e31f46"
  },
  "declaredTargetAllowlist": [
    "project/docs/governance/decision-log.md"
  ]
}
```
<!-- GOV_COORD_REQUEST_JSON_END -->
