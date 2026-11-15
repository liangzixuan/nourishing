#Requires -Version 7.3
param([Parameter(Mandatory)][ValidateSet('fasting_dispatch','push_accounts','push_deliveries')][string]$TableId)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$config = Join-Path $root 'appwrite.config.json'
function Invoke-PrivateSchema($arguments) {
  $raw = & appwrite @arguments --config-file $config --raw
  if ($LASTEXITCODE -ne 0) { throw 'Private table schema operation failed.' }
  return ($raw | ConvertFrom-Json)
}
$inventory = Invoke-PrivateSchema @('tablesdb','list-tables','--database-id','nourishing','--limit','100')
if ($inventory.total -gt 100) { throw 'Schema inventory requires pagination before changes.' }
$snapshot = Join-Path $root (('.local/' + $TableId + '-schema-before-') + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '.json')
$inventory | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $snapshot -Encoding utf8
$specText = & node --input-type=module -e "import {tables} from './scripts/data-schema.mjs'; console.log(JSON.stringify(tables.find(t=>t.id===process.argv[1])));" $TableId
if ($LASTEXITCODE -ne 0) { throw 'Private table schema definition could not be read.' }
$spec = $specText | ConvertFrom-Json
$existing = @($inventory.tables | Where-Object { $_.'$id' -eq $spec.id })
if ($existing.Count -gt 1) { throw 'Private table table identity is ambiguous.' }
if ($existing.Count -eq 0) {
  $arguments = @('tablesdb','create-table','--database-id','nourishing','--table-id',$spec.id,'--name',$spec.name,'--row-security','--enabled')
  foreach ($column in $spec.columns) { $arguments += @('--columns',($column | ConvertTo-Json -Depth 5 -Compress)) }
  foreach ($index in $spec.indexes) { $arguments += @('--indexes',($index | ConvertTo-Json -Depth 5 -Compress)) }
  $null = Invoke-PrivateSchema $arguments
}
for ($attempt=0; $attempt -lt 30; $attempt++) {
  $table = Invoke-PrivateSchema @('tablesdb','get-table','--database-id','nourishing','--table-id',$spec.id)
  if (-not $table.rowSecurity -or -not $table.enabled -or @($table.'$permissions').Count -gt 0) { throw 'Private table table must be enabled and server-only.' }
  if (@($table.columns | Where-Object { $_.status -eq 'failed' }).Count -or @($table.indexes | Where-Object { $_.status -eq 'failed' }).Count) { throw 'Private table schema creation failed.' }
  if (@($table.columns | Where-Object { $_.status -ne 'available' }).Count -eq 0 -and @($table.indexes | Where-Object { $_.status -ne 'available' }).Count -eq 0) { break }
  Start-Sleep -Seconds 1
}
if (@($table.columns).Count -ne @($spec.columns).Count -or @($table.indexes).Count -ne @($spec.indexes).Count) { throw 'Private table schema contains an unexpected definition.' }
foreach ($column in $spec.columns) {
  $actual = @($table.columns | Where-Object { $_.key -eq $column.key })
  if ($actual.Count -ne 1 -or $actual[0].status -ne 'available' -or $actual[0].type -ne $column.type -or $actual[0].required -ne $column.required -or $actual[0].size -ne $column.size -or $actual[0].array) { throw "Private table column differs: $($column.key)" }
}
foreach ($index in $spec.indexes) {
  $actual = @($table.indexes | Where-Object { $_.key -eq $index.key })
  if ($actual.Count -ne 1 -or $actual[0].status -ne 'available' -or $actual[0].type -ne $index.type -or ($actual[0].columns -join ',') -ne ($index.attributes -join ',')) { throw "Private table index differs: $($index.key)" }
}
@{table=$spec.id;created=($existing.Count -eq 0);rowSecurity=$table.rowSecurity;permissions=@($table.'$permissions');snapshot=$snapshot} | ConvertTo-Json -Compress
