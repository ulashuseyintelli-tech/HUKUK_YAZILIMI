# Governance Coordination Results

Her instance:

```text
coordination-results/<requestId>/result.md
```

Kurallar:

- Instance yalnız result-only PR ile eklenir.
- Existing instance immutable'dır; modify/rename/delete yasaktır.
- Result yalnız observed evidence taşır.
- Result PR'daki tek companion diff deterministik generated register'dır.
- Result request authority'sini genişletemez ve yeni semantic karar üretemez.
- Execution merge edilmediyse başarı sonucu yazılamaz.

Gerçek result oluşturulması bu bootstrap görevinin kapsamı dışındadır.
