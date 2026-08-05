#Requires -Version 7.0
<#
.SYNOPSIS
  main branch protection ve PR blocker durumunu salt-okunur teshis eder.

.DESCRIPTION
  Bu script yalniz `gh api --method GET`, `gh pr view` ve `gh auth status`
  cagirir. PATCH/PUT/POST/DELETE veya mutation GraphQL cagrisi ICERMEZ;
  -Repair, -VerifyLockdown gibi bir yazma modu YOKTUR ve hicbir kod yolu
  branch protection veya ruleset yazmaz. `lock_branch` alani eksik veya
  beklenmeyen sekilde geldiginde sessizce "false" varsaymaz -- fail-closed
  `exit 2` doner. Token, credential veya secret hicbir cikti yoluna
  yazilmaz; kimlik dogrulama tamamen `gh` CLI'nin kendi oturumuna birakilir.

  Bu script kendiliginden calisan bir hook veya runtime consumer degildir.
  Yalniz acik insan cagrisiyla veya CI'nin test adimiyla calisir; hicbir
  hook/settings dosyasina baglanmaz.

.PARAMETER Repo
  "owner/name" formatinda hedef repository. Testler icin override edilebilir.

.PARAMETER Branch
  Hedef branch adi. API path'ine yerlestirilmeden once URI-encode edilir.

.PARAMETER Pr
  0'dan buyukse, o PR icin ek olarak required-check ve review blocker
  teshisi yapar. 0 (varsayilan) = yalniz repo-genel protection snapshot'i.

.EXAMPLE
  .\gh-guard-readonly.ps1
  Canli main protection ozetini salt-okunur yazdirir.

.EXAMPLE
  .\gh-guard-readonly.ps1 -Pr 2044
  O PR icin canli protection ve required-check blocker'larini teshis eder.

.OUTPUTS
  Exit 0: olculebilir blocker yok.
  Exit 1: bir veya daha fazla blocker bulundu (raporlandi, degistirilmedi).
  Exit 2: teshis basarisiz oldu (auth yok, GitHub yaniti okunamadi, veya
          lock_branch beklenmeyen sekilde geldi) -- fail-closed.
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$')]
    [string]$Repo = 'ulashuseyintelli-tech/HUKUK_YAZILIMI',

    [ValidateNotNullOrEmpty()]
    [ValidatePattern('^\S+$')]
    [string]$Branch = 'main',

    [ValidateRange(0, [int]::MaxValue)]
    [int]$Pr = 0
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:owner, $script:repoName = $Repo -split '/', 2
$script:encodedBranch = [uri]::EscapeDataString($Branch)

function Write-Ok   ($message) { Write-Host "  OK    $message" -ForegroundColor Green }
function Write-Bad  ($message) { Write-Host "  BULGU $message" -ForegroundColor Red }
function Write-Info ($message) { Write-Host $message -ForegroundColor Cyan }

# Tek gecis noktasi: butun `gh api` cagrilari buradan gecer ve her cagri
# calismadan once GET disi bir method icermedigi konusunda kontrol edilir.
# Ileride bir edit yanlislikla bir yazma methodu eklerse, bu kapi calisma
# zamaninda durdurur -- statik testin yakalamasi beklenmez, ikisi birden
# vardir (defense in depth).
function Assert-ReadOnlyApiArgs([string[]]$ApiArgs) {
    $methodIndex = [array]::IndexOf($ApiArgs, '--method')
    if ($methodIndex -lt 0 -or ($methodIndex + 1) -ge $ApiArgs.Count) {
        throw 'INTERNAL: gh api cagrisi --method icermiyor; salt-okunur garanti edilemez.'
    }
    $verb = $ApiArgs[$methodIndex + 1]
    if ($verb -ne 'GET') {
        throw "INTERNAL: gh api cagrisi GET disi bir method icerir: $verb"
    }
    foreach ($token in $ApiArgs) {
        if ($token -match '^(PATCH|PUT|POST|DELETE)$') {
            throw "INTERNAL: gh api argumaninda yazma methodu literali bulundu: $token"
        }
    }
}

function Invoke-ReadOnlyApi([string[]]$ApiArgs) {
    Assert-ReadOnlyApiArgs $ApiArgs
    $raw = & gh api @ApiArgs 2>&1
    return [pscustomobject]@{ Output = $raw; ExitCode = $LASTEXITCODE }
}

gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'HATA: gh oturumu kapali; salt-okunur teshis yapilamadi.' -ForegroundColor Red
    exit 2
}

# Fail-closed lock_branch dogrulamasi: alan yoksa, null ise, `enabled` alt
# alani yoksa veya boolean degilse "kilitli degil" diye SESSIZCE VARSAYMAZ.
# Bunun yerine teshisi durdurur ve exit 2 doner -- cunku "bilmiyorum" ile
# "kilitli degil" ayni sey degildir ve ikisini karistirmak guvenlik acisindan
# yanlis tarafta hata yapmak demektir.
function Assert-LockBranchShape($protection) {
    if (-not ($protection.PSObject.Properties.Name -contains 'lock_branch')) {
        Write-Host 'HATA: protection yanitinda lock_branch alani yok; fail-closed.' -ForegroundColor Red
        exit 2
    }
    $lockBranch = $protection.lock_branch
    if ($null -eq $lockBranch -or $lockBranch -isnot [System.Management.Automation.PSCustomObject]) {
        Write-Host 'HATA: lock_branch beklenmeyen bicimde (obje degil); fail-closed.' -ForegroundColor Red
        exit 2
    }
    if (-not ($lockBranch.PSObject.Properties.Name -contains 'enabled')) {
        Write-Host 'HATA: lock_branch.enabled alani yok; fail-closed.' -ForegroundColor Red
        exit 2
    }
    if ($lockBranch.enabled -isnot [bool]) {
        Write-Host 'HATA: lock_branch.enabled boolean degil; fail-closed.' -ForegroundColor Red
        exit 2
    }
    return [bool]$lockBranch.enabled
}

function Get-LiveProtection {
    $call = Invoke-ReadOnlyApi @('--method', 'GET', "repos/$Repo/branches/$script:encodedBranch/protection")
    $obj = $null
    try { $obj = $call.Output | ConvertFrom-Json } catch { $obj = $null }

    if ($call.ExitCode -ne 0 -or $null -eq $obj -or ($obj.PSObject.Properties.Name -contains 'message')) {
        $message = if ($obj -and ($obj.PSObject.Properties.Name -contains 'message')) { $obj.message } else { ($call.Output | Out-String).Trim() }
        Write-Host 'HATA: branch protection salt-okunur olarak okunamadi.' -ForegroundColor Red
        Write-Host "  GitHub yaniti: $message" -ForegroundColor Red
        exit 2
    }
    if ($obj.PSObject.Properties.Name -notcontains 'required_status_checks') {
        Write-Host 'HATA: beklenmeyen protection cevabi (required_status_checks yok); fail-closed.' -ForegroundColor Red
        exit 2
    }
    [void](Assert-LockBranchShape $obj)
    return $obj
}

function Get-LiveRulesets {
    $call = Invoke-ReadOnlyApi @('--method', 'GET', "repos/$Repo/rulesets", '--paginate')
    $obj = $null
    try { $obj = @($call.Output | ConvertFrom-Json) } catch { $obj = $null }

    if ($call.ExitCode -ne 0 -or $null -eq $obj) {
        Write-Host '  UYARI: ruleset listesi salt-okunur olarak okunamadi.' -ForegroundColor Yellow
        return @()
    }
    return @($obj)
}

function Write-ProtectionSnapshot($protection) {
    Write-Host "  lock_branch                     = $([bool]$protection.lock_branch.enabled)"
    Write-Host "  required_approving_review_count = $([int]$protection.required_pull_request_reviews.required_approving_review_count)"
    Write-Host "  required_status_checks          = [$($protection.required_status_checks.contexts -join ', ')]"
    Write-Host "  strict_required_status_checks   = $([bool]$protection.required_status_checks.strict)"
    Write-Host "  enforce_admins                  = $([bool]$protection.enforce_admins.enabled)"
    Write-Host "  allow_force_pushes              = $([bool]$protection.allow_force_pushes.enabled)"
    Write-Host "  allow_deletions                 = $([bool]$protection.allow_deletions.enabled)"
    Write-Host "  conversation_resolution         = $([bool]$protection.required_conversation_resolution.enabled)"
}

$live = Get-LiveProtection

if ($Pr -gt 0) {
    Write-Info "`nPR #$Pr salt-okunur teshis ediliyor...`n"
    $pullRequest = gh pr view $Pr --repo $Repo --json state,isDraft,mergeable,mergeStateStatus,reviewDecision,headRefOid,title | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $null -eq $pullRequest) {
        Write-Host "HATA: PR #$Pr salt-okunur olarak okunamadi." -ForegroundColor Red
        exit 2
    }

    Write-Host "  $($pullRequest.title)"
    Write-Host "  state=$($pullRequest.state)  mergeState=$($pullRequest.mergeStateStatus)  mergeable=$($pullRequest.mergeable)"
    Write-ProtectionSnapshot $live
    Write-Host ''

    $findings = [System.Collections.Generic.List[string]]::new()
    if ($pullRequest.state -ne 'OPEN') { $findings.Add("PR zaten $($pullRequest.state); acik degil.") }
    if ($pullRequest.isDraft) { $findings.Add('PR DRAFT.') }
    if ($live.lock_branch.enabled) {
        $findings.Add('main lock_branch=true; external control-plane dependency. Protection ayarina dokunulmadi.')
    }
    if ($pullRequest.mergeable -eq 'CONFLICTING') { $findings.Add('Merge conflict var.') }

    $requiredApprovals = [int]$live.required_pull_request_reviews.required_approving_review_count
    if ($requiredApprovals -gt 0 -and $pullRequest.reviewDecision -eq 'REVIEW_REQUIRED') {
        $findings.Add("Required approval bekleniyor: $requiredApprovals.")
    }

    $query = 'query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){commits(last:1){nodes{commit{statusCheckRollup{contexts(first:50){nodes{__typename ... on CheckRun{name status conclusion} ... on StatusContext{context state}}}}}}}}}}'
    $rollupRaw = gh api graphql -f query=$query -F "owner=$script:owner" -F "name=$script:repoName" -F "number=$Pr" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "HATA: PR #$Pr icin check rollup salt-okunur olarak okunamadi." -ForegroundColor Red
        exit 2
    }
    $rollup = $rollupRaw | ConvertFrom-Json
    $nodes = @($rollup.data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes)
    $states = @{}
    foreach ($node in $nodes) {
        $contextName = if ($node.name) { $node.name } else { $node.context }
        $contextState = if ($node.conclusion) { $node.conclusion } elseif ($node.status) { $node.status } else { $node.state }
        $states[$contextName] = $contextState
    }
    foreach ($context in $live.required_status_checks.contexts) {
        if (-not $states.ContainsKey($context)) {
            $findings.Add("Required check '$context' uretilmemis.")
        } elseif ($states[$context] -ne 'SUCCESS') {
            $findings.Add("Required check '$context' durumu: $($states[$context])")
        }
    }
    if ($live.required_status_checks.strict) { $findings.Add('strict=true; branch main ile guncel olmali.') }
    if ($live.required_conversation_resolution.enabled) { $findings.Add('Cozulmemis review thread merge kapisidir.') }

    Write-Host '  --- BLOCKER ---' -ForegroundColor Yellow
    if ($findings.Count -eq 0) {
        Write-Ok 'Olculebilir protection veya CI blocker bulunmadi.'
        exit 0
    }
    foreach ($finding in $findings) { Write-Bad $finding }
    exit 1
}

Write-Info "`n$Repo :: $Branch -- SALT-OKUNUR CONTROL-PLANE SNAPSHOT`n"
Write-ProtectionSnapshot $live

$rulesets = Get-LiveRulesets
$activeRulesets = @($rulesets | Where-Object { $_.enforcement -eq 'active' })
Write-Host "  active_rulesets                  = $($activeRulesets.Count)"
foreach ($ruleset in $activeRulesets) {
    Write-Host "    - $($ruleset.name) (id=$($ruleset.id), target=$($ruleset.target))"
}

Write-Host ''
Write-Host 'MUTATION CAPABILITY: NONE; BU ARAC YALNIZ GET CAGIRIR.' -ForegroundColor Cyan

$blockingObservation = [bool]$live.lock_branch.enabled -or
    [int]$live.required_pull_request_reviews.required_approving_review_count -gt 0
if ($blockingObservation) {
    Write-Bad 'Canli protection degeri merge akisini bloke edebilir; yalniz raporlandi.'
    exit 1
}

Write-Ok 'Canli protection snapshotinda dogrudan lock/approval blocker gozlenmedi.'
exit 0
