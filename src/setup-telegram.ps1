$ErrorActionPreference = 'Stop'
try {
    Write-Host 'Create a dedicated bot with @BotFather (/newbot). Open your bot and send /start.'
    $secret = Read-Host 'Paste the bot token (hidden)' -AsSecureString
    $credential = [PSCredential]::new('telegram-bot', $secret)
    $token = $credential.GetNetworkCredential().Password
    $base = 'https://api.telegram.org/bot' + $token
    $me = Invoke-RestMethod -Uri ($base + '/getMe') -TimeoutSec 20
    Write-Host ('Bot: @' + $me.result.username)
    Read-Host 'Send /start to this bot now, then press Enter' | Out-Null
    $updates = Invoke-RestMethod -Uri ($base + '/getUpdates') -TimeoutSec 20
    $chats = @($updates.result | ForEach-Object { $_.message.chat } | Where-Object { $_.type -eq 'private' } | Sort-Object id -Unique)
    if ($chats.Count -eq 0) { throw 'No private chat found. Send /start to the bot and run setup again.' }
    for ($i = 0; $i -lt $chats.Count; $i++) { Write-Host "$($i + 1): $($chats[$i].first_name) @$($chats[$i].username) [$($chats[$i].id)]" }
    $selected = [int](Read-Host 'Choose YOUR chat number') - 1
    if ($selected -lt 0 -or $selected -ge $chats.Count) { throw 'Invalid selection' }
    $credential | Export-Clixml -LiteralPath (Join-Path $PSScriptRoot 'telegram-token.xml')
    @{ chatId = [string]$chats[$selected].id } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'telegram-chat.json') -Encoding UTF8
    $body = @{ chat_id = [string]$chats[$selected].id; text = 'Career Review: Telegram connected. Vacancy monitoring is not started yet.' } | ConvertTo-Json
    $sent = Invoke-RestMethod -Uri ($base + '/sendMessage') -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 20
    if (-not $sent.ok) { throw 'Test message failed' }
    Write-Host 'Saved. Token is encrypted with Windows DPAPI for your Windows account. Test notification sent.'
} catch {
    Write-Host 'Setup did not complete. Check the token, /start message and network. No token is printed.'
    exit 1
}
