param(
    [Parameter(Mandatory=$true)][string]$NodeExe,
    [Parameter(Mandatory=$true)][string]$NodeLicense,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\.local\portable')
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$NodeExe = (Resolve-Path -LiteralPath $NodeExe).Path
$NodeLicense = (Resolve-Path -LiteralPath $NodeLicense).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
$folder = Join-Path $output 'HH-Monitor'
$archive = Join-Path $output 'HH-Monitor-Windows-x64.zip'
if ((Test-Path -LiteralPath $folder) -or (Test-Path -LiteralPath $archive)) { throw 'Choose a new output directory.' }
foreach ($sub in @('runtime','src','scripts','node_modules')) {
    New-Item -ItemType Directory -Path (Join-Path $folder $sub) -Force | Out-Null
}
Copy-Item -LiteralPath $NodeExe -Destination "$folder/runtime/node.exe"
Copy-Item -LiteralPath $NodeLicense -Destination "$folder/runtime/NODE-LICENSE.txt"
Copy-Item -LiteralPath "$repo/node_modules/playwright-core" -Destination "$folder/node_modules" -Recurse
$modules = @('monitor-core.cjs','search-scan.cjs','republication.cjs','publication-filter.cjs','delivery-history.cjs','status.cjs','telegram-analysis.cjs','telegram-api.ps1','browser-window.cjs','vacancy-text.cjs','analysis-router.cjs','opencode-analysis.cjs','mistral-request.ps1','setup-mistral.ps1')
foreach ($file in $modules) { Copy-Item -LiteralPath "$repo/src/$file" -Destination "$folder/src" }
foreach ($file in @('background.cjs','panel.cjs','telegram-setup.cjs')) { Copy-Item -LiteralPath "$repo/scripts/$file" -Destination "$folder/scripts" }
foreach ($file in @('portable-browser.cjs','login.cjs')) { Copy-Item -LiteralPath "$PSScriptRoot/portable/$file" -Destination "$folder/scripts" }
foreach ($file in @('Вход в HH.cmd','Начните здесь.txt')) { Copy-Item -LiteralPath "$PSScriptRoot/portable/$file" -Destination $folder }
Copy-Item -LiteralPath "$repo/LICENSE" -Destination $folder
[IO.File]::WriteAllText("$folder/src/monitor-config.json",'{"enabled":false,"intervalMinutes":15,"searchUrl":"","headless":true,"maxSearchPages":10,"maxNotificationsPerRun":20}')
function Replace-Required([string]$Text,[string]$Before,[string]$After) {
    if (!$Text.Contains($Before)) { throw "Portable build source changed: $Before" }
    return $Text.Replace($Before,$After)
}
$panel = [IO.File]::ReadAllText("$folder/scripts/panel.cjs")
$panel = Replace-Required $panel "dir??=require('node:fs').existsSync(path.join(root,'monitor-config.json'))?root:path.resolve(__dirname,'../src');" "dir??=path.resolve(__dirname,'../src');"
$panel = Replace-Required $panel ' const before=await inspect(dir);' @'
 const before=await inspect(dir);
 if(!before.searchUrl)throw Error('Сначала сохраните ссылку на выдачу HH.');
 if(!(await json(dir,'telegram-chat.json',true))?.chatId)throw Error('Сначала подключите Telegram в панели.');
 require('./portable-browser.cjs').findBrowser();
'@
[IO.File]::WriteAllText("$folder/scripts/panel.cjs",$panel)
$core = [IO.File]::ReadAllText("$folder/src/monitor-core.cjs")
$core = Replace-Required $core "require('playwright')" "require('playwright-core')"
$core = Replace-Required $core "...(process.env.CAREER_BROWSER_PATH?{executablePath:process.env.CAREER_BROWSER_PATH}:{})" "executablePath:require('../scripts/portable-browser.cjs').findBrowser()"
[IO.File]::WriteAllText("$folder/src/monitor-core.cjs",$core)
$source = [IO.File]::ReadAllText("$PSScriptRoot/MonitorPanel.cs")
$source = Replace-Required $source 'Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"nodejs","node.exe")' 'Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"runtime","node.exe")'
[IO.File]::WriteAllText("$output/PortablePanel.cs",$source)
& "$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe" /nologo /target:winexe /platform:anycpu /codepage:65001 /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll ("/out:" + (Join-Path $folder 'HH-Monitor.exe')) (Join-Path $output 'PortablePanel.cs')
if ($LASTEXITCODE) { throw 'Panel compilation failed' }
Compress-Archive -LiteralPath $folder -DestinationPath $archive
Write-Output $archive
