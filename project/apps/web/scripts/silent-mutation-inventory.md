<!-- URETILMIS DOSYA — ELLE DUZENLEMEYIN.
     Kaynak: silent-mutation-manifest.json
     Uretim: node scripts/silent-mutation-manifest.mjs -->

# WEB-SILENT-MUTATION-RELIABILITY-R01 — A1 signature envanteri

## Provenance

| Olcum | Ref | Aciklama |
|---|---|---|
| BASE_SCAN | `77a347a9831522aebddcb4a0ec14767ff21c851b` | A1 worktree'sinin acildigi canonical merge SHA |
| CURRENT_SCAN | `working-tree` | commit oncesi calisma agaci; her olcumde yeniden uretilir |
| FINAL_SCAN | `3f47ef78d40fe957ad9958989ba3e7cf41e80c6f` | squash-merge sonrasi canonical main; A1 kapanis olcumu |

BASE_SCAN sayimlari: false-success 32 · demo-fallback 69 · AST 102.
Fark yalniz bu iki olcum arasindaki diff'ten turetilir; main'deki baska degisiklikler A1 basarisi SAYILMAZ.

## Sayimlar

```text
FALSE_SUCCESS: 32 = 32 FIXED + 0 TESTED_FP + 0 UNRESOLVED
DEMO_FALLBACK: baseline 69 / removed 12 / dependency-fixed 17 / unresolved 40
```

DEPENDENCY_FIXED read node'lari FALSE_SUCCESS hesabina GIRMEZ.
Ayni delete node iki eksende gorunuyorsa cross-reference edilir, iki kez SAYILMAZ.

## Dugumler

| Stable key | Envanter | Durum |
|---|---|---|
| `components/case/case-hearings.tsx#handleSave` | FALSE_SUCCESS | FIXED |
| `components/case/case-hearings.tsx#handleSaveResult` | FALSE_SUCCESS | FIXED |
| `components/case/case-deadlines.tsx#handleSubmit` | FALSE_SUCCESS | FIXED |
| `components/case/case-expenses.tsx#handleSave` | FALSE_SUCCESS | FIXED |
| `components/case/case-notes.tsx#addNote` | FALSE_SUCCESS | FIXED |
| `components/case/case-attachments.tsx#handleUpload` | FALSE_SUCCESS | FIXED |
| `components/case/case-checklist.tsx#handleAddItem` | FALSE_SUCCESS | FIXED |
| `components/case/case-comments.tsx#handleSendComment` | FALSE_SUCCESS | FIXED |
| `components/case/case-comments.tsx#handleSendReply` | FALSE_SUCCESS | FIXED |
| `components/case/case-links.tsx#handleAddLink` | FALSE_SUCCESS | FIXED |
| `components/case/IntakeLinksCard.tsx#handleRevoke` | FALSE_SUCCESS | FIXED |
| `components/case/UyapPanel.tsx#handleDocumentSubmit` | FALSE_SUCCESS | FIXED |
| `components/case/UyapPanel.tsx#handleRetryFailed` | FALSE_SUCCESS | FIXED |
| `components/case/UyapPanel.tsx#handleHacizSubmit` | FALSE_SUCCESS | FIXED |
| `components/claim-item/ClaimItemPanel.tsx#handleDelete` | FALSE_SUCCESS | FIXED |
| `components/claim-item/ClaimItemPanel.tsx#handleRecalculateInterest` | FALSE_SUCCESS | FIXED |
| `components/icrabot/CaseAutomationPanel.tsx#handleApproveTask` | FALSE_SUCCESS | FIXED |
| `components/reminders/reminder-widget.tsx#addReminder` | FALSE_SUCCESS | FIXED |
| `components/reports/scheduled-reports.tsx#saveReport` | FALSE_SUCCESS | FIXED |
| `components/quick-actions.tsx#handleSeedData` | FALSE_SUCCESS | FIXED |
| `app/(dashboard)/calendar/page.tsx#handleAddEvent` | FALSE_SUCCESS | FIXED |
| `app/(dashboard)/calendar/page.tsx#handleUpdateEvent` | FALSE_SUCCESS | FIXED |
| `app/(dashboard)/cases/new/page.tsx#generateTakipTalebiPreview` | FALSE_SUCCESS | FIXED |
| `app/(dashboard)/settings/notifications/page.tsx#doTestSend` | FALSE_SUCCESS | FIXED |
| `app/(dashboard)/settings/office/page.tsx#handleDeleteLawyer` | FALSE_SUCCESS | FIXED |
| `app/(dashboard)/settings/office/page.tsx#handleDeleteBankAccount` | FALSE_SUCCESS | FIXED |
| `app/(dashboard)/settings/office/page.tsx#handleDeleteStaff` | FALSE_SUCCESS | FIXED |
| `app/(dashboard)/settings/office/page.tsx#handleSaveBankAccount` | FALSE_SUCCESS | FIXED |
| `app/(dashboard)/settings/office/page.tsx#OfficeSettingsInner:defaultLawyer` | FALSE_SUCCESS | FIXED |
| `app/(dashboard)/settings/office/page.tsx#OfficeSettingsInner:lawyerOrder` | FALSE_SUCCESS | FIXED — MISATTRIBUTION_CORRECTED: baseline 2. OfficeSettingsInner false-success dugumu staff-default DEGIL lawyer-order idi (satir 744 /lawyers/order/update); staff-default P3 idi ve ayrica pessimistic yapildi |
| `app/(dashboard)/tasks/page.tsx#handleStatusChange` | FALSE_SUCCESS | FIXED |
| `app/portal/documents/page.tsx#handleUpload` | FALSE_SUCCESS | FIXED |
| `components/case/case-hearings.tsx#handleDelete` | DEMO_FALLBACK | REMOVED |
| `components/case/case-hearings.tsx#loadHearings` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `components/case/case-deadlines.tsx#handleToggleComplete` | DEMO_FALLBACK | REMOVED |
| `components/case/case-deadlines.tsx#handleDelete` | DEMO_FALLBACK | REMOVED |
| `components/case/case-deadlines.tsx#loadDeadlines` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `components/case/case-expenses.tsx#handleDelete` | DEMO_FALLBACK | REMOVED |
| `components/case/case-expenses.tsx#loadExpenses` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `components/case/case-notes.tsx#loadNotes` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `components/case/case-notes.tsx#deleteNote` | DEMO_FALLBACK | REMOVED |
| `components/case/case-links.tsx#loadLinks` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `components/case/case-links.tsx#handleRemoveLink` | DEMO_FALLBACK | REMOVED |
| `components/case/case-checklist.tsx#loadChecklist` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `components/case/case-checklist.tsx#handleToggle` | DEMO_FALLBACK | REMOVED |
| `components/case/case-checklist.tsx#handleSaveEdit` | DEMO_FALLBACK | REMOVED |
| `components/case/case-checklist.tsx#handleDelete` | DEMO_FALLBACK | REMOVED |
| `components/case/case-comments.tsx#loadComments` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `components/case/case-comments.tsx#loadUsers` | DEMO_FALLBACK | REMOVED |
| `components/case/case-comments.tsx#handleDeleteComment` | DEMO_FALLBACK | REMOVED |
| `components/case/case-attachments.tsx#loadAttachments` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `components/case/case-attachments.tsx#handleDelete` | DEMO_FALLBACK | REMOVED |
| `components/case/UyapPanel.tsx#loadData` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `components/claim-item/ClaimItemPanel.tsx#loadData` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `app/(dashboard)/settings/office/page.tsx#loadOffice` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `app/(dashboard)/settings/office/page.tsx#loadStaff` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `app/portal/documents/page.tsx#fetchDocuments` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `app/(dashboard)/tasks/page.tsx#loadTasks` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `app/(dashboard)/settings/notifications/page.tsx#load` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `app/(dashboard)/calendar/page.tsx#fetchEvents` | DEMO_FALLBACK | DEPENDENCY_FIXED |
| `components/icrabot/CaseAutomationPanel.tsx#loadData` | DEMO_FALLBACK | DEPENDENCY_FIXED |
