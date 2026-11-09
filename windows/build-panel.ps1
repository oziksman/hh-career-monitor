$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:anycpu /codepage:65001 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /out:"$repo\HH-Monitor.exe" "$PSScriptRoot\MonitorPanel.cs"
if($LASTEXITCODE){throw 'Panel compilation failed'}
