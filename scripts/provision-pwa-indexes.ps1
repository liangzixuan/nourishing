#Requires -Version 7.3
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$config=Join-Path $root 'appwrite.config.json'
function Invoke-Schema($arguments) {
 $raw=& appwrite @arguments --config-file $config --raw
 if($LASTEXITCODE -ne 0){throw 'Schema operation failed.'}
 return ($raw | ConvertFrom-Json)
}
$changes=@(
 @{table='backup_reviews';key='expiry';columns=@('expiresAt')},
 @{table='push_deliveries';key='owner_created';columns=@('ownerId','createdAt')},
 @{table='push_deliveries';key='created';columns=@('createdAt')}
)
foreach($change in $changes){
 $table=Invoke-Schema @('tablesdb','get-table','--database-id','nourishing','--table-id',$change.table)
 if(-not $table.rowSecurity -or @($table.'$permissions').Count){throw 'Expected a private table.'}
 $snapshot=Join-Path $root ('.local/'+$change.table+'-index-before-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')+'.json')
 $table | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $snapshot -Encoding utf8
 $existing=@($table.indexes | Where-Object key -eq $change.key)
 if($existing.Count -eq 0){
  $arguments=@('tablesdb','create-index','--database-id','nourishing','--table-id',$change.table,'--key',$change.key,'--type','key')
  foreach($column in $change.columns){$arguments+=@('--columns',$column)}
  $null=Invoke-Schema $arguments
 }
 for($attempt=0;$attempt -lt 30;$attempt++){
  $table=Invoke-Schema @('tablesdb','get-table','--database-id','nourishing','--table-id',$change.table)
  $index=@($table.indexes | Where-Object key -eq $change.key)
  if($index.Count -ne 1 -or $index[0].type -ne 'key' -or ($index[0].columns -join ',') -ne ($change.columns -join ',')){throw 'Index definition differs.'}
  if($index[0].status -eq 'available'){break}
  if($index[0].status -eq 'failed'){throw 'Index creation failed.'}
  Start-Sleep -Seconds 1
 }
 if($index[0].status -ne 'available'){throw 'Index is not yet available.'}
 @{table=$change.table;index=$change.key;status=$index[0].status;created=($existing.Count -eq 0);snapshot=$snapshot} | ConvertTo-Json -Compress
}
