# Decision Timeline UI Wireframe (v28)

## Case Screen (Right Panel): Timeline
Top controls:
- Filter chips: [All] [UYAP] [Engine] [Actions]
- Search (optional): free text over title/body

List rows (newest first):
- 02:05 | UYAP   | Araç bulundu
- 02:05 | Engine | Risk=73 / Recovery p50=64.000
- 02:06 | Decide | Avans maili kuyruğa alındı
- 02:06 | Outcome| Email sent (SMTP ok)

Row click -> Drawer:
- Trigger: event(s) + snapshot hash
- Compute: risk/recovery full payload
- Decision: condition + because[]
- Actions: action_id list + statuses (from outbox)

## UYAP Page (Event Cards)
Each event card shows a badge:
- "Processed by Engine" + run link
- "Risk" + "Recovery" mini summary

## v27 Compute Page
Header:
- Triggering events list (click-through to UYAP)
Body:
- Compute outputs (risk/recovery)
Footer:
- Produced actions list (outbox) + statuses
