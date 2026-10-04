[CmdletBinding()]
param(
    [switch]$NoLaunch,
    [switch]$CheckOnly,
    [switch]$StartOnly,
    [switch]$SkipVoice,
    [switch]$SkipBrowser,
    [string]$Distro = 'Ubuntu-24.04'
)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
function Invoke-LearningCommand {
    param([string]$Executable, [string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Executable failed (exit $LASTEXITCODE). Re-run setup after resolving the error above." }
}
function Install-LearningApp {
    param([string]$Id)
    Invoke-LearningCommand 'winget.exe' @('install', '--exact', '--id', $Id, '--source', 'winget', '--silent', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity')
}
function New-LearningShortcut {
    param([string]$Name, [string]$Script, [string]$ExtraArguments = '')
    $taskDesktop = [Environment]::GetFolderPath('Desktop')
    $taskShell = New-Object -ComObject WScript.Shell
    $taskLink = $taskShell.CreateShortcut((Join-Path $taskDesktop "$Name.lnk"))
    $taskLink.TargetPath = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $taskLink.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $Script + '" ' + $ExtraArguments
    $taskLink.WorkingDirectory = $taskRoot
    $taskLink.Description = 'Set up Pi and Obsidian, then resume your learning workspace'
    $taskLink.Save()
}
function Get-LearningPython {
    $taskPy = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($taskPy) {
        $taskPython = & $taskPy.Source -3.13 -c 'import sys; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0 -and $taskPython -and (Test-Path -LiteralPath $taskPython)) { return $taskPython }
    }
    $taskPython = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313\python.exe'
    if (Test-Path -LiteralPath $taskPython) { return $taskPython }
    return $null
}
$taskObsidian = Join-Path $env:LOCALAPPDATA 'Programs\Obsidian\Obsidian.exe'
if ($CheckOnly) {
    Push-Location $taskRoot
    try { Invoke-LearningCommand 'wsl.exe' @('-d', $Distro, '--', 'bash', 'work/bootstrap.sh', '--check') }
    finally { Pop-Location }
    if (-not (Test-Path -LiteralPath $taskObsidian)) { throw 'Obsidian is not installed.' }
    if (-not $SkipVoice) {
        foreach ($taskVoiceFile in @('work/runtime/voice-model/model.bin', 'work/runtime/voice/Scripts/python.exe')) {
            if (-not (Test-Path -LiteralPath (Join-Path $taskRoot $taskVoiceFile))) { throw 'Voice tools are not installed. Run setup or use -SkipVoice.' }
        }
    }
    return
}
if (-not $StartOnly) {
    if (-not (Get-Command wsl.exe -ErrorAction SilentlyContinue)) { throw 'Install Windows Subsystem for Linux, restart Windows, then run setup again.' }
    $taskDistros = ((& wsl.exe --list --quiet) -join "`n") -replace "`0", ''
    if ($LASTEXITCODE -ne 0 -or $taskDistros -notmatch ('(?m)^\s*' + [regex]::Escape($Distro) + '\s*$')) {
        Invoke-LearningCommand 'wsl.exe' @('--install', '-d', $Distro, '--no-launch')
        throw "WSL installation was requested. Restart Windows if prompted, open $Distro once to create your Linux user, then run setup again."
    }
    if (-not (Test-Path -LiteralPath $taskObsidian)) { Install-LearningApp 'Obsidian.Obsidian' }
    if (-not (Test-Path -LiteralPath $taskObsidian)) { throw 'Obsidian installed in a different location. Install it for this Windows user, then run setup again.' }
    if (-not (Get-Command wt.exe -ErrorAction SilentlyContinue)) { Install-LearningApp 'Microsoft.WindowsTerminal' }
    Push-Location $taskRoot
    try {
        $taskBootstrap = @('-d', $Distro, '--', 'bash', 'work/bootstrap.sh')
        if ($SkipBrowser) { $taskBootstrap += '--skip-browser' }
        Invoke-LearningCommand 'wsl.exe' $taskBootstrap
    } finally { Pop-Location }
    if (-not $SkipVoice) {
        $taskPython = Get-LearningPython
        if (-not $taskPython) { Install-LearningApp 'Python.Python.3.13'; $taskPython = Get-LearningPython }
        if (-not $taskPython) { throw 'Python 3.13 is unavailable. Reopen setup after installing Python 3.13.' }
        $taskVoice = Join-Path $taskRoot 'work/runtime/voice/Scripts/python.exe'
        if (-not (Test-Path -LiteralPath $taskVoice)) { Invoke-LearningCommand $taskPython @('-m', 'venv', (Join-Path $taskRoot 'work/runtime/voice')) }
        Invoke-LearningCommand $taskVoice @('-m', 'pip', 'install', '-r', (Join-Path $taskRoot 'work/voice-requirements.txt'), '--disable-pip-version-check')
        if (-not (Test-Path -LiteralPath (Join-Path $taskRoot 'work/runtime/voice-model/model.bin'))) { Invoke-LearningCommand $taskVoice @((Join-Path $taskRoot 'work/voice-notes.py'), '--prepare') }
    }
    . (Join-Path $taskRoot 'work/register-vault.ps1')
    Register-LearningVault (Join-Path $taskRoot 'outputs/Learning Vault')
    New-LearningShortcut 'Start Learning (Pi)' (Join-Path $taskRoot 'Setup-Learning.ps1') ('-StartOnly -Distro "' + $Distro + '"')
    New-LearningShortcut 'Set Up Learning (Pi)' (Join-Path $taskRoot 'Setup-Learning.ps1') ('-Distro "' + $Distro + '"')
}
if ($NoLaunch) { Write-Host 'Setup completed. Use the Start Learning (Pi) desktop shortcut.'; return }
if (-not $env:WT_SESSION) {
    $taskTerminal = Get-Command wt.exe -ErrorAction SilentlyContinue
    if (-not $taskTerminal) { throw 'Windows Terminal is unavailable. Reopen setup after installing Microsoft.WindowsTerminal.' }
    $taskLaunchArguments = '-w new --title "Start Learning" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $taskRoot 'Setup-Learning.ps1') + '" -StartOnly -Distro "' + $Distro + '"'
    Start-Process -FilePath $taskTerminal.Source -ArgumentList $taskLaunchArguments
    return
}
$taskNote = Join-Path $taskRoot 'outputs/Learning Vault/Current Lesson.md'
if (-not (Test-Path -LiteralPath $taskNote)) { $taskNote = Join-Path $taskRoot 'outputs/Learning Vault/Home.md' }
if (-not (Test-Path -LiteralPath $taskNote)) { throw 'Workspace not set up yet. Double-click Setup-Learning.cmd first.' }
Start-Process -FilePath $taskObsidian -ArgumentList ('obsidian://open?path=' + [Uri]::EscapeDataString($taskNote))
Push-Location $taskRoot
try { Invoke-LearningCommand 'wsl.exe' @('-d', $Distro, '--', 'bash', 'work/start-learning.sh') }
finally { Pop-Location }
