/**
 * videoProcessor.ts
 * Orquestador principal del pipeline de procesamiento de vídeo.
 * Flujo: Upload → Transcripción → Análisis IA → Detección clips → FFmpeg render
 */

import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getTranscription, getVideoDuration } from './transcriptionService';
import { analyzeClips } from './aiManager';
import { renderClip } from './ffmpegService';
import { v4 as uuidv4 } from 'uuid';

export interface ProcessingSettings {
  maxClips: number;
  minDuration: number;
  maxDuration: number;
  isFullVideo?: boolean;
  speed?: number;
  aspectRatio: '9:16' | '1:1' | '4:5';
  subtitleStyle: 'dynamic' | 'static' | 'none';
  subtitleSize?: 'Mediana' | 'Grande';
  isUppercase?: boolean;
  aiProvider: 'gemini' | 'openai' | 'groq' | 'openrouter';
  aiModel: string;
  language: string;
  subtitlesPosition?: 'top' | 'center' | 'bottom';
  subtitlesPreset?: string;
}

export interface ClipSegment {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  score: number;
  transcript: string;
  outputPath?: string;
  keywords?: string[];
  transcriptSegments?: { text: string; startTime: number; endTime: number }[];
}

export interface JobStatus {
  id: string;
  fileName: string;
  videoPath: string;
  settings: ProcessingSettings;
  status: 'pending' | 'transcribing' | 'analyzing' | 'clipping' | 'completed' | 'success' | 'done' | 'error';
  progress: number;
  clips: ClipSegment[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

async function updateJobFile(jobId: string, updates: Partial<JobStatus>) {
  const jobPath = path.join(process.cwd(), 'uploads', jobId, 'job.json');
  const { readFile } = await import('fs/promises');
  const current: JobStatus = JSON.parse(await readFile(jobPath, 'utf-8'));
  const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
  await writeFile(jobPath, JSON.stringify(updated, null, 2));
  return updated;
}

export async function processVideo(
  jobId: string,
  videoPath: string,
  settings: Partial<ProcessingSettings>
): Promise<void> {
  const cfg: ProcessingSettings = {
    maxClips:      settings.maxClips      ?? 5,
    minDuration:   settings.minDuration   ?? 30,
    maxDuration:   settings.maxDuration   ?? 90,
    isFullVideo:   settings.isFullVideo   ?? false,
    speed:         settings.speed         ?? 1,
    aspectRatio:   settings.aspectRatio   ?? '9:16',
    subtitleStyle: settings.subtitleStyle ?? 'dynamic',
    subtitleSize:  settings.subtitleSize  ?? 'Mediana',
    isUppercase:   settings.isUppercase   ?? false,
    aiProvider:    settings.aiProvider    ?? 'gemini',
    aiModel:       settings.aiModel       ?? 'gemini-2.0-flash',
    language:      settings.language      ?? 'es',
    subtitlesPosition: settings.subtitlesPosition ?? 'bottom',
    subtitlesPreset:   settings.subtitlesPreset   ?? 'preset1',
  };

  try {
    // ── STEP 1: Transcribe ────────────────────────────────────────
    await updateJobFile(jobId, { status: 'transcribing', progress: 5 });
    console.log(`[${jobId}] Starting transcription with ${cfg.aiProvider}...`);

    const transcription = await getTranscription(videoPath, cfg.aiProvider, cfg.language);
    await updateJobFile(jobId, { progress: 40 });

    // ── STEP 2: AI Analysis ───────────────────────────────────────
    await updateJobFile(jobId, { status: 'analyzing', progress: 45 });
    console.log(`[${jobId}] Analyzing clips with AI...`);

    const segments = cfg.isFullVideo
      ? [{
          id: '',
          title: 'Video completo',
          startTime: 0,
          endTime: await getVideoDuration(videoPath),
          score: 1,
          transcript: transcription.fullText,
          transcriptSegments: transcription.segments,
          keywords: [],
        }]
      : await analyzeClips(transcription, cfg);
    await updateJobFile(jobId, { progress: 65 });

    // ── STEP 3: Render clips with FFmpeg ──────────────────────────
    await updateJobFile(jobId, { status: 'clipping', progress: 70 });
    console.log(`[${jobId}] Rendering ${segments.length} clips...`);

    const outputDir = path.join(process.cwd(), 'output', 'clips');
    await mkdir(outputDir, { recursive: true });

    const renderedClips: ClipSegment[] = [];
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const clipId = uuidv4();
      const outputPath = path.join(outputDir, `${clipId}.mp4`);

      await renderClip({
        inputPath: videoPath,
        outputPath,
        startTime: seg.startTime,
        endTime: seg.endTime,
        aspectRatio: cfg.aspectRatio,
        subtitleStyle: cfg.subtitleStyle,
        transcript: seg.transcript,
        clipId,
        keywords: seg.keywords || [],
        transcriptSegments: seg.transcriptSegments || [],
        subtitlesPosition: cfg.subtitlesPosition,
        subtitlesPreset: cfg.subtitlesPreset,
        subtitleSize: cfg.subtitleSize,
        isUppercase: cfg.isUppercase,
        speed: cfg.speed,
      });

      renderedClips.push({ ...seg, id: clipId, outputPath, keywords: seg.keywords || [] });

      const progress = 70 + Math.round(((i + 1) / segments.length) * 28);
      await updateJobFile(jobId, { progress, clips: renderedClips });
    }

    // ── DONE ──────────────────────────────────────────────────────
    await updateJobFile(jobId, { status: 'completed', progress: 100, clips: renderedClips });
    console.log(`[${jobId}] ✓ Processing complete. ${renderedClips.length} clips ready.`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[${jobId}] ✗ Error:`, msg);
    await updateJobFile(jobId, { status: 'error', error: msg });
  }
}
