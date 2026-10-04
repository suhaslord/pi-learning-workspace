@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-Learning.ps1" %*
if errorlevel 1 pause
