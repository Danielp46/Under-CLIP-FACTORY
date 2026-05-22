import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

const ASPECT_CONFIG = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
};

// Windows: FFmpeg entiende rutas con '/'
const FONT_PATH = 'C\\:/Windows/Fonts/impact.ttf';

type SubtitlePreset = 'preset1' | 'preset2' | 'preset3';

const PRESET_COLORS: Record<SubtitlePreset, { even: string; odd: string }> = {
  preset1: { even: '0xFFFFFF', odd: '0x9D00FF' },
  preset2: { even: '0xFFFFFF', odd: '0xFF007F' },
  preset3: { even: '0x00FFFF', odd: '0xFF007F' },
};

function resolvePresetColors(preset?: string): { even: string; odd: string } {
  if (preset === 'preset2' || preset === 'preset3') return PRESET_COLORS[preset];
  return PRESET_COLORS.preset1;
}

function getYExpr(position: string): string {
  switch (position) {
    case 'top':
      return '150';
    case 'center':
      return '(h-text_h)/2';
    case 'bottom':
    default:
      return 'h-text_h-150';
  }
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '%%');
}

interface TextBlock {
  start: number;
  end: number;
  text: string;
  color: string;
}

function buildTextBlocks(
  transcriptSegments: { text: string; startTime: number; endTime: number }[] | undefined,
  fallbackTranscript: string,
  duration: number,
  clipStartTime: number,
  isUppercase: boolean,
  subtitlesPreset: string | undefined,
): TextBlock[] {
  const { even, odd } = resolvePresetColors(subtitlesPreset);
  const blocks: TextBlock[] = [];
  const normalizeText = (value: string) => (isUppercase ? value.toUpperCase() : value);
  const timedWords: { text: string; start: number; end: number }[] = [];

  if (transcriptSegments && transcriptSegments.length > 0) {
    for (const seg of transcriptSegments) {
      const segmentText = normalizeText(seg.text);
      const words = segmentText.trim().split(/\s+/).filter(Boolean);
      if (!words.length) continue;

      const segStart = Number(seg.startTime);
      const segEnd = Number(seg.endTime);
      const wordDur = (segEnd - segStart) / words.length;

      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const adjStart = Math.max(0, Number(segStart + i * wordDur) - Number(clipStartTime));
        const adjEnd = Math.min(
          Math.max(0, Number(segStart + (i + 1) * wordDur) - Number(clipStartTime)),
          Number(duration) - 0.1,
        );

        if (adjEnd <= 0 || adjStart >= Number(duration)) continue;

        timedWords.push({
          text: word,
          start: adjStart,
          end: adjEnd,
        });
      }
    }
  } else {
    const normalizedFallback = normalizeText(fallbackTranscript);
    const words = normalizedFallback.trim().split(/\s+/).filter(Boolean);
    const timePerWord = Number(duration) / (words.length || 1);
    words.forEach((word, i) => {
      timedWords.push({
        text: word,
        start: i * timePerWord,
        end: Math.min((i + 1) * timePerWord, Number(duration) - 0.1),
      });
    });
  }

  const chunks: { text: string; start: number; end: number }[] = [];
  let tempWords: string[] = [];
  let tempStart = 0;
  let tempEnd = 0;

  for (let i = 0; i < timedWords.length; i++) {
    const word = timedWords[i];
    if (tempWords.length === 0) tempStart = word.start;
    tempWords.push(word.text);
    tempEnd = word.end;

    const hasPunctuation = /[.,]$/.test(word.text);
    if (tempWords.length === 3 || hasPunctuation) {
      chunks.push({ text: tempWords.join(' '), start: tempStart, end: tempEnd });
      tempWords = [];
    }
  }

  if (tempWords.length > 0) {
    chunks.push({ text: tempWords.join(' '), start: tempStart, end: tempEnd });
  }

  chunks.forEach((chunk, index) => {
    blocks.push({
      start: chunk.start,
      end: chunk.end,
      text: chunk.text,
      color: index % 2 === 0 ? even : odd,
    });
  });

  if (blocks.length > 0) {
    blocks[blocks.length - 1].end = Number(duration) - 0.1;
    const last = blocks[blocks.length - 1];
    console.log(
      `[drawtext] Bloques: ${blocks.length} | Duracion clip: ${duration.toFixed(3)}s | Bloque final: ${last.start.toFixed(3)}s - ${last.end.toFixed(3)}s`,
    );
  }

  return blocks;
}

function buildDrawtextChain(
  blocks: TextBlock[],
  position: string,
  subtitleSize: 'Mediana' | 'Grande',
): string {
  if (!blocks.length) return '';

  const yExp = getYExpr(position);
  const fontSize = subtitleSize === 'Grande' ? 88 : 72;
  const boxBorder = subtitleSize === 'Grande' ? 22 : 16;
  const filters: string[] = [];

  for (const block of blocks) {
    const escapedText = escapeDrawtext(block.text);
    const start = block.start.toFixed(3);
    const end = block.end.toFixed(3);

    filters.push(
        `drawtext=fontfile='${FONT_PATH}'` +
        `:text='${escapedText}'` +
        `:fontsize=${fontSize}` +
        `:fontcolor=${block.color}` +
        `:borderw=5` +
        `:bordercolor=0x000000` +
        `:box=1:boxcolor=0x000000@0.45:boxborderw=${boxBorder}` +
        `:x=(w-text_w)/2` +
        `:y=${yExp}` +
        `:enable='between(t,${start},${end})'`,
    );
  }

  return filters.join(',');
}

function buildFilterGraph(
  aspectRatio: keyof typeof ASPECT_CONFIG,
  subtitleStyle: string,
  drawtextChain: string,
): { filterGraph: string; mapVideo: string } {
  const { width: outW, height: outH } = ASPECT_CONFIG[aspectRatio];
  const parts: string[] = [];

  parts.push(`[0:v]split=2[bg_src][fg_src]`);
  parts.push(`[bg_src]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},boxblur=20:5[bg]`);
  parts.push(`[fg_src]scale=${outW}:-2[fg]`);
  parts.push(`[bg][fg]overlay=(W-w)/2:(H-h)/2[composed]`);
  parts.push(`[composed]eq=contrast=1.05:brightness=0.02:saturation=1.1[graded]`);

  if (subtitleStyle !== 'none' && drawtextChain) {
    parts.push(`[graded]${drawtextChain}[vout]`);
    return { filterGraph: parts.join(';'), mapVideo: '[vout]' };
  }

  return { filterGraph: parts.join(';'), mapVideo: '[graded]' };
}

export interface RenderClipOptions {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  aspectRatio: '9:16' | '1:1' | '4:5';
  subtitleStyle: 'dynamic' | 'static' | 'none';
  transcript: string;
  clipId: string;
  subtitlesPosition?: string;
  subtitlesPreset?: string;
  keywords?: string[];
  subtitleSize?: 'Mediana' | 'Grande';
  isUppercase?: boolean;
  transcriptSegments?: { text: string; startTime: number; endTime: number }[];
}

export async function renderClip(options: RenderClipOptions): Promise<void> {
  const {
    inputPath,
    outputPath,
    startTime,
    endTime,
    aspectRatio,
    subtitleStyle,
    transcript,
    clipId,
    subtitlesPosition = 'bottom',
    subtitlesPreset = 'preset1',
    subtitleSize = 'Mediana',
    isUppercase = false,
    transcriptSegments,
  } = options;

  const clipStart = Number(startTime);
  const clipEnd = Number(endTime);
  const duration = clipEnd - clipStart;
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

  console.log(`[ffmpeg] Clip ${clipId} (${clipStart.toFixed(2)}s -> ${clipEnd.toFixed(2)}s)`);
  console.log(`[ffmpeg] position="${subtitlesPosition}" style="${subtitleStyle}"`);

  const hasText = transcript.trim() || (transcriptSegments && transcriptSegments.length > 0);
  let drawtextChain = '';

  if (subtitleStyle !== 'none' && hasText) {
    const blocks = buildTextBlocks(
      transcriptSegments,
      transcript,
      duration,
      clipStart,
      isUppercase,
      subtitlesPreset,
    );
    console.log(`[ffmpeg] Bloques drawtext: ${blocks.length}`);
    drawtextChain = buildDrawtextChain(blocks, subtitlesPosition, subtitleSize);
  }

  const { filterGraph, mapVideo } = buildFilterGraph(aspectRatio, subtitleStyle, drawtextChain);

  const args: string[] = [
    '-ss',
    String(clipStart),
    '-i',
    inputPath,
    '-t',
    String(duration),
    '-filter_complex',
    filterGraph,
    '-map',
    mapVideo,
    '-map',
    '0:a?',
    '-async',
    '1',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-y',
    outputPath,
  ];

  console.log(`[ffmpeg] Filter (primeros 200 chars): ${filterGraph.substring(0, 200)}...`);

  try {
    const { stderr } = await execFileAsync(ffmpeg, args, {
      maxBuffer: 50 * 1024 * 1024,
      cwd: process.cwd(),
    });

    if (stderr && stderr.toLowerCase().includes('error')) {
      console.warn(`[ffmpeg] ${clipId}:`, stderr.slice(-500));
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`[ffmpeg] Error rendering clip ${clipId}: ${msg}`);
  }

  console.log(`[ffmpeg] Clip listo: ${path.basename(outputPath)}`);
}
