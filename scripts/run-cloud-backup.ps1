param(
  [Parameter(Mandatory=$true)][string]$ConfigPath,
  [Parameter(Mandatory=$true)][string]$CredentialPath,
  [string]$NodePath
)
$ErrorActionPreference='Stop'
# A PowerShell 7 parent can pass incompatible modules to Windows PowerShell 5.1.
$env:PSModulePath=Join-Path $PSHOME 'Modules'
$process=$null;$started=$false;$secret=$null;$plain=$null;$pointer=[IntPtr]::Zero;$result=$null;$statusPath=$null
function Failure([string]$Code){return [ordered]@{status='failed';code=$Code}}
try {
  $config=(Resolve-Path -LiteralPath $ConfigPath).Path
  $credential=(Resolve-Path -LiteralPath $CredentialPath).Path
  $statusPath=[IO.Path]::ChangeExtension($config,'.status.json')
  $drive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($credential))
  if($drive.DriveFormat -cne 'NTFS'){throw 'Credential storage must be NTFS.'}
  if(-not $NodePath){$NodePath=(Get-Command node.exe -ErrorAction Stop).Source}
  $node=(Resolve-Path -LiteralPath $NodePath).Path
  $worker=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'cloud-drive-backup.mjs')).Path
  $secret=ConvertTo-SecureString ([IO.File]::ReadAllText($credential).Trim())
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if([string]::IsNullOrWhiteSpace($plain)){throw 'Backup credential is empty.'}
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName=$node
  # Windows file names cannot contain a double quote. Each absolute path is one argument.
  $start.Arguments='"'+$worker+'" --config "'+$config+'"'
  $start.WorkingDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
  $start.EnvironmentVariables['NOURISH_BACKUP_API_KEY']=$plain
  $process=[Diagnostics.Process]::new();$process.StartInfo=$start
  if(-not $process.Start()){throw 'Backup child did not start.'}
  $started=$true
  $start.EnvironmentVariables.Remove('NOURISH_BACKUP_API_KEY');$plain=$null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$pointer=[IntPtr]::Zero
  $secret.Dispose();$secret=$null
  $stdout=$process.StandardOutput.ReadToEndAsync();$stderr=$process.StandardError.ReadToEndAsync()
  if(-not $process.WaitForExit(18*60*1000)){$process.Kill();$process.WaitForExit();$result=Failure 'TIMEOUT'}
  else {
    $text=if($process.ExitCode -eq 0){$stdout.Result}else{$stderr.Result}
    try{$received=$text|ConvertFrom-Json -ErrorAction Stop}catch{$received=$null}
    if($process.ExitCode -eq 0 -and $received.status -in @('saved','current') -and $received.day -match '^\d{4}-\d{2}-\d{2}$' -and $received.file -match '^nourishing-cloud-\d{4}-\d{2}-\d{2}-[a-f0-9-]{36}[\\/]backup\.json$'){
      $result=[ordered]@{status=[string]$received.status;day=[string]$received.day;file=[string]$received.file;verifiedAt=[string]$received.verifiedAt;warnings=@($received.warnings|Where-Object{$_ -in @('unverified-archive-kept','unreadable-archive-kept','changed-archive-kept','retention-incomplete')})}
    } else {
      $code=[string]$received.code
      if($code -notmatch '^\d{3}$' -and $code -notin @('EACCES','EPERM','ENOSPC','ENOENT','EIO','EBUSY','ETIMEDOUT')){$code='BACKUP_FAILED'}
      $result=Failure $code
    }
  }
} catch {$result=Failure 'BACKUP_RUNNER_FAILED'}
finally {
  if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
  if($secret){$secret.Dispose()};$plain=$null
  if($process){if($started -and -not $process.HasExited){try{$process.Kill();$process.WaitForExit()}catch{}};$process.Dispose()}
}
$result.attemptedAt=[DateTime]::UtcNow.ToString('o')
if($statusPath){
  $temporary=$statusPath+'.pending-'+[Guid]::NewGuid().ToString('N')
  try{
    $lastSuccess=$null
    if(Test-Path -LiteralPath $statusPath){try{$previous=[IO.File]::ReadAllText($statusPath)|ConvertFrom-Json;if($previous.lastSuccess.file -match '^nourishing-cloud-\d{4}-\d{2}-\d{2}-[a-f0-9-]{36}[\\/]backup\.json$'){$lastSuccess=[ordered]@{file=[string]$previous.lastSuccess.file;verifiedAt=[string]$previous.lastSuccess.verifiedAt}}}catch{}}
    if($result.status -in @('saved','current')){$lastSuccess=[ordered]@{file=$result.file;verifiedAt=$result.verifiedAt}}
    $result.lastSuccess=$lastSuccess
    [IO.File]::WriteAllText($temporary,($result|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporary -Destination $statusPath -Force
  }catch{$result.status='failed';$result.code='STATUS_WRITE_FAILED'}
  finally{try{if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force}}catch{$result.status='failed';$result.code='STATUS_WRITE_FAILED'}}
}
$result|ConvertTo-Json -Depth 4 -Compress
if($result.status -eq 'failed'){exit 1}
