## Multi-tenant Model Tasarımı

### Tenant
- id
- name
- slug
- plan (FREE/PRO/ENTERPRISE)
- is_active
- created_at

### Office (optional)
- id
- tenant_id (FK)
- name
- timezone
- created_at

### Membership
- id
- tenant_id (FK)
- user_id (FK auth.User)
- role (ADMIN/OPS/LAWYER/VIEWER)
- is_active

### Tenant-scoped data
Aşağıdaki tablolar Tenant FK alır:
- Case, Debtor, Asset, Lien, Fact, Snapshot, JobRun, JobStep, Lock, Communication, UiMapBundle, RecipeBundle, ParamBundle, SystemConfig ...

Kural:
- Her sorgu tenant_id ile filtrelenir.
- Superuser sadece admin panel için; ürün tarafında tenant izolasyonu şart.
