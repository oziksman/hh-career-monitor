$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
 $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
 if ($request.method -notin @('getUpdates','answerCallbackQuery','sendMessage')) { throw 'Invalid method' }
 $credential = Import-Clixml -LiteralPath (Join-Path $PSScriptRoot 'telegram-token.xml')
 $token = $credential.GetNetworkCredential().Password
 if ($request.method -eq 'sendMessage') {
  $chat = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'telegram-chat.json') -Raw | ConvertFrom-Json
  $request.body | Add-Member -NotePropertyName chat_id -NotePropertyValue $chat.chatId -Force
 }
 $body = $request.body | ConvertTo-Json -Depth 12 -Compress
 $result = Invoke-RestMethod -Uri ('https://api.telegram.org/bot' + $token + '/' + $request.method) -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 25
 if (-not $result.ok) { throw 'API refused' }
 ConvertTo-Json -InputObject $result.result -Depth 20 -Compress
} catch { [Console]::Error.WriteLine('Telegram API failed'); exit 1 }
