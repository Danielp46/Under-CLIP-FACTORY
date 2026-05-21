@echo off
SETLOCAL EnableDelayedExpansion
TITLE Under_CLIP_FACTORY - Launcher
COLOR 0B

:: Estetica de inicio
echo ==========================================================
echo    UNDER_CLIP_FACTORY - AI VIDEO ENGINE
echo ==========================================================
echo [SYSTEM] Verificando entorno nativo...

:: 1. Verificar Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js no esta instalado o no esta en el PATH.
    echo Por favor, instala Node.js desde https://nodejs.org/
    pause
    exit /b
)
echo [OK] Node.js detectado.

:: 2. Verificar FFmpeg
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] FFmpeg no esta instalado o no esta en el PATH.
    echo Esta aplicacion requiere FFmpeg para procesar video.
    pause
    exit /b
)
echo [OK] FFmpeg detectado.

:: 3. Verificar dependencias (node_modules)
if not exist "node_modules\" (
    echo [SYSTEM] Instalando dependencias de Node.js...
    call npm install
) else (
    echo [OK] Dependencias ya instaladas.
)

:: 4. Crear carpetas necesarias
echo [SYSTEM] Preparando directorios de trabajo...
if not exist "uploads" mkdir uploads
if not exist "output\clips" mkdir output\clips
if not exist "tmp\audio" mkdir tmp\audio
if not exist "tmp\srt" mkdir tmp\srt
if not exist "tmp\processing" mkdir tmp\processing

:: 5. Verificar configuracion (.env.local)
if not exist ".env.local" (
    echo [WARNING] No se encontro el archivo .env.local.
    echo [SYSTEM] Creando plantilla de .env.local...
    echo # AI PROVIDERS > .env.local
    echo GEMINI_API_KEY=your_gemini_api_key >> .env.local
    echo OPENROUTER_API_KEY=your_openrouter_api_key >> .env.local
    echo OPENAI_API_KEY=your_openai_api_key >> .env.local
    echo GROQ_API_KEY=your_groq_api_key >> .env.local
    echo # PATHS >> .env.local
    echo FFMPEG_PATH=ffmpeg >> .env.local
    echo FFPROBE_PATH=ffprobe >> .env.local
    echo [IMPORTANT] Por favor, edita .env.local con tus claves de API.
)

:: 5. Levantar la aplicacion
echo [SYSTEM] Arrancando Under_CLIP_FACTORY en http://localhost:3000
echo ==========================================================
echo [INFO] Presiona CTRL+C para detener el servidor.
echo ==========================================================

npm run dev

pause
