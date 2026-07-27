# Canonical Five-Module Workspace Map

```text
Belge yolu : project/docs/governance/CANONICAL-FIVE-MODULE-WORKSPACE-MAP.md
Durum      : CANONICAL ROUTING MAP / NON-AUTHORIZING
Rol        : Her yeni görevi doğrulanmış beş çalışma modülüne veya ortak çalışma
             hattına yönlendirir; domain law, task status veya execution authority üretmez.
```

## 1. Amaç ve sınır

Bu harita owner'ın beş ana çalışma modülü modelini repository'deki canonical bounded-context
gerçeğiyle tek keşif yüzeyinde birleştirir. Ajanlar her talimatta beş modülü yeniden istemez;
görev kapsamını bu haritadan sınıflandırır ve ilgili canonical kaynaklara gider.

Bu belge:

- mevcut domain ownership'ini değiştirmez;
- program, wave, workstream veya task seçmez;
- `GO-*`, semantic authority, execution grant, lease, worktree veya merge authority üretmez;
- living status kayıtlarını kopyalayıp ikinci bir status authority oluşturmaz;
- belirsiz taksonomiyi sessizce çözmez.

Beşli çalışma modeli repository'de canonical UYAP module-boundary pack'inin kullandığı bounded
context kümesiyle doğrulanır: `OFFICE`, `CLIENT`, `DEBTOR`, `RECEIVABLE`, `COLLECTION`.

## 2. Beş çalışma modülü

| Çalışma modülü | Sahip olduğu ana gerçek | İlk canonical giriş | Living çalışma/status kaydı | Zorunlu yakın sınırlar |
|---|---|---|---|---|
| `OFFICE` — Avukat / Personel | kişi, kullanıcı hesabı, üyelik/istihdam, avukat niteliği, rol/yetki/atama, onay aktörü, delegation ve audit attribution | `OFFICE-GOVERNANCE.md` | `OFFICE-DELIVERY-MANIFEST.md`; global durum için ayrıca Master Register ve `active-roadmap.md` | CLIENT representation/POA, DEBTOR fact, RECEIVABLE calculation ve COLLECTION receipt truth'ünü sahiplenmez |
| `CLIENT` — Müvekkil | client profile/relationship, representation/mandate, client instruction/approval, client-facing visibility ve fee/contract context | `CLIENT-GOVERNANCE-CHARTER.md` | Master Register, `active-roadmap.md`, `decision-log.md`; charter full Domain Law değildir | OFFICE actor authority, DEBTOR identity, RECEIVABLE amount ve COLLECTION receipt lifecycle truth'ünü sahiplenmez |
| `DEBTOR` — Borçlu | debtor identity/role/classification, address/asset facts, case-debtor relationship ve debtor-owned observed facts | `DEBTOR-GOVERNANCE.md` | `DEBTOR-PHASE-0-COMPLETION-ROADMAP.md`, Master Register, `active-roadmap.md` | provider observation otomatik debtor truth değildir; RECEIVABLE/COLLECTION authority'sini sahiplenmez |
| `RECEIVABLE` — Alacak | claim/ClaimItem formation, legal calculation snapshot, bucket/policy/plan ve legal balance authority | `RECEIVABLE-GOVERNANCE.md` | `RCV-PHASE-1-AUTHORIZATION.md`, Master Register, `active-roadmap.md` | COLLECTION receipt lifecycle/outer transaction owner'ı değildir; ClaimItem tek başına application target değildir |
| `COLLECTION` — Tahsilat | receipt lifecycle, payment/settlement, idempotency, allocation execution orchestration ve reconciliation | `COLLECTION-GOVERNANCE.md` | `COLLECTION-DECOMPOSITION.md`, Master Register, `active-roadmap.md` | RECEIVABLE snapshot/bucket/calculation policy'sini yeniden hesaplamaz veya sahiplenmez |

Tablodaki status dosyaları her görevde fresh okunur. Bu belgedeki modül üyeliği, o modülde
aktif veya yetkili bir task bulunduğu anlamına gelmez.

## 3. Ortak çalışma hatları — altıncı çalışma modülü değildir

Bir görev birden çok modülü kesebilir veya repository control-plane'ine ait olabilir. Böyle
görevler yeni bir hukuki domain owner yaratmadan `CROSS_MODULE / SHARED` olarak sınıflandırılır.

| Ortak hat | Routing kuralı |
|---|---|
| `UYAP_CONNECTOR` | UYAP constitution/annex/contract pack okunur; etkilenen beş modülden hangileri varsa onların canonical governance'i birlikte okunur. Connector hiçbir domain truth'ünün owner'ı değildir. |
| `GITHUB_PLATFORM / CI / GOVERNANCE_COORDINATION` | `AGENTS.md`, governance coordination contract'ları ve exact task authority okunur. Bu bir hukuk çalışma modülü değildir ve domain semantiği üretmez. |
| `SHARED_DOCUMENT_SOURCE / EVIDENCE` | `DOCUMENT-SOURCE-GOVERNANCE.md` ile tüketen tüm modül governance'i birlikte okunur; shared platform yeni primary domain değildir. |
| `CROSS_WORKSTREAM_MIGRATION` | Migration coordination register + execution contract + etkilenen tüm modüller okunur; tek modül adına cross-domain migration yetkisi çıkarılamaz. |

`coordination-v2/programs.manifest.json` içindeki program identity taksonomisi bu çalışma-modülü
routing'inden farklı bir düzlemdir. Manifestin açık bıraktığı 5-vs-6 program sorusu bu belgeyle
çözülmez; `taxonomyLevel: UNKNOWN` fail-closed kalır.

## 4. Her yeni görev için otomatik routing

```text
1. Fresh repository/main/PR/WIP durumunu doğrula.
2. Task ID, amaç, hedef dosya ve domain terimlerinden etkilenen modül kümesini çıkar.
3. Tam bir eşleşme varsa WORKSPACE MODULE = <tek modül> kaydet.
4. Birden çok eşleşme varsa WORKSPACE MODULES = <liste> + CROSS_MODULE kaydet;
   ilgili bütün canonical governance belgelerini oku.
5. Yalnız CI/governance/tooling ise SHARED CONTROL PLANE olarak kaydet;
   beş hukuk modülünden birine zorla bağlama.
6. Eşleşme kanıtla belirlenemiyorsa UNKNOWN / OWNER REVIEW; mutation yapma.
7. Modül seçimi execution authority değildir: aktif task, owner mode, semantic authority,
   competing writer ve exact scope kapılarını ayrıca doğrula.
```

Minimum Session Initialization alanı:

```text
WORKSPACE MODULE(S): <OFFICE|CLIENT|DEBTOR|RECEIVABLE|COLLECTION|CROSS_MODULE|SHARED_CONTROL_PLANE|UNKNOWN>
ROUTING EVIDENCE: <task/path/governance references>
CURRENT STATUS SOURCE: <fresh living register references>
AUTHORITY: <GO mode + semantic/execution references veya NONE>
CONCURRENT ACTIVITY: <open PR/worktree/path overlap>
READY: YES / NO — exact reason
```

Kullanıcının her talimatta beş modülü yeniden yazması gerekmez. Task adı/amacı yeterince açıksa
ajan routing'i kendisi yapar. Yalnız `UNKNOWN` veya birden fazla makul ownership seçeneği varsa
owner'dan modül seçimi istenir.

## 5. Owner review gerektiren açık konular

Bu konular doğrulanmış belirsizliktir; harita bunları karara bağlamaz:

1. **Coordination V2 5-vs-6 program taksonomisi:** `UYAP_CONNECTOR` bağımsız program mı,
   `DEBTOR` alt-track'i mi? `programs.manifest.json` kararı açık tutar.
2. **RECEIVABLE program seviyesi:** bağımsız program mı, Accounting/Collection üst hattının
   alt-track'i mi? Çalışma modülü ownership'i doğrulanmıştır; program seviyesi açık kalır.
3. **Beş harici çalışma sayfasının kalıcı kimlikleri:** repository'de Codex/Claude çalışma
   sayfası URL/thread/ID register'ı yoktur. Bu harita modül routing'ini çözer; belirli sohbet
   sayfasına otomatik yönlendirme yapmaz.
4. **CLIENT governance olgunluğu:** CLIENT çalışma modülü ve bounded charter canonicaldır;
   charter açıkça full Domain Law değildir. Full Domain Law gerekip gerekmediği ayrı owner kararıdır.

Bu dört konu çözülene kadar güvenli varsayılan: ilgili taxonomy/authority alanı fail-closed,
mevcut domain ownership ve canonical sınırlar değişmeden korunur.

## 6. Canonical kaynak zinciri

```text
AGENTS.md
→ GOVERNANCE-INDEX.md
→ CANONICAL-FIVE-MODULE-WORKSPACE-MAP.md
→ SYSTEM-CONSTITUTION.md
→ ilgili TÜM canonical module/domain governance
→ ilgili cross-module contract/ADR
→ decision-log.md
→ Master Register + living module status kaydı
→ fresh PR/worktree/CI evidence
→ authority ve consistency gate
```

Çelişkide bu routing haritası semantic kaynağı override etmez. `SYSTEM-CONSTITUTION`, ratified
Domain Law, owner decision ve task-specific authority kendi eksenlerinde bağlayıcı kalır.
