# Remet en route le son RØDECaster après un redémarrage du PC (sans droits admin) :
#   1. lance l'utilitaire RØDE de la barre des tâches s'il ne tourne pas ;
#   2. réactive les périphériques RØDECaster que Windows a désactivés (System, Virtual A/B, Fader1-9…) ;
#   3. remet le routage des stations : HDMI 1 (station 1) -> Virtual A, HDMI 4 (station 2) -> Virtual B.
# Ensuite, redémarrer OBS s'il était déjà ouvert (sa source Mic/Aux doit retrouver « System (RØDECaster) »).
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$routage = Join-Path $here 'routage_windows.ps1'

Write-Host ''
Write-Host '  STACK 03 - réparation du son RØDECaster' -ForegroundColor Magenta
Write-Host ''

# 1. Utilitaire RØDE
$tray = Get-ChildItem 'C:\Program Files\RØDE Microphones\*\service\RodecasterSystray.exe', 'C:\Program Files\RODE Microphones\*\service\RodecasterSystray.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if (Get-Process RodecasterSystray -ErrorAction SilentlyContinue) { Write-Host '  [ok] utilitaire RØDE déjà lancé' }
elseif ($tray) { Start-Process $tray.FullName; Start-Sleep 4; Write-Host '  [ok] utilitaire RØDE lancé' }
else { Write-Host '  [!!] utilitaire RØDE introuvable (pilote virtuel RØDECaster installé ?)' -ForegroundColor Yellow }

# 2. Périphériques désactivés (DeviceState avec le bit 0x10000000)
$base = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio'
$ids = @()
foreach ($flow in 'Render', 'Capture') {
  $pre = if ($flow -eq 'Render') { '{0.0.0.00000000}.' } else { '{0.0.1.00000000}.' }
  Get-ChildItem "$base\$flow" | ForEach-Object {
    $s = (Get-ItemProperty $_.PSPath).DeviceState
    $n = (Get-ItemProperty "$($_.PSPath)\Properties" -ErrorAction SilentlyContinue).'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
    if (($s -band 0x10000000) -and ($n -match 'R.DECaster|RODECaster')) { $ids += $pre + $_.PSChildName }
  }
}
if ($ids.Count) { & $routage -Enable $ids | Out-Null; Write-Host "  [ok] $($ids.Count) périphérique(s) RØDECaster réactivé(s)" }
else { Write-Host '  [ok] aucun périphérique RØDECaster désactivé' }

# 3. Routage des stations (« Écouter ce périphérique »), retrouvé par nom
function Find-Endpoint($flow, $pattern) {
  $pre = if ($flow -eq 'Render') { '{0.0.0.00000000}.' } else { '{0.0.1.00000000}.' }
  foreach ($k in Get-ChildItem "$base\$flow") {
    if ((Get-ItemProperty $k.PSPath).DeviceState -ne 1) { continue }
    $p = Get-ItemProperty "$($k.PSPath)\Properties" -ErrorAction SilentlyContinue
    $full = "$($p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2') ($($p.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'))"
    if ($full -match $pattern) { return $pre + $k.PSChildName }
  }
}
$vA = Find-Endpoint 'Render' '^Virtual A \(R'
$vB = Find-Endpoint 'Render' '^Virtual B \(R'
$h1 = Find-Endpoint 'Capture' 'HDMI Recorder \(1\) Audio'
$h4 = Find-Endpoint 'Capture' 'HDMI Recorder \(4\) Audio'
if ($h1 -and $vA) { & $routage -Listen $h1 -Target $vA | Out-Null; Write-Host '  [ok] station 1 (HDMI 1) -> Virtual A' } else { Write-Host '  [!!] station 1 : HDMI 1 ou Virtual A introuvable' -ForegroundColor Yellow }
if ($h4 -and $vB) { & $routage -Listen $h4 -Target $vB | Out-Null; Write-Host '  [ok] station 2 (HDMI 4) -> Virtual B' } else { Write-Host '  [!!] station 2 : HDMI 4 ou Virtual B introuvable' -ForegroundColor Yellow }

if (Get-Process obs64 -ErrorAction SilentlyContinue) {
  Write-Host ''
  Write-Host '  OBS est ouvert : si le vumètre Mic/Aux reste vide, ferme et relance OBS.' -ForegroundColor Yellow
}
Write-Host ''
