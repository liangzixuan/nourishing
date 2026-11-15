#Requires -Version 7.3
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$config = Join-Path $root 'appwrite.config.json'
function Call-Appwrite($arguments) {
  $raw = & appwrite @arguments --config-file $config --raw
  if ($LASTEXITCODE -ne 0) { throw 'Account schema operation failed.' }
  return ($raw | ConvertFrom-Json)
}
$inventory = Call-Appwrite @('tablesdb','list-tables','--database-id','nourishing','--limit','100')
if ($inventory.total -gt 100) { throw 'Schema inventory needs pagination.' }
$snapshot = Join-Path $root ('.local/account-schema-before-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff') + '.json')
$inventory | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $snapshot -Encoding utf8
$specs = & node --input-type=module -e "import {tables} from './scripts/data-schema.mjs'; console.log(JSON.stringify(tables.filter(t=>t.id.startsWith('account_'))));"
if ($LASTEXITCODE -ne 0) { throw 'Account schema could not be read.' }
foreach ($spec in ($specs | ConvertFrom-Json)) {
  if (-not ($inventory.tables | Where-Object { $_.'$id' -eq $spec.id })) {
    $arguments = @('tablesdb','create-table','--database-id','nourishing','--table-id',$spec.id,'--name',$spec.name,'--row-security','--enabled')
    foreach ($column in $spec.columns) { $arguments += @('--columns',($column | ConvertTo-Json -Depth 5 -Compress)) }
    foreach ($index in $spec.indexes) { $arguments += @('--indexes',($index | ConvertTo-Json -Depth 5 -Compress)) }
    $null = Call-Appwrite $arguments
  }
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    $table = Call-Appwrite @('tablesdb','get-table','--database-id','nourishing','--table-id',$spec.id)
    if (-not $table.rowSecurity -or @($table.'$permissions').Count) { throw 'Account tables must be server-only.' }
    if (@($table.columns | Where-Object { $_.status -eq 'failed' }).Count -or @($table.indexes | Where-Object { $_.status -eq 'failed' }).Count) { throw 'Account schema failed.' }
    if (@($table.columns | Where-Object { $_.status -ne 'available' }).Count -eq 0 -and @($table.indexes | Where-Object { $_.status -ne 'available' }).Count -eq 0) { break }
    Start-Sleep -Seconds 1
  }
  foreach ($column in $spec.columns) {
    $actual = @($table.columns | Where-Object { $_.key -eq $column.key })
    if ($actual.Count -ne 1 -or $actual[0].status -ne 'available' -or $actual[0].type -ne $column.type -or $actual[0].required -ne $column.required) { throw "Account column differs: $($column.key)" }
    if ($column.type -eq 'varchar' -and $actual[0].size -ne $column.size) { throw 'Account column size differs.' }
  }
  foreach ($index in $spec.indexes) {
    $actual = @($table.indexes | Where-Object { $_.key -eq $index.key })
    if ($actual.Count -ne 1 -or $actual[0].status -ne 'available' -or $actual[0].type -ne $index.type -or ($actual[0].columns -join ',') -ne ($index.attributes -join ',')) { throw "Account index differs: $($index.key)" }
  }
  Write-Output "Verified server-only schema: $($spec.id)"
}
