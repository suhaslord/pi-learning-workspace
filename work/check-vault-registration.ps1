$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'register-vault.ps1')
function Assert-LearningFixture {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}
# A synthetic process state and explicit temporary config keep real Obsidian untouched.
$script:fixtureRunning = $false
function Get-Process {
    [CmdletBinding()]param([string]$Name)
    if ($script:fixtureRunning) { return [PSCustomObject]@{ Name = $Name } }
}
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('learning-vault-fixture-' + [Guid]::NewGuid().ToString('N'))
$fixtureVault = Join-Path $fixtureRoot 'vault'
New-Item -ItemType Directory -Path $fixtureVault -Force | Out-Null
$fixtureConfig = Join-Path $fixtureRoot 'obsidian.json'
[IO.File]::WriteAllText($fixtureConfig, '{"custom":"retained","vaults":{"prior":{"path":"EXISTING_FIXTURE","open":false,"ts":1}}}')
Register-LearningVault $fixtureVault $fixtureConfig
$fixtureData = Get-Content -LiteralPath $fixtureConfig -Raw | ConvertFrom-Json
Assert-LearningFixture ($fixtureData.custom -eq 'retained' -and $fixtureData.vaults.prior.path -eq 'EXISTING_FIXTURE') 'Existing configuration was changed'
Assert-LearningFixture (@($fixtureData.vaults.PSObject.Properties).Count -eq 2) 'New vault was not registered'
Assert-LearningFixture (@(Get-ChildItem -LiteralPath $fixtureRoot -Filter '*.learning-backup-*').Count -eq 1) 'Configuration backup was not retained'
$fixtureBefore = [IO.File]::ReadAllText($fixtureConfig)
$script:fixtureRunning = $true
Register-LearningVault $fixtureVault $fixtureConfig
Assert-LearningFixture ([IO.File]::ReadAllText($fixtureConfig) -eq $fixtureBefore) 'Already registered vault should be a no-op'
$fixtureNewVault = Join-Path $fixtureRoot 'second'
New-Item -ItemType Directory -Path $fixtureNewVault -Force | Out-Null
$fixtureBlocked = $false
try { Register-LearningVault $fixtureNewVault $fixtureConfig } catch { $fixtureBlocked = $_.Exception.Message.Contains('Close Obsidian') }
Assert-LearningFixture $fixtureBlocked 'Running Obsidian should prevent a registry edit'
Assert-LearningFixture ([IO.File]::ReadAllText($fixtureConfig) -eq $fixtureBefore) 'Running-app guard changed configuration'
$script:fixtureRunning = $false
$fixtureFreshConfig = Join-Path $fixtureRoot 'fresh/obsidian.json'
Register-LearningVault $fixtureVault $fixtureFreshConfig
$fixtureFresh = Get-Content -LiteralPath $fixtureFreshConfig -Raw | ConvertFrom-Json
Assert-LearningFixture (@($fixtureFresh.vaults.PSObject.Properties).Count -eq 1) 'First-install registry was not created'
Write-Output 'Vault registration fixtures passed: first install, preservation, backup, idempotence and running-app guard. Real Obsidian was untouched.'
