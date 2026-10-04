function Register-LearningVault {
    param(
        [Parameter(Mandatory = $true)][string]$VaultPath,
        [string]$ConfigPath = (Join-Path $env:APPDATA 'obsidian/obsidian.json')
    )
    $taskVaultPath = (Resolve-Path -LiteralPath $VaultPath).Path
    $taskConfig = [PSCustomObject]@{ vaults = [PSCustomObject]@{} }
    if (Test-Path -LiteralPath $ConfigPath) {
        $taskConfig = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
        if (-not $taskConfig -or $taskConfig -isnot [PSCustomObject]) { throw 'Obsidian configuration is invalid. It was not changed.' }
        if (-not $taskConfig.PSObject.Properties['vaults']) { $taskConfig | Add-Member -NotePropertyName vaults -NotePropertyValue ([PSCustomObject]@{}) }
    }
    if ($taskConfig.vaults -isnot [PSCustomObject]) { throw 'Obsidian vault registry is invalid. It was not changed.' }
    foreach ($taskVault in $taskConfig.vaults.PSObject.Properties) {
        if ([string]::Equals([string]$taskVault.Value.path, $taskVaultPath, [StringComparison]::OrdinalIgnoreCase)) { return }
    }
    if (Get-Process -Name Obsidian -ErrorAction SilentlyContinue) {
        throw 'Close Obsidian once and re-run setup so the new notebook can be registered without replacing settings from a running app. Existing notes were not changed.'
    }
    $taskId = [Guid]::NewGuid().ToString('N').Substring(0, 16)
    $taskConfig.vaults | Add-Member -NotePropertyName $taskId -NotePropertyValue ([PSCustomObject]@{
        path = $taskVaultPath; ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); open = $true
    })
    New-Item -ItemType Directory -Path (Split-Path -Parent $ConfigPath) -Force | Out-Null
    if (Test-Path -LiteralPath $ConfigPath) {
        Copy-Item -LiteralPath $ConfigPath -Destination ($ConfigPath + '.learning-backup-' + [Guid]::NewGuid().ToString('N'))
    }
    $taskTemporary = $ConfigPath + '.tmp-' + [Guid]::NewGuid().ToString('N')
    [IO.File]::WriteAllText($taskTemporary, ($taskConfig | ConvertTo-Json -Depth 50), (New-Object Text.UTF8Encoding $false))
    Move-Item -LiteralPath $taskTemporary -Destination $ConfigPath -Force
}
