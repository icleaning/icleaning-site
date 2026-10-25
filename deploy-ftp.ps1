# Uploads the contents of dist\ to the CityHost site folder over FTP.
# Run:  powershell -ExecutionPolicy Bypass -File deploy-ftp.ps1
# The password is asked for at start and is never saved anywhere.

$FtpHost = 'mondeo.cityhost.com.ua'
$User    = 'ch4ca15def'
$Site    = 'icleaning.com.ua'
$Dist    = Join-Path $PSScriptRoot 'dist'
$Junk    = @('icleaning-site-v2.zip', 'icleaning-site.zip')   # wrong archives uploaded by hand

$ErrorActionPreference = 'Stop'
if (-not (Test-Path (Join-Path $Dist 'index.html'))) { Write-Host "No dist\index.html - run 'npm run build' first." -ForegroundColor Red; exit 1 }

$pw   = Read-Host "FTP password for $User" -AsSecureString
$cred = New-Object System.Net.NetworkCredential($User, $pw)
$script:Ssl = $true

function Req($path, $method) {
    $r = [System.Net.FtpWebRequest]::Create("ftp://$FtpHost/$path")
    $r.Method = $method; $r.Credentials = $cred
    $r.UsePassive = $true; $r.UseBinary = $true; $r.KeepAlive = $true
    $r.EnableSsl = $script:Ssl
    return $r
}
function List($path) {
    $resp = (Req $path ([System.Net.WebRequestMethods+Ftp]::ListDirectory)).GetResponse()
    $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $names = $sr.ReadToEnd() -split "`r?`n" | Where-Object { $_ } | ForEach-Object { ($_ -split '/')[-1] }
    $sr.Close(); $resp.Close(); return $names
}

# connect: encrypted (FTPS) first, plain FTP only if the server does not support it
try { $root = List '' }
catch {
    Write-Host "FTPS failed ($($_.Exception.InnerException.Message)); trying plain FTP..." -ForegroundColor Yellow
    $script:Ssl = $false
    try { $root = List '' } catch { Write-Host "Cannot connect: $($_.Exception.InnerException.Message)" -ForegroundColor Red; exit 1 }
}
Write-Host ("Connected (" + $(if ($script:Ssl) { 'FTPS' } else { 'FTP' }) + "). Root: " + ($root -join ', '))

# find the site folder
$base = $null
if ($root -contains 'www') { if ((List 'www/') -contains $Site) { $base = "www/$Site/" } }
if (-not $base -and $root -contains $Site) { $base = "$Site/" }
if (-not $base -and $root -contains 'index.html' -and $root -notcontains 'www') { $base = '' }
if ($null -eq $base) { Write-Host "Site folder '$Site' not found - nothing uploaded." -ForegroundColor Red; exit 1 }
Write-Host "Site folder: /$base"

$baseList = List $base
foreach ($j in $Junk) {
    if ($baseList -contains $j) { (Req "$base$j" ([System.Net.WebRequestMethods+Ftp]::DeleteFile)).GetResponse().Close(); Write-Host "deleted $j" }
}

$distFull = (Resolve-Path $Dist).Path
Get-ChildItem $Dist -Recurse -Directory | Sort-Object { $_.FullName.Length } | ForEach-Object {
    $rel = $_.FullName.Substring($distFull.Length + 1).Replace('\', '/')
    try { (Req "$base$rel" ([System.Net.WebRequestMethods+Ftp]::MakeDirectory)).GetResponse().Close() } catch { }   # already exists
}
$files = Get-ChildItem $Dist -Recurse -File -Force
$i = 0
foreach ($f in $files) {
    $i++
    $rel = $f.FullName.Substring($distFull.Length + 1).Replace('\', '/')
    $r = Req "$base$rel" ([System.Net.WebRequestMethods+Ftp]::UploadFile)
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $r.ContentLength = $bytes.Length
    $s = $r.GetRequestStream(); $s.Write($bytes, 0, $bytes.Length); $s.Close()
    $r.GetResponse().Close()
    Write-Host "[$i/$($files.Count)] $rel"
}
Write-Host "Done: $($files.Count) files uploaded to /$base" -ForegroundColor Green
