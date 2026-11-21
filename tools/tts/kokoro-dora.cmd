@echo off
setlocal
for %%I in ("%~dp0..\..") do set "KOKORO_DORA_REPO=%%~fI"
if not defined KOKORO_DORA_HOME set "KOKORO_DORA_HOME=%LOCALAPPDATA%\Editorial\KokoroDora"
set "KOKORO_DORA_PYTHON=%KOKORO_DORA_HOME%\.venv\Scripts\python.exe"
if not exist "%KOKORO_DORA_PYTHON%" (
  echo Kokoro Dora local ainda nao foi instalado. Execute tools\tts\setup-local.ps1 1>&2
  exit /b 1
)
"%KOKORO_DORA_PYTHON%" "%KOKORO_DORA_REPO%\tools\tts\local_cli.py" %*
exit /b %ERRORLEVEL%
