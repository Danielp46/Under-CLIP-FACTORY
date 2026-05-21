/**
 * aiAnalyzer.ts
 * Analiza la transcripción y selecciona los mejores momentos para extraer clips.
 * Usa IA para evaluar relevancia, engagement y viralidad de cada segmento.
 */

import axios from 'axios';
import type { Transcription, TranscriptionSegment } from './transcriptionService';
import type { ProcessingSettings, ClipSegment } from './videoProcessor';

interface RawClipSuggestion {
  title: string;
  startTime: number;
  endTime: number;
  score: number;
  reason: string;
  transcript: string;
}

// ── BUILD SEGMENTS OF TARGET DURATION ────────────────────────────
function buildCandidateSegments(
  transcription: Transcription,
  minDuration: number,
  maxDuration: number
): Array<{ text: string; startTime: number; endTime: number }> {
  const candidates: Array<{ text: string; startTime: number; endTime: number }> = [];
  const segs = transcription.segments;

  let i = 0;
  while (i < segs.length) {
    const start = segs[i].startTime;
    let end = segs[i].endTime;
    let text = segs[i].text;
    let j = i + 1;

    while (j < segs.length && end - start < minDuration) {
      end = segs[j].endTime;
      text += ' ' + segs[j].text;
      j++;
    }

    if (end - start >= minDuration && end - start <= maxDuration + 15) {
      candidates.push({ text: text.trim(), startTime: start, endTime: Math.min(end, start + maxDuration) });
    }

    i = j;
  }

  return candidates;
}

// ── GEMINI ANALYZER ───────────────────────────────────────────────
async function analyzeWithGemini(
  transcription: Transcription,
  settings: ProcessingSettings
): Promise<RawClipSuggestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const candidates = buildCandidateSegments(transcription, settings.minDuration, settings.maxDuration);

  const prompt = `Eres un experto en contenido viral para redes sociales (TikTok, Instagram Reels, YouTube Shorts).
  
  Analiza esta transcripción de vídeo y selecciona los ${settings.maxClips} mejores momentos para crear clips virales.
  
  TRANSCRIPCIÓN COMPLETA:
  "${transcription.fullText}"
  
  SEGMENTOS CANDIDATOS:
  ${candidates.map((c, i) => `[${i}] ${c.startTime.toFixed(1)}s-${c.endTime.toFixed(1)}s: "${c.text}"`).join('\n')}
  
  CRITERIOS (valora del 0 al 1):
  - Contenido impactante o emocionante (ganchos, revelaciones, humor)
  - Autocontenido (tiene sentido sin contexto previo)
  - Duración entre ${settings.minDuration}s y ${settings.maxDuration}s
  - Potencial viral para formato ${settings.aspectRatio}
  
  Devuelve SOLO un JSON (sin markdown):
  {
    "clips": [
      {
        "title": "Título atractivo corto (máx 8 palabras)",
        "startTime": 0.0,
        "endTime": 45.0,
        "score": 0.95,
        "reason": "Por qué es viral",
        "transcript": "texto exacto del segmento"
      }
    ]
  }`;

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    },
    { timeout: 60000 }
  );

  const content = response.data.candidates[0]?.content?.parts[0]?.text || '{"clips":[]}';
  const parsed = JSON.parse(content);
  return parsed.clips || [];
}

// ── HEURISTIC FALLBACK (no API key needed) ────────────────────────
function analyzeHeuristic(
  transcription: Transcription,
  settings: ProcessingSettings
): RawClipSuggestion[] {
  const candidates = buildCandidateSegments(transcription, settings.minDuration, settings.maxDuration);

  const VIRAL_KEYWORDS = [
    'increíble', 'nunca', 'secreto', 'truco', 'error', 'clave',
    'importante', 'jamás', 'sorprendente', 'brutal', 'terrible',
    'amazing', 'secret', 'never', 'always', 'best', 'worst',
  ];

  return candidates
    .map(c => {
      const wordCount = c.text.split(' ').length;
      const hasKeyword = VIRAL_KEYWORDS.some(k => c.text.toLowerCase().includes(k));
      const isQuestion = c.text.includes('?');
      const duration = c.endTime - c.startTime;
      const idealDuration = (settings.minDuration + settings.maxDuration) / 2;
      const durationScore = 1 - Math.abs(duration - idealDuration) / idealDuration;

      const score = Math.min(1, (
        (wordCount > 30 ? 0.3 : 0.1) +
        (hasKeyword ? 0.4 : 0) +
        (isQuestion ? 0.2 : 0) +
        durationScore * 0.3
      ));

      return {
        title: c.text.slice(0, 50).trim() + '…',
        startTime: c.startTime,
        endTime: c.endTime,
        score,
        reason: 'Análisis heurístico (sin clave de API)',
        transcript: c.text,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, settings.maxClips);
}

// ── MAIN ANALYZER ─────────────────────────────────────────────────
export async function analyzeClips(
  transcription: Transcription,
  settings: ProcessingSettings
): Promise<ClipSegment[]> {
  let raw: RawClipSuggestion[];

  try {
    if (settings.aiProvider === 'gemini' && process.env.GEMINI_API_KEY) {
      raw = await analyzeWithGemini(transcription, settings);
    } else {
      // Fallback heurístico si no hay clave configurada
      raw = analyzeHeuristic(transcription, settings);
    }
  } catch (error) {
    console.warn('[aiAnalyzer] AI failed, using heuristic fallback:', error);
    raw = analyzeHeuristic(transcription, settings);
  }

  // Normalize and sort by score
  return raw
    .slice(0, settings.maxClips)
    .map(r => ({
      id: '',  // assigned during render
      title: r.title,
      startTime: r.startTime,
      endTime: r.endTime,
      score: r.score,
      transcript: r.transcript,
    }))
    .sort((a, b) => b.score - a.score);
}
