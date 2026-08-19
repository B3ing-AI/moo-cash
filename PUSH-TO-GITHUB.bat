@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo  ==================================================
echo    Push moo.cash to GitHub
echo  ==================================================
echo.
echo  Before running this, create an EMPTY repo at:
echo    https://github.com/new
echo.
echo  Name it:  moo-cash
echo  Do NOT tick "Add a README" - this folder has one.
echo.

git --version >nul 2>&1
if errorlevel 1 (
  echo  Git is not on your PATH. Open "Git Bash" from the Start
  echo  menu, cd to this folder, and run the commands in README.md.
  echo.
  pause
  exit /b 1
)

set /p GHUSER=  Your GitHub username:
if "%GHUSER%"=="" (
  echo.
  echo  No username entered. Nothing done.
  pause
  exit /b 1
)

REM The repo was prepared in a sandbox that could not clean up git's
REM lock file. Clear it and commit anything still outstanding.
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock" >nul 2>&1

git add -A >nul 2>&1
git diff --cached --quiet >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Committing outstanding changes...
  git commit -q -m "Add push script and finalise project" >nul 2>&1
)

echo.
echo  Pushing to https://github.com/%GHUSER%/moo-cash ...
echo.

git remote remove origin >nul 2>&1
git remote add origin https://github.com/%GHUSER%/moo-cash.git
git branch -M main
git push -u origin main

if errorlevel 1 (
  echo.
  echo  ------------------------------------------------
  echo   Push failed. The usual causes:
  echo.
  echo   * The repo does not exist yet - create it first
  echo     at https://github.com/new named "moo-cash"
  echo   * Wrong username
  echo   * Git asked for credentials and they were declined
  echo.
  echo   If prompted to sign in, a browser window or the
  echo   Git Credential Manager will handle it.
  echo  ------------------------------------------------
) else (
  echo.
  echo  ================================================
  echo   Pushed successfully.
  echo.
  echo   https://github.com/%GHUSER%/moo-cash
  echo.
  echo   Now tell Claude:
  echo     "deploy %GHUSER%/moo-cash on vercel"
  echo  ================================================
)
echo.
pause
