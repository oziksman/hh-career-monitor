$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
 $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
 if ($request.method -notin @('getUpdates','answerCallbackQuery','sendMessage')) { throw 'Invalid method' }
 $chat = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'telegram-chat.json') -Raw | ConvertFrom-Json
 if ($chat.encryptedToken) {
  $credential = [PSCredential]::new('telegram-bot',(ConvertTo-SecureString $chat.encryptedToken))
 } else {
  $credential = Import-Clixml -LiteralPath (Join-Path $PSScriptRoot 'telegram-token.xml')
 }
 $token = $credential.GetNetworkCredential().Password
 if ($request.method -eq 'sendMessage') {
  $request.body | Add-Member -NotePropertyName chat_id -NotePropertyValue $chat.chatId -Force
 }
 $body = $request.body | ConvertTo-Json -Depth 12 -Compress
 $result = Invoke-RestMethod -Uri ('https://api.telegram.org/bot' + $token + '/' + $request.method) -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 25
 if (-not $result.ok) { throw 'API refused' }
 ConvertTo-Json -InputObject $result.result -Depth 20 -Compress
} catch { [Console]::Error.WriteLine('Telegram API failed'); exit 1 }
