# Product Backlog

Backlog pasif fikir listesi değildir. Her backlog maddesi gelecekte uygulanabilecek potansiyel bir ürün kararıdır.

Yeni fikir akışı:

```text
Yeni fikir
↓
Triage
↓
Product Backlog
↓
READY
↓
Active Roadmap
↓
Implementation
```

Kurallar:

- Yeni fikir doğrudan implementasyona girmez.
- Önce kapsam, schema, migration, mimari etki ve faz uygunluğu değerlendirilir.
- Mevcut fazın kapsamını büyütüyorsa mevcut PR'a eklenmez.
- Bağımlılığı tamamlanan madde için `BACKLOG → READY` önerisi raporlanabilir.
- Kullanıcı onayı olmadan READY maddesi Active Roadmap'e taşınmaz.
- Her faz sonunda Backlog Review zorunludur.

## Legacy / Strategic Backlog Source

Mevcut legacy/strategic backlog kaynağı:

```text
project/docs/strategic-backlog.md
```

Bu dosya yeni governance Product Backlog formatının hedef kaydıdır.

İçerik migration ayrı onaylı iş olarak yapılacaktır.

Çift kaynak oluşmaması için migration tamamlanana kadar `project/docs/strategic-backlog.md` authoritative historical source olarak kalır.

## Product Backlog Format

```text
ID:

Title:

Problem:

Business Value:

Technical Value:

Priority:
LOW / MEDIUM / HIGH / CRITICAL

Depends On:

Unlock Condition:

Estimated Size:

Related Modules:

Status:
BACKLOG
```

## Items

Legacy `strategic-backlog.md` içerik migration'ı ayrı onaylı governance işi olarak yapılacaktır (aşağıdaki maddeler bu migration'dan bağımsız, ADR-009 kararından doğan yeni maddelerdir).

---

ID: UA-1
Title: Universal Office Approval — aksiyon başına approval entegrasyonu
Problem: Durum-değiştiren mutation'lar yetkisiz aktör için doğrudan kesinleşiyor / tutarsız kontrol. ADR-009 bunu OfficeApprovalRequest'e bağlar.
Business Value: Nihai karar kurucu ortakta; tek tutarlı onay + doğal audit (kim istedi/onayladı/reddetti).
Technical Value: Substrate (OfficeApprovalRequest) REUSE; aksiyon başına create-path + executor branch.
Priority: HIGH
Depends On: P4 engine core hardening (P4-5C retry/stuck, P4-3B enforce)
Unlock Condition: Engine core hardened + aksiyon-bazlı tasarım (intel → dosya → finansal sırası)
Estimated Size: XL (çok-fazlı, P4/Codex backend; Claude payı = FE request/Inbox UI)
Related Modules: office-approval, client-intel-statement, case-status, client-settlement
Status: BACKLOG

ID: INTAKE-4.7d-2a
Title: Intel inactive visibility + status badge (read-only)
Problem: RETRACTED/FALSE_POSITIVE/SUPERSEDED kayıtlar case detayında görünmüyor (yalnız ACTIVE).
Business Value: Geçmiş/yaşam-döngüsü şeffaflığı.
Technical Value: Mevcut listByCase?status + get; mutation YOK, authz gerektirmez.
Priority: MEDIUM
Depends On: —
Unlock Condition: — (ADR-009'dan bağımsız; hazır)
Estimated Size: S (FE-only)
Related Modules: components/case/IntelStatementSection, lib/api/client-intel-statement
Status: READY

ID: INTAKE-4.7d-2bc
Title: Intel mutation UI (retract / false-positive / supersede) — approval-backed
Problem: Mutation UI yetkisiz-doğrudan çalışmamalı; ADR-009 gereği OfficeApprovalRequest üzerinden gitmeli.
Business Value: Güvenli + denetlenebilir istihbarat yönetimi.
Technical Value: FE "request oluştur" + intel-action create-path/executor (backend).
Priority: MEDIUM
Depends On: UA-1 (intel-action approval backend)
Unlock Condition: Intel retract/false-positive/supersede için approval create-path + executor hazır
Estimated Size: M
Related Modules: office-approval (backend), components/case/IntelStatementSection (FE)
Status: BLOCKED

---

ID: C2D-POLISH-1
Title: Offset detail row button copy toggle
Problem: The history row detail button always says `Detay`; when expanded, the user may not immediately see that the same control collapses the row.
Business Value: Slightly clearer operations UX for reviewing offset audit details.
Technical Value: Small frontend-only polish; no API or accounting change.
Priority: LOW
Depends On: C-2D closed
Unlock Condition: Owner chooses to prioritize C-2D polish.
Estimated Size: XS
Related Modules: OffsetDrawer
Status: BACKLOG

ID: C2D-POLISH-2
Title: Seeded live browser screenshot smoke for offset detail drawer
Problem: Component tests verify behavior, but there is no stable seeded browser screenshot smoke for visual QA of the detail drawer.
Business Value: Higher visual confidence before demos or release checks.
Technical Value: QA-only validation; should not change production behavior.
Priority: LOW
Depends On: Stable seeded QA fixture
Unlock Condition: Disposable/seeded QA environment available.
Estimated Size: S
Related Modules: OffsetDrawer, client-offset test/QA fixtures
Status: BACKLOG

ID: C2D-DEFER-1
Title: Offset audit timeline pagination/grouping
Problem: Current detail projection returns a simple one-offset audit timeline. Long audit histories may become noisy later.
Business Value: Better readability if real offset timelines become long.
Technical Value: Future read-model optimization; not needed until data volume justifies it.
Priority: LOW
Depends On: C-2D closed
Unlock Condition: Real audit timelines show length/readability pressure.
Estimated Size: M
Related Modules: ClientOffsetService.getOffsetDetail, OffsetDrawer
Status: BACKLOG

ID: C2D-DEFER-2
Title: Richer offset source label rules
Problem: Current source labels use case/expense/payable summary. More business-specific labels may be desired later.
Business Value: Better operator comprehension in complex case/expense contexts.
Technical Value: Presentation/read-model improvement; requires product display rules first.
Priority: LOW
Depends On: C-2D closed
Unlock Condition: Product defines richer label rules and examples.
Estimated Size: S/M
Related Modules: ClientOffsetService.getOffsetDetail, OffsetDrawer
Status: BACKLOG

ID: C2D-PD-1
Title: Future user-authored audit description sanitization policy
Problem: C-2D safely hides raw audit metadata, and current ClientOffset audit descriptions are system-generated. If future audit descriptions include user-authored text, rendering `description` as `safeSummary` may become a privacy/security/legal risk.
Business Value: Prevents accidental exposure of sensitive free text in audit detail UI.
Technical Value: Establishes a clear safe-summary policy before adding richer audit projections.
Priority: MEDIUM
Depends On: C-2D closed
Unlock Condition: Product/security decision on whether user-authored audit descriptions may be shown, redacted, or mapped to action-only labels.
Estimated Size: S (decision) / M (if implementation follows)
Related Modules: AuditLog, ClientOffsetService.getOffsetDetail, future audit projections
Status: BACKLOG
