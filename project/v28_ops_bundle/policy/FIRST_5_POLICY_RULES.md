# İlk 5 Policy Rule (KVKK, yüksek risk, müvekkil no-email vb.)

Komut:
  python manage.py seed_policy_rules

Kurallar:
1) KVKK_HOLD -> send_email DENY
2) CLIENT_NO_EMAIL -> send_email DENY
3) Risk>=70 -> send_email/enqueue MANUAL (manual_review kuyruğu)
4) Quiet hours -> send_email MANUAL (manual_review)
5) Irreversible queues -> DENY unless ALLOW_IRREVERSIBLE flag

Not:
- Quiet hours kontrolünü gerçek hayatta PolicyGate'e "now" enjekte ederek saat bazlı yazmak daha doğru.
