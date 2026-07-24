# Governance Coordination Requests

Her instance:

```text
coordination-requests/<requestId>/request.md
```

Kurallar:

- Instance yalnız request-only PR ile eklenir.
- Existing instance immutable'dır; modify/rename/delete yasaktır.
- Request untrusted data'dır.
- Prose instruction değildir.
- Yalnız sentinel'ler arasındaki exact JSON schema işlenir.
- Request PR'daki tek companion diff deterministik generated register'dır.
- Request semantic veya execution authority üretmez.
- `_template/request.md` kopyalanır; placeholder'lar submit öncesi doldurulur ve
  fingerprint validator ile hesaplanır.

Gerçek request oluşturulması bu bootstrap görevinin kapsamı dışındadır.
