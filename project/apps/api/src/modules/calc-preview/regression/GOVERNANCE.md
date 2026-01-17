# Regression Baseline Governance

> **"Regression suite ritüele dönüşmesin"**

## Temel Kurallar

### 1. Baseline Update Kuralları

```
┌─────────────────────────────────────────────────────────────────┐
│                    BASELINE UPDATE KURALLARI                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ✅ SADECE release branch'ten update yapılabilir               │
│  ✅ CODEOWNERS onayı zorunlu                                   │
│  ✅ PR description'da "neden değişti" açıklaması zorunlu       │
│  ✅ Değişen scenario'lar için review checklist doldurulmalı    │
│                                                                 │
│  ❌ Feature branch'ten baseline update YASAK                   │
│  ❌ Otomatik baseline update YASAK (CI'da)                     │
│  ❌ "Hızlıca geçsin" için baseline değiştirmek YASAK           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Allowlist Kuralları

```yaml
# known-diffs.json değişikliği için:
- Her diff için expiry date ZORUNLU (max 30 gün)
- Reason alanı detaylı olmalı (hangi PR, neden)
- Expired diff'ler otomatik fail olur
- Allowlist şişerse (>10 item) alarm

# rounding-tolerance.json değişikliği için:
- Tolerans artışı için CODEOWNERS + tech-lead onayı
- Tolerans azaltılabilir (onaysız)
- Değişiklik sebebi PR'da açıklanmalı
```

### 3. Scenario Ekleme/Silme Kuralları

```yaml
Yeni scenario eklemek için:
  - Scenario ID unique olmalı
  - Baseline oluşturulmalı (update-baseline komutu)
  - PR'da scenario'nun neyi test ettiği açıklanmalı

Scenario silmek için:
  - CODEOWNERS onayı zorunlu
  - Silme sebebi PR'da açıklanmalı
  - İlgili baseline dosyaları da silinmeli
```

## CODEOWNERS

```
# .github/CODEOWNERS (veya repo root'ta)

# Regression baselines - release manager + tech lead onayı
/apps/api/src/modules/calc-preview/regression/baselines/ @release-manager @tech-lead

# Allowlists - tech lead onayı
/apps/api/src/modules/calc-preview/regression/allowlists/ @tech-lead

# Scenarios - normal review
/apps/api/src/modules/calc-preview/regression/scenarios/ @backend-team
```

## PR Checklist

Baseline değişikliği içeren PR'lar için:

```markdown
## Baseline Change Checklist

- [ ] Değişiklik sebebi açıklandı
- [ ] Yeni değerler doğrulandı (manuel hesaplama veya referans)
- [ ] İlgili scenario'lar gözden geçirildi
- [ ] Tolerans değişikliği varsa gerekçelendirildi
- [ ] known-diffs ekleniyorsa expiry date belirlendi
- [ ] Release notes'a eklendi (breaking change ise)
```

## Alarm Kuralları

```typescript
// CI'da kontrol edilecek kurallar

interface GovernanceAlerts {
  // known-diffs şişme alarmı
  knownDiffsCountMax: 10;
  
  // Expired diff alarmı
  expiredDiffsAllowed: false;
  
  // Tolerans artış alarmı
  toleranceIncreaseRequiresApproval: true;
  
  // Baseline update branch kontrolü
  baselineUpdateBranches: ['release/*', 'main'];
}
```

## Audit Trail

Her baseline değişikliği için:

```json
{
  "scenarioId": "001",
  "changedAt": "2026-01-16T10:00:00Z",
  "changedBy": "user@example.com",
  "prNumber": 1234,
  "reason": "TCMB rate table updated for 2026",
  "previousHash": "abc123",
  "newHash": "def456"
}
```

## Otomatik Kontroller (CI)

```yaml
# .github/workflows/regression-governance.yml

regression-governance:
  runs-on: ubuntu-latest
  steps:
    - name: Check baseline changes
      run: |
        # Baseline değişikliği varsa branch kontrolü
        if git diff --name-only origin/main | grep -q "baselines/"; then
          if [[ ! "$GITHUB_REF" =~ ^refs/heads/(release/|main) ]]; then
            echo "❌ Baseline updates only allowed from release branches"
            exit 1
          fi
        fi
    
    - name: Check known-diffs expiry
      run: |
        # Expired diff kontrolü
        node scripts/check-known-diffs-expiry.js
    
    - name: Check allowlist size
      run: |
        # known-diffs şişme kontrolü
        COUNT=$(jq '.knownDiffs | length' regression/allowlists/known-diffs.json)
        if [ "$COUNT" -gt 10 ]; then
          echo "⚠️ known-diffs has $COUNT items (max 10)"
          exit 1
        fi
```

## Sorumluluklar

| Rol | Sorumluluk |
|-----|------------|
| Release Manager | Baseline update onayı, release branch yönetimi |
| Tech Lead | Tolerans değişikliği onayı, allowlist review |
| Backend Team | Scenario ekleme/güncelleme, PR review |
| QA | Regression sonuçları analizi, false positive tespiti |

## Escalation

```
Baseline fail → Backend developer fix
     ↓ (24h içinde çözülmezse)
Tech Lead review
     ↓ (gerçek regresyon ise)
Release block + hotfix
     ↓ (false positive ise)
Allowlist + expiry date
```
