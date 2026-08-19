@echo off
setlocal
cd /d "%~dp0"
set PORT=8765
set PAGE=moo-cash-live.html

echo.
echo  ==================================================
echo    moo.cash
echo  ==================================================
echo.

if not exist "%PAGE%" (
  echo   Can't find %PAGE% next to this file.
  echo.
  echo   Put START-HERE.bat and %PAGE% in the SAME folder,
  echo   then run this again.
  echo.
  pause
  exit /b 1
)

echo   Wallets and the camera are blocked on file:// pages,
echo   so this serves the folder at http://localhost:%PORT%
echo.
echo   Leave this window open. Close it to stop.
echo.

REM ---- PowerShell is on every Windows machine, so try it first ----
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$root=(Get-Location).Path;" ^
  "$l=New-Object System.Net.HttpListener;" ^
  "$l.Prefixes.Add('http://localhost:%PORT%/');" ^
  "try{$l.Start()}catch{Write-Host '  Port %PORT% is busy. Close the other window and retry.';exit 1};" ^
  "Write-Host '  Serving on http://localhost:%PORT%/%PAGE%';" ^
  "Start-Process ('http://localhost:%PORT%/%PAGE%');" ^
  "while($l.IsListening){" ^
    "$c=$l.GetContext();" ^
    "$p=[Uri]::UnescapeDataString($c.Request.Url.LocalPath.TrimStart('/'));" ^
    "if($p -eq ''){$p='%PAGE%'};" ^
    "$f=Join-Path $root $p;" ^
    "if((Test-Path $f -PathType Leaf) -and $f.StartsWith($root)){" ^
      "$b=[IO.File]::ReadAllBytes($f);" ^
      "$e=[IO.Path]::GetExtension($f).ToLower();" ^
      "switch($e){'.html'{$t='text/html; charset=utf-8'}'.js'{$t='text/javascript; charset=utf-8'}'.css'{$t='text/css'}'.json'{$t='application/json'}'.svg'{$t='image/svg+xml'}'.png'{$t='image/png'}default{$t='application/octet-stream'}};" ^
      "$c.Response.ContentType=$t;" ^
      "$c.Response.ContentLength64=$b.Length;" ^
      "$c.Response.OutputStream.Write($b,0,$b.Length)" ^
    "}else{$c.Response.StatusCode=404};" ^
    "$c.Response.Close()" ^
  "}"

if %errorlevel%==0 goto :eof

REM ---- fallbacks if PowerShell was blocked by policy ----
echo.
echo   PowerShell was blocked. Trying Python...
python --version >nul 2>&1 && (
  start "" "http://localhost:%PORT%/%PAGE%"
  python -m http.server %PORT%
  goto :eof
)
py --version >nul 2>&1 && (
  start "" "http://localhost:%PORT%/%PAGE%"
  py -m http.server %PORT%
  goto :eof
)
node --version >nul 2>&1 && (
  start "" "http://localhost:%PORT%/%PAGE%"
  npx --yes http-server -p %PORT% -c-1
  goto :eof
)

echo.
echo   Nothing available to serve the folder.
echo   Install Python from https://python.org and run this again.
echo.
pause
