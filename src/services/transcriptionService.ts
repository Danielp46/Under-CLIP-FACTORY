/**
 * transcriptionService.ts
 * Gestiona la transcripción de vídeo/audio con múltiples proveedores de IA.
 * Proveedores soportados: Gemini (multi-modal), OpenAI Whisper, Groq Whisper
 */

import axios from 'axios';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);

export interface TranscriptionSegment {
  text: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  confidence?: number;
}

export interface Transcription {
  fullText: string;
  segments: TranscriptionSegment[];
  language: string;
  duration: number;
}

// ── AUDIO EXTRACTION ─────────────────────────────────────────────
async function extractAudio(videoPath: string): Promise<string> {
  const tmpDir = path.join(process.cwd(), 'tmp', 'audio');
  await mkdir(tmpDir, { recursive: true });

  const audioPath = path.join(tmpDir, `${Date.now()}.wav`);
  const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

  await execFileAsync(ffmpeg, [
    '-i', videoPath,
    '-vn',              // No video
    '-ac', '1',         // Mono
    '-ar', '16000',     // 16kHz (optimal for Whisper)
    '-f', 'wav',
    '-y',               // Overwrite
    audioPath,
  ]);

  return audioPath;
}

// ── VIDEO DURATION ────────────────────────────────────────────────
export async function getVideoDuration(videoPath: string): Promise<number> {
  const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
  const { stdout } = await execFileAsync(ffprobe, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    videoPath,
  ]);
  const info = JSON.parse(stdout);
  return parseFloat(info.format?.duration || '0');
}

// ── GEMINI TRANSCRIPTION ──────────────────────────────────────────
async function transcribeWithGemini(videoPath: string, language: string): Promise<Transcription> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada en .env.local');

  // Gemini uses audio file for transcription
  const audioPath = await extractAudio(videoPath);
  const duration = await getVideoDuration(videoPath);

  try {
    // Read audio as base64
    const { readFile } = await import('fs/promises');
    const audioData = await readFile(audioPath);
    const base64Audio = audioData.toString('base64');

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        contents: [{
          parts: [
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: base64Audio,
              },
            },
            {
              text: `Transcribe este audio en ${language === 'auto' ? 'el idioma detectado' : language}. 
              Devuelve SOLO un JSON con este formato exacto (sin markdown):
              {
                "language": "es",
                "segments": [
                  { "text": "texto del segmento", "startTime": 0.0, "endTime": 5.5 }
                ]
              }
              Divide el audio en segmentos de 5-15 segundos. Sé preciso con los tiempos.`,
            },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      },
      { timeout: 120000 }
    );

    const content = response.data.candidates[0]?.content?.parts[0]?.text || '{}';
    const parsed = JSON.parse(content);

    const segments: TranscriptionSegment[] = (parsed.segments || []).map((s: TranscriptionSegment) => ({
      text: s.text,
      startTime: s.startTime,
      endTime: s.endTime,
    }));

    return {
      fullText: segments.map(s => s.text).join(' '),
      segments,
      language: parsed.language || language,
      duration,
    };
  } finally {
    if (existsSync(audioPath)) await unlink(audioPath).catch(() => {});
  }
}

// ── OPENAI WHISPER TRANSCRIPTION ──────────────────────────────────
async function transcribeWithOpenAI(videoPath: string, language: string): Promise<Transcription> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada en .env.local');

  const audioPath = await extractAudio(videoPath);
  const duration = await getVideoDuration(videoPath);

  try {
    const { createReadStream } = await import('fs');
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', createReadStream(audioPath), { filename: 'audio.wav', contentType: 'audio/wav' });
    form.append('model', 'whisper-1');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    if (language !== 'auto') form.append('language', language);

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      form,
      {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${apiKey}` },
        timeout: 120000,
        maxBodyLength: Infinity,
      }
    );

    const segments: TranscriptionSegment[] = (response.data.segments || []).map((s: { text: string; start: number; end: number }) => ({
      text: s.text,
      startTime: s.start,
      endTime: s.end,
    }));

    return {
      fullText: response.data.text || '',
      segments,
      language: response.data.language || language,
      duration,
    };
  } finally {
    if (existsSync(audioPath)) await unlink(audioPath).catch(() => {});
  }
}

// ── GROQ WHISPER TRANSCRIPTION ────────────────────────────────────
async function transcribeWithGroq(videoPath: string, language: string): Promise<Transcription> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY no configurada en .env.local');

  const audioPath = await extractAudio(videoPath);
  const duration = await getVideoDuration(videoPath);

  try {
    const { createReadStream } = await import('fs');
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', createReadStream(audioPath), { filename: 'audio.wav', contentType: 'audio/wav' });
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');
    if (language !== 'auto') form.append('language', language);

    const response = await axios.post(
      'https://api.groq.com/openai/v1/audio/transcriptions',
      form,
      {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${apiKey}` },
        timeout: 120000,
        maxBodyLength: Infinity,
      }
    );

    const segments: TranscriptionSegment[] = (response.data.segments || []).map((s: { text: string; start: number; end: number }) => ({
      text: s.text,
      startTime: s.start,
      endTime: s.end,
    }));

    return {
      fullText: response.data.text || '',
      segments,
      language: response.data.language || language,
      duration,
    };
  } finally {
    if (existsSync(audioPath)) await unlink(audioPath).catch(() => {});
  }
}

// ── MAIN DISPATCHER ───────────────────────────────────────────────
export async function getTranscription(
  videoPath: string,
  provider: 'gemini' | 'openai' | 'groq' | 'openrouter',
  language: string
): Promise<Transcription> {
  console.log(`[transcription] Using provider: ${provider}, language: ${language}`);

  switch (provider) {
    case 'gemini':  return transcribeWithGemini(videoPath, language);
    case 'openai':  return transcribeWithOpenAI(videoPath, language);
    case 'groq':    return transcribeWithGroq(videoPath, language);
    case 'openrouter': return transcribeWithGemini(videoPath, language); // Fallback to Gemini for transcription
    default:        return transcribeWithGemini(videoPath, language);
  }
}
