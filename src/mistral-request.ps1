$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
 $body = [Console]::In.ReadToEnd()
 $credential = Import-Clixml -LiteralPath (Join-Path $PSScriptRoot 'mistral-token.xml')
 $token = $credential.GetNetworkCredential().Password
 $response = Invoke-WebRequest -UseBasicParsing -Uri 'https://api.mistral.ai/v1/chat/completions' -Method Post -Headers @{ Authorization = 'Bearer ' + $token } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 120
 # Windows PowerShell may decode JSON without a charset as Latin-1. Decode raw bytes explicitly.
 $response.RawContentStream.Position = 0
 $reader = [IO.StreamReader]::new($response.RawContentStream, [Text.UTF8Encoding]::new($false, $true))
 try { $result = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
 $text = $result.choices[0].message.content
 if (-not $text -or $result.choices[0].finish_reason -eq 'length') { throw 'Missing or truncated answer' }
 Write-Output $text
} catch { [Console]::Error.WriteLine('Mistral request failed: check key, quota and network. No automatic paid fallback.'); exit 1 }
