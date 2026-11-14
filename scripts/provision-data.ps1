$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$config = Join-Path $root 'appwrite.config.json'
$tables = Get-Content -LiteralPath (Join-Path $root '.local/data-schema.json') -Raw | ConvertFrom-Json
foreach ($spec in $tables) {
  $raw = & appwrite tablesdb get-table --database-id nourishing --table-id $spec.id --config-file $config --raw 2>$null
  if ($LASTEXITCODE -ne 0) {
    $args = @('tablesdb','create-table','--database-id','nourishing','--table-id',$spec.id,'--name',$spec.name,'--row-security','--enabled','--config-file',$config,'--raw')
    foreach ($column in $spec.columns) { $args += @('--columns',($column | ConvertTo-Json -Depth 5 -Compress)) }
    foreach ($index in $spec.indexes) { $args += @('--indexes',($index | ConvertTo-Json -Depth 5 -Compress)) }
    $raw = & appwrite @args
    if ($LASTEXITCODE -ne 0) { throw "Creation failed: $($spec.id)" }
  }
  $table = $raw | ConvertFrom-Json
  if (-not $table.rowSecurity -or @($table.'$permissions').Count -gt 0) { throw "Unexpected table access: $($spec.id)" }
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $table = & appwrite tablesdb get-table --database-id nourishing --table-id $spec.id --config-file $config --raw | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw 'Schema readiness lookup failed' }
    if (@($table.columns | Where-Object { $_.status -eq 'failed' }).Count -or @($table.indexes | Where-Object { $_.status -eq 'failed' }).Count) { throw "Schema failed: $($spec.id)" }
    if (@($table.columns | Where-Object { $_.status -ne 'available' }).Count -eq 0 -and @($table.indexes | Where-Object { $_.status -ne 'available' }).Count -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  foreach ($column in $spec.columns) { if (-not ($table.columns | Where-Object { $_.key -eq $column.key -and $_.status -eq 'available' })) { throw "Missing column: $($spec.id)/$($column.key)" } }
  foreach ($index in $spec.indexes) { if (-not ($table.indexes | Where-Object { $_.key -eq $index.key -and $_.status -eq 'available' })) { throw "Missing index: $($spec.id)/$($index.key)" } }
  Write-Output "Ready: $($spec.id)"
}
