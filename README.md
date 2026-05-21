# 🎬 Under CLIP FACTORY

> Motor de extracción de clips verticales con IA — 100% local y gratuito.

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16 · React 19 · Tailwind CSS · TypeScript |
| Backend API | Next.js App Router API Routes |
| Procesamiento | FFmpeg 8.x (nativo del sistema) |
| Transcripción | Gemini 1.5 Flash / OpenAI Whisper / Groq Whisper |
| Análisis IA | Gemini 1.5 Flash (selección de clips virales) |
| Runtime | Node.js 22 · Python 3.11 |

## Estructura del proyecto

```
Under_CLIP_FACTORY/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout + metadata SEO
│   │   ├── page.tsx            # Página principal (tabs: upload / queue / settings)
│   │   ├── globals.css         # Design system completo
│   │   └── api/
│   │       ├── process/
│   │       │   ├── upload/     # POST: recibe vídeo, lanza job
│   │       │   └── status/[jobId]/  # GET: estado del job
│   │       └── clips/
│   │           └── [clipId]/download/  # GET: stream del clip
│   ├── components/
│   │   ├── Header.tsx          # Barra superior con estado FFmpeg
│   │   ├── Sidebar.tsx         # Navegación lateral
│   │   ├── VideoUploader.tsx   # Drop zone + validación + upload
│   │   ├── JobQueue.tsx        # Lista de trabajos con progreso
│   │   └── ClipSettings.tsx    # Panel de configuración de IA
│   ├── services/
│   │   ├── videoProcessor.ts   # Orquestador del pipeline completo
│   │   ├── transcriptionService.ts  # Multi-proveedor: Gemini/OpenAI/Groq
│   │   ├── aiAnalyzer.ts       # Selección de clips con IA + fallback heurístico
│   │   └── ffmpegService.ts    # Render vertical + subtítulos SRT quemados
│   └── lib/
│       └── utils.ts            # Utilidades compartidas
├── .env.local                  # Claves de API (NO commitear)
├── .gitignore
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## Pipeline de procesamiento

```
Vídeo subido
     │
     ▼
[1] Extracción de audio (FFmpeg → WAV 16kHz mono)
     │
     ▼
[2] Transcripción con timestamps (Gemini / Whisper)
     │
     ▼
[3] Análisis IA → segmentos virales puntuados
     │
     ▼
[4] Render FFmpeg por clip:
    · Reencuadre vertical (9:16 / 1:1 / 4:5)
    · Color grading sutil
    · Subtítulos SRT quemados (dinámico / estático)
     │
     ▼
[5] Clips MP4 listos para descarga
```

## Inicio rápido

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar claves de IA en .env.local
#    GEMINI_API_KEY=tu_clave_aquí

# 3. Arrancar el servidor de desarrollo
npm run dev
# → http://localhost:3000
```

## Requisitos del sistema

- **Node.js** ≥ 22 (`node --version`)
- **FFmpeg** ≥ 6 en PATH (`ffmpeg -version`)
- **Python** ≥ 3.10 (para futuras librerías locales)

## Proveedores de IA configurables

| Proveedor | Transcripción | Análisis clips | Coste |
|-----------|--------------|----------------|-------|
| **Gemini 1.5 Flash** | ✅ Audio base64 | ✅ Selección viral | Gratis (free tier) |
| **OpenAI Whisper** | ✅ API oficial | ❌ | $0.006/min |
| **Groq Whisper-v3** | ✅ Ultra-rápido | ❌ | Gratis |
| **Heurístico** | Sin API | ✅ Keywords | 100% local |

> Si no hay clave de API configurada, el sistema usa el **analizador heurístico** como fallback automático.

---

*Under CLIP FACTORY © 2026 — Procesamiento 100% local*
