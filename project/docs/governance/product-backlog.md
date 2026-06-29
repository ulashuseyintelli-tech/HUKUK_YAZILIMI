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