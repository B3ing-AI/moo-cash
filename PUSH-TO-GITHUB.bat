@echo off
setlocal
cd /d "%~dp0"

echo.
echo  ==================================================
echo    Push moo.cash to GitHub
echo    B3ing-AI/moo-cash
echo  ==================================================
echo.

git --version >nul 2>&1
if errorlevel 1 (
  echo  Git is not on your PATH.
  echo.
  echo  Open "Git Bash" from the Start menu, then run:
  echo.
  echo    cd "%~dp0"
  echo    git push -u origin main
  echo.
  pause
  exit /b 1
)

REM The repo was prepared in a sandbox that could not clean up git's
REM lock files. Clear them and commit anything still outstanding.
if exist ".git\index.lock" del /f /q ".git\index.lock" >nul 2>&1
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock" >nul 2>&1
if exist ".git\objects\maintenance.lock" del /f /q ".git\objects\maintenance.lock" >nul 2>&1

git add -A >nul 2>&1
git diff --cached --quiet >nul 2>&1
if errorlevel 1 (
  echo  Committing outstanding changes...
  git commit -q -m "Add push script and finalise project"
  echo.
)

echo  Pushing to https://github.com/B3ing-AI/moo-cash ...
echo.
echo  If a sign-in window appears, that is Git Credential
echo  Manager asking GitHub to authorise this machine.
echo.

git remote remove origin >nul 2>&1
git remote add origin https://github.com/B3ing-AI/moo-cash.git
git branch -M main
git push -u origin main

if errorlevel 1 (
  echo.
  echo  ------------------------------------------------
  echo   Push failed. Usual causes:
  echo.
  echo   * You are not signed in to GitHub as an account
  echo     with write access to B3ing-AI
  echo   * The sign-in prompt was cancelled
  echo   * No internet connection
  echo.
  echo   To sign in manually, run in Git Bash:
  echo     git config --global credential.helper manager
  echo     git push -u origin main
  echo  ------------------------------------------------
) else (
  echo.
  echo  ================================================
  echo   Pushed.
  echo.
  echo   https://github.com/B3ing-AI/moo-cash
  echo.
  echo   Now go back to Claude and say:
  echo     "deploy it"
  echo  ================================================
)
echo.
pause
