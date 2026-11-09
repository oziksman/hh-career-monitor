@echo off
chcp 65001 >nul
"%~dp0runtime\node.exe" "%~dp0scripts\login.cjs"
if errorlevel 1 pause
