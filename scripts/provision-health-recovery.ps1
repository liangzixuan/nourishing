$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$config = Join-Path $root 'appwrite.config.json'
$backup = Join-Path $root ('.local/health-recovery-schema-before-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '.json')
function Read-Table($tableId) {
  $raw = & appwrite tablesdb get-table --database-id nourishing --table-id $tableId --config-file $config --raw
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect $tableId" }
  $table = $raw | ConvertFrom-Json
  if (-not $table.rowSecurity -or @($table.'$permissions').Count -ne 0) { throw "Unexpected access for $tableId" }
  return $table
}
$heads = Read-Table 'workspace_heads'
$recoveries = Read-Table 'workspace_recoveries'
@($heads, $recoveries) | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $backup -Encoding utf8
$specs = @(
  @{table='workspace_heads';key='recoverySequence';min=0;default=0},
  @{table='workspace_recoveries';key='snapshotId';min=1}
)
foreach ($spec in $specs) {
  $table = Read-Table $spec.table
  $column = @($table.columns | Where-Object { $_.key -eq $spec.key })
  if ($column.Count -eq 0) {
    $arguments = @('tablesdb','create-integer-column','--database-id','nourishing','--table-id',$spec.table,'--key',$spec.key,'--required=false','--min',"$($spec.min)",'--max','9007199254740991','--config-file',$config,'--raw')
    if ($spec.ContainsKey('default')) { $arguments += @('--xdefault',"$($spec.default)") }
    & appwrite @arguments | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not create $($spec.key)" }
  }
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    $column = (Read-Table $spec.table).columns | Where-Object { $_.key -eq $spec.key }
    if ($column.status -eq 'available') { break }
    if ($column.status -eq 'failed') { throw "Column failed: $($spec.key)" }
    Start-Sleep -Seconds 1
  }
  if ($column.status -ne 'available' -or $column.type -ne 'integer' -or $column.required -or $column.min -ne $spec.min -or $column.max -ne 9007199254740991) { throw "Column differs: $($spec.key)" }
  if ($spec.ContainsKey('default') -and $column.default -ne $spec.default) { throw "Default differs: $($spec.key)" }
}
$index = (Read-Table 'workspace_recoveries').indexes | Where-Object { $_.key -eq 'owner_snapshot' }
if (-not $index) {
  & appwrite tablesdb create-index --database-id nourishing --table-id workspace_recoveries --key owner_snapshot --type unique --columns ownerId --columns snapshotId --config-file $config --raw | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not create recovery index' }
}
for ($attempt=0; $attempt -lt 30; $attempt++) {
  $index = (Read-Table 'workspace_recoveries').indexes | Where-Object { $_.key -eq 'owner_snapshot' }
  if ($index.status -eq 'available') { break }
  if ($index.status -eq 'failed') { throw 'Recovery index failed' }
  Start-Sleep -Seconds 1
}
if ($index.status -ne 'available' -or $index.type -ne 'unique' -or ($index.columns -join ',') -ne 'ownerId,snapshotId') { throw 'Recovery index differs' }
Write-Output 'Health recovery schema verified; prior schema saved locally.'
