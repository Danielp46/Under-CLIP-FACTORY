/**
 * ffmpegService.ts
 * Renderiza clips verticales con layout híbrido + subtítulos quemados
 * mediante el filtro nativo `drawtext` de FFmpeg.
 *
 * ─ NO usa archivos .srt ni .ass externos. ─
 * ─ Cada bloque de texto se convierte en un filtro drawtext con enable='between(t,S,E)'. ─
 * ─ Esto hace a FFmpeg el único responsable de la sincronía y del estilo visual. ─
 *
 * FIX WINDOWS: Sin archivos intermedios → sin problemas de rutas con ':'.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

// ── ASPECT RATIO CONFIG ───────────────────────────────────────────
const ASPECT_CONFIG = {
  '9:16': { width: 1080, height: 1920 },
  '1:1':  { width: 1080, height: 1080 },
  '4:5':  { width: 1080, height: 1350 },
};

// ── FONT ──────────────────────────────────────────────────────────
// En Windows la fuente Impact existe en C:\Windows\Fonts\impact.ttf
// Usamos barras '/' que FFmpeg entiende en Windows
const FONT_PATH = 'C\\:/Windows/Fonts/impact.ttf';

// ── PRESETS ───────────────────────────────────────────────────────
const PRESET_MAP: Record<string, { baseColor: string; keywordColor: string; name: string }> = {
  preset1: { name: 'Core Tech',           baseColor: '0xFFE2FF', keywordColor: '0x9D00FF' },
  preset2: { name: 'Hacker Underground',  baseColor: '0xFFE2FF', keywordColor: '0xFF007F' },
  preset3: { name: 'Cyber Dual-Neon',     baseColor: '0x00F0FF', keywordColor: '0xFF007F' },
};

function getPreset(id: string) {
  const norm = (id || '').toLowerCase().trim();
  return PRESET_MAP[norm] ?? PRESET_MAP['preset1'];
}

// ── POSICIÓN Y ────────────────────────────────────────────────────
// Devuelve la expresión Y para drawtext según la posición solicitada
function getYExpr(position: string): string {
  switch (position) {
    case 'top':    return '150';
    case 'center': return '(h-text_h)/2';
    case 'bottom':
    default:       return 'h-text_h-150';
  }
}

// ── ESCAPE DE TEXTO PARA DRAWTEXT ─────────────────────────────────
/**
 * Escapa caracteres especiales para el valor `text=` del filtro drawtext.
 * FFmpeg drawtext usa libavfilter que reserva: \ : ' = [ ]
 * Como usamos execFile (sin shell), no hay escaping adicional de shell.
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')   // \ → \\
    .replace(/'/g,  "\\'")    // ' → \'
    .replace(/:/g,  '\\:')    // : → \:
    .replace(/\[/g, '\\[')   // [ → \[
    .replace(/\]/g, '\\]')   // ] → \]
    .replace(/%/g,  '%%');    // % → %% (strftime escape)
}

// ── CLEAN WORD ────────────────────────────────────────────────────
function cleanWord(w: string): string {
  return w.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '').trim();
}

// ── BLOQUES DE TEXTO CON TIEMPOS ─────────────────────────────────
interface TextBlock {
  start:       number; // relativo al inicio del clip
  end:         number;
  text:        string;
  isKeyword:   boolean;
}

function buildTextBlocks(
  transcriptSegments: { text: string; startTime: number; endTime: number }[] | undefined,
  fallbackTranscript: string,
  duration: number,
  clipStartTime: number,
  keywords: string[],
): TextBlock[] {
  const WORDS_PER_BLOCK = 2;
  const normKeywords = new Set(keywords.map(kw => cleanWord(kw)).filter(Boolean));
  const blocks: TextBlock[] = [];

  if (transcriptSegments && transcriptSegments.length > 0) {
    // Fallback keywords: palabras largas del transcript
    const allWords = transcriptSegments.flatMap(s => s.text.split(/\s+/));
    const fallbackKws = new Set(allWords.map(w => cleanWord(w)).filter(w => w.length > 6));
    const finalKws = normKeywords.size > 0 ? normKeywords : fallbackKws;

    for (const seg of transcriptSegments) {
      const words = seg.text.trim().split(/\s+/).filter(Boolean);
      if (!words.length) continue;

      const segStart = Number(seg.startTime);
      const segEnd   = Number(seg.endTime);
      const wordDur  = (segEnd - segStart) / words.length;

      for (let i = 0; i < words.length; i += WORDS_PER_BLOCK) {
        const blockWords = words.slice(i, i + WORDS_PER_BLOCK);

        // FIX SINCRONIZACIÓN: restar clipStartTime (Number cast explícito)
        const adjStart = Math.max(0, Number(segStart + i * wordDur) - Number(clipStartTime));
        // FIX TIEMPO FINAL: clamp estricto para que FFmpeg no intente
        // renderizar un frame más allá de la duración real del clip
        const adjEnd = Math.min(
          Math.max(0, Number(segStart + (i + blockWords.length) * wordDur) - Number(clipStartTime)),
          Number(duration) - 0.1
        );

        if (adjEnd <= 0 || adjStart >= Number(duration)) continue;

        const hasKeyword = blockWords.some(w => finalKws.has(cleanWord(w)));
        blocks.push({
          start: adjStart,
          end:   adjEnd,
          text:  blockWords.join(' '),
          isKeyword: hasKeyword,
        });
      }
    }
  } else {
    // FALLBACK LINEAL
    const words = fallbackTranscript.trim().split(/\s+/).filter(Boolean);
    const fallbackKws = new Set(words.map(w => cleanWord(w)).filter(w => w.length > 6));
    const finalKws = normKeywords.size > 0 ? normKeywords : fallbackKws;
    const rawChunks: string[] = [];

    for (let i = 0; i < words.length; i += WORDS_PER_BLOCK) {
      rawChunks.push(words.slice(i, i + WORDS_PER_BLOCK).join(' '));
    }

    const timePerChunk = Number(duration) / (rawChunks.length || 1);
    rawChunks.forEach((chunk, i) => {
      const hasKeyword = chunk.split(/\s+/).some(w => finalKws.has(cleanWord(w)));
      blocks.push({
        start:     i * timePerChunk,
        // FIX TIEMPO FINAL: clamp al último bloque para no sobrepasar la duración
        end:       Math.min((i + 1) * timePerChunk, Number(duration) - 0.1),
        text:      chunk,
        isKeyword: hasKeyword,
      });
    });
  }

  // LOG DE DIAGNÓSTICO DE TIEMPOS
  if (blocks.length > 0) {
    // FIX DE DURACIÓN FINAL: Forzamos al último bloque a terminar exactamente
    // al final del clip, por si el último segmento terminaba antes por error.
    blocks[blocks.length - 1].end = Number(duration) - 0.1;
    
    const last = blocks[blocks.length - 1];
    console.log(`[drawtext] Bloques: ${blocks.length} | Duración clip: ${duration.toFixed(3)}s | Bloque final: ${last.start.toFixed(3)}s - ${last.end.toFixed(3)}s`);
  }

  return blocks;
}

// ── DRAWTEXT CHAIN BUILDER ────────────────────────────────────────
/**
 * Construye una cadena de filtros drawtext encadenados con comas.
 * Cada bloque tiene su propio `enable='between(t,S,E)'` para la sincronía exacta.
 *
 * Para bloques con palabra clave: se superponen DOS filtros drawtext:
 *   1. Texto completo en color base (outline negro para legibilidad)
 *   2. Texto completo en color keyword (sin outline, sobre el anterior)
 *
 * De esta manera el color del bloque cambia completo cuando contiene una keyword.
 */
function buildDrawtextChain(
  blocks: TextBlock[],
  position: string,
  preset: string,
): string {
  if (!blocks.length) return '';

  const p    = getPreset(preset);
  const yExp = getYExpr(position);
  const filters: string[] = [];

  for (const block of blocks) {
    const escapedText = escapeDrawtext(block.text);
    const start = block.start.toFixed(3);
    const end   = block.end.toFixed(3);

    // Un solo filtro drawtext por bloque
    // fontsize=68  → legible en pantalla de móvil a 1080p
    // borderw=5    → contorno negro marcado
    // box=1        → caja translúcida negra para máximo contraste
    // fontcolor    → blanco base o color de marca si contiene keyword
    const fontColor = block.isKeyword ? p.keywordColor : p.baseColor;

    filters.push(
      `drawtext=fontfile='${FONT_PATH}'` +
      `:text='${escapedText}'` +
      `:fontsize=68` +
      `:fontcolor=${fontColor}` +
      `:borderw=5` +
      `:bordercolor=0x000000` +
      `:box=1:boxcolor=0x000000@0.45:boxborderw=12` +
      `:x=(w-text_w)/2` +
      `:y=${yExp}` +
      `:enable='between(t,${start},${end})'`
    );
  }

  return filters.join(',');
}

// ── FILTER GRAPH BUILDER ──────────────────────────────────────────
function buildFilterGraph(
  aspectRatio: keyof typeof ASPECT_CONFIG,
  subtitleStyle: string,
  drawtextChain: string,
): { filterGraph: string; mapVideo: string } {
  const { width: outW, height: outH } = ASPECT_CONFIG[aspectRatio];
  const parts: string[] = [];

  // Layout híbrido: fondo desenfocado + vídeo centrado
  parts.push(`[0:v]split=2[bg_src][fg_src]`);
  parts.push(`[bg_src]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},boxblur=20:5[bg]`);
  parts.push(`[fg_src]scale=${outW}:-2[fg]`);
  parts.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2[composed]`);
  parts.push(`[composed]eq=contrast=1.05:brightness=0.02:saturation=1.1[graded]`);

  if (subtitleStyle !== 'none' && drawtextChain) {
    // Encadenar los drawtext directamente sobre [graded]
    parts.push(`[graded]${drawtextChain}[vout]`);
    return { filterGraph: parts.join(';'), mapVideo: '[vout]' };
  }

  return { filterGraph: parts.join(';'), mapVideo: '[graded]' };
}

// ── PUBLIC INTERFACE ──────────────────────────────────────────────
export interface RenderClipOptions {
  inputPath:           string;
  outputPath:          string;
  startTime:           number;
  endTime:             number;
  aspectRatio:         '9:16' | '1:1' | '4:5';
  subtitleStyle:       'dynamic' | 'static' | 'none';
  transcript:          string;
  clipId:              string;
  subtitlesPosition?:  string;
  subtitlesPreset?:    string;
  keywords?:           string[];
  transcriptSegments?: { text: string; startTime: number; endTime: number }[];
}

// ── MAIN RENDER FUNCTION ──────────────────────────────────────────
export async function renderClip(options: RenderClipOptions): Promise<void> {
  const {
    inputPath, outputPath,
    startTime, endTime,
    aspectRatio, subtitleStyle,
    transcript, clipId,
    subtitlesPosition = 'bottom',
    subtitlesPreset   = 'preset1',
    keywords          = [],
    transcriptSegments,
  } = options;

  // Casting defensivo
  const clipStart = Number(startTime);
  const clipEnd   = Number(endTime);
  const duration  = clipEnd - clipStart;
  const ffmpeg    = process.env.FFMPEG_PATH || 'ffmpeg';

  console.log(`[ffmpeg] ▶ Clip ${clipId} (${clipStart.toFixed(2)}s → ${clipEnd.toFixed(2)}s)`);
  console.log(`[ffmpeg]   position="${subtitlesPosition}" preset="${subtitlesPreset}" style="${subtitleStyle}"`);

  // ── 1. Construir bloques de texto con tiempos ─────────────────
  const hasText = transcript.trim() || (transcriptSegments && transcriptSegments.length > 0);
  let drawtextChain = '';

  if (subtitleStyle !== 'none' && hasText) {
    const blocks = buildTextBlocks(
      transcriptSegments,
      transcript,
      duration,
      clipStart,
      keywords,
    );

    console.log(`[ffmpeg]   Bloques drawtext: ${blocks.length}`);

    drawtextChain = buildDrawtextChain(blocks, subtitlesPosition, subtitlesPreset);
  }

  // ── 2. Construir filter_complex ───────────────────────────────
  const { filterGraph, mapVideo } = buildFilterGraph(aspectRatio, subtitleStyle, drawtextChain);

  // ── 3. Argumentos FFmpeg ──────────────────────────────────────
  const args: string[] = [
    '-ss', String(clipStart),
    '-i',  inputPath,
    '-t',  String(duration),
    '-filter_complex', filterGraph,
    '-map', mapVideo,
    '-map', '0:a?',
    '-async', '1',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ];

  console.log(`[ffmpeg]   Filter (primeros 200 chars): ${filterGraph.substring(0, 200)}…`);

  // ── 4. Ejecutar FFmpeg ────────────────────────────────────────
  try {
    const { stderr } = await execFileAsync(ffmpeg, args, {
      maxBuffer: 50 * 1024 * 1024,
      cwd: process.cwd(),
    });
    if (stderr && stderr.toLowerCase().includes('error')) {
      console.warn(`[ffmpeg] ⚠ ${clipId}:`, stderr.slice(-500));
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`[ffmpeg] Error rendering clip ${clipId}: ${msg}`);
  }

  console.log(`[ffmpeg] ✓ Clip listo: ${path.basename(outputPath)}`);
}
