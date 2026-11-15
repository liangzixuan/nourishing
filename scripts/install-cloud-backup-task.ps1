param(
  [Parameter(Mandatory=$true)][string]$ConfigPath,
  [Parameter(Mandatory=$true)][string]$CredentialPath,
  [string]$NodePath,
  [switch]$Install
)
$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
try {
  $workspace=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $config=(Resolve-Path -LiteralPath $ConfigPath).Path
  $credential=(Resolve-Path -LiteralPath $CredentialPath).Path
  $local=[IO.Path]::GetFullPath((Join-Path $workspace '.local'))+[IO.Path]::DirectorySeparatorChar
  foreach($path in @($config,$credential)){if(-not $path.StartsWith($local,[StringComparison]::OrdinalIgnoreCase)){throw 'Configuration and credentials must remain in the ignored local directory.'}}
  if([IO.DriveInfo]::new([IO.Path]::GetPathRoot($credential)).DriveFormat -cne 'NTFS'){throw 'Use NTFS credential storage.'}
  if(-not $NodePath){$NodePath=(Get-Command node.exe -ErrorAction Stop).Source}
  $node=(Resolve-Path -LiteralPath $NodePath).Path
  $version=[version]((& $node --version).Trim().TrimStart('v'))
  if($version -lt [version]'22.23.4'){throw 'Use the supported Node runtime.'}
  $wrapper=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'run-cloud-backup.ps1')).Path
  $powershell=Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$identity=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($config.ToLowerInvariant()))).Replace('-','').ToLowerInvariant().Substring(0,12)}finally{$sha.Dispose()}
  $taskName='Nourishing-Cloud-Backup-'+$identity
  $description='Nourishing cloud backup; workspace='+$workspace+'; config='+$config
  $arguments='-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+$wrapper+'" -ConfigPath "'+$config+'" -CredentialPath "'+$credential+'" -NodePath "'+$node+'"'
  $plan=[ordered]@{taskName=$taskName;installed=$false;dailyLocalTime='09:00';logon=$true;startWhenAvailable=$true;interactiveUser=$sid;runLevel='Limited';executionMinutes=20;command=$powershell;arguments=$arguments}
  if($Install){
    $existing=$null
    try{$existing=Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction Stop}catch{if($_.FullyQualifiedErrorId -cne 'CmdletizationQuery_NotFound,Get-ScheduledTask'){throw}}
    if($existing){
      if($existing.Description -cne $description){throw 'Existing task has another owner.'}
      [xml]$xml=Export-ScheduledTask -TaskName $taskName -TaskPath '\'
      if($xml.Task.Principals.Principal.UserId -cne $sid){throw 'Existing task belongs to another user.'}
      $same=$xml.Task.Actions.Exec.Command -ieq $powershell -and $xml.Task.Actions.Exec.Arguments -ceq $arguments -and $xml.Task.Actions.Exec.WorkingDirectory -ieq $workspace -and $xml.Task.Principals.Principal.LogonType -eq 'InteractiveToken' -and $existing.Principal.RunLevel.ToString() -eq 'Limited' -and $xml.Task.Settings.StartWhenAvailable -eq 'true' -and $xml.Task.Settings.MultipleInstancesPolicy -eq 'IgnoreNew' -and $xml.Task.Settings.ExecutionTimeLimit -eq 'PT20M' -and $xml.Task.Settings.Enabled -ne 'false' -and $xml.Task.Triggers.CalendarTrigger.ScheduleByDay.DaysInterval -eq '1' -and $xml.Task.Triggers.CalendarTrigger.StartBoundary -match 'T09:00:00' -and $xml.Task.Triggers.LogonTrigger.UserId -eq $sid -and $xml.Task.Triggers.LogonTrigger.Delay -eq 'PT30S'
      if($same){$plan.installed=$true;$plan|ConvertTo-Json -Depth 4;exit 0}
      $backup=Join-Path $local 'task-backups';New-Item -ItemType Directory -Path $backup -Force|Out-Null
      [IO.File]::WriteAllText((Join-Path $backup ($taskName+'.'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffffff')+'.xml')),$xml.OuterXml,[Text.UTF8Encoding]::new($false))
    }
    $action=New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $workspace
    $daily=New-ScheduledTaskTrigger -Daily -At '09:00'
    $logon=New-ScheduledTaskTrigger -AtLogOn -User $sid;$logon.Delay='PT30S'
    $principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -TaskPath '\' -Action $action -Trigger @($daily,$logon) -Principal $principal -Settings $settings -Description $description -Force|Out-Null
    $plan.installed=$true
  }
  $plan|ConvertTo-Json -Depth 4
} catch {Write-Output '{"status":"failed","code":"BACKUP_TASK_SETUP_FAILED"}';exit 1}
