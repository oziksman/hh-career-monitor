param([ValidateSet('mistral-small-latest', 'ministral-14b-2512')][string]$Model = 'mistral-small-latest')
$ErrorActionPreference = 'Stop'
$secret = Read-Host 'Mistral API key (hidden)' -AsSecureString
if ($secret.Length -eq 0) { throw 'API key cannot be empty' }
$credential = [PSCredential]::new('mistral', $secret)
$token = $credential.GetNetworkCredential().Password.Trim()
$credential = [PSCredential]::new('mistral', (ConvertTo-SecureString $token -AsPlainText -Force))
$stage = 'request'
try {
 [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
 $body = @{ model = $Model; max_tokens = 64; messages = @(@{ role = 'user'; content = 'Reply with OK.' }) } | ConvertTo-Json -Depth 5 -Compress
 $result = Invoke-RestMethod -Uri 'https://api.mistral.ai/v1/chat/completions' -Method Post -Headers @{ Authorization = 'Bearer ' + $token } -ContentType 'application/json' -Body $body -TimeoutSec 60
 $stage = 'response'
 if (-not $result.choices[0].message.content) { throw 'No response' }
} catch {
 $apiError = $_
 $status = 0
 if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
 $hint = switch ($status) {
  400 { 'Invalid request or model parameters.' }
  401 { 'Authentication rejected. Copy the full API key, not its name or masked preview.' }
  403 { 'Access denied. Check account activation and model access in Mistral Studio.' }
  404 { 'Requested model or endpoint is unavailable.' }
  429 { 'Rate limit or quota exceeded. Check API Limits and Usage in Mistral Studio.' }
  default { if ($status -ge 500) { 'Mistral service error. Try again later.' } else { 'Could not complete request. Check connection to api.mistral.ai.' } }
 }
 if ($stage -eq 'response') { $hint = 'API responded but returned no text. This is not a key authentication failure.' }
 Write-Host ('Key test failed. HTTP status: ' + $status + '. ' + $hint)
 # Print only the API's error message, never request headers or the full error record.
 try {
  $rawError = $apiError.ErrorDetails.Message
  if (-not $rawError -and $apiError.Exception.Response -is [Net.HttpWebResponse]) {
   $reader = [IO.StreamReader]::new($apiError.Exception.Response.GetResponseStream())
   try { $rawError = $reader.ReadToEnd() } finally { $reader.Dispose() }
  }
  if ($rawError) {
   $errorBody = $rawError | ConvertFrom-Json
   $apiMessage = $errorBody.message
   if (-not $apiMessage) { $apiMessage = $errorBody.error.message }
   if ($apiMessage -is [string]) {
    if ($token) { $apiMessage = $apiMessage.Replace($token, '[REDACTED]') }
    $apiMessage = $apiMessage -replace '[A-Za-z0-9_+/=-]{24,}', '[REDACTED]' -replace '[\x00-\x1f\x7f]', ' '
    Write-Host ('API detail: ' + $apiMessage.Substring(0, [Math]::Min(500, $apiMessage.Length)))
   }
  }
  $retryAfter = $apiError.Exception.Response.Headers['Retry-After']
  if ($retryAfter -match '^\d{1,8}$') { Write-Host ('Retry after seconds: ' + $retryAfter) }
 } catch { Write-Host 'API detail unavailable.' }
 $exception = $apiError.Exception
 for ($i = 0; $exception -and $i -lt 5; $i++) {
  Write-Host ('Error type: ' + $exception.GetType().Name)
  if ($exception -is [Net.WebException]) { Write-Host ('Network status: ' + $exception.Status) }
  if ($exception -is [Net.Sockets.SocketException]) { Write-Host ('Socket status: ' + $exception.SocketErrorCode) }
  $exception = $exception.InnerException
 }
 Write-Host 'No new key was saved. Existing saved key, if any, was not changed. Do not share the API key.'
 exit 1
} finally { $token = $null }
$credential | Export-Clixml -LiteralPath (Join-Path $PSScriptRoot 'mistral-token.xml')
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'analysis-model.json'), (@{model=$Model} | ConvertTo-Json -Compress), [Text.UTF8Encoding]::new($false))
Write-Host ('Selected model: ' + $Model)
Write-Host 'Mistral API test passed. Key saved encrypted for this Windows account. Restart Harness to load the updated analyzer.'
