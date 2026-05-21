/**
 * aiManager.ts
 * Motor de IA unificado para analizar la transcripción y seleccionar clips virales.
 * Soporta Gemini, OpenRouter, OpenAI y Groq.
 */

import axios from 'axios';
import type { Transcription } from './transcriptionService';
import type { ProcessingSettings, ClipSegment } from './videoProcessor';

interface AIResponseClip {
  title: string;
  hook: string;
  start: string; // HH:MM:SS format
  end: string;   // HH:MM:SS format
  reason: string;
  keywords?: string[];
}

// ── UTILITIES ─────────────────────────────────────────────────────

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function parseTimeToSeconds(timeStr: string): number {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(timeStr) || 0;
}

// Construye segmentos candidatos más grandes para pasar al LLM como referencia
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

// ── SYSTEM PROMPT ─────────────────────────────────────────────────

function buildPrompt(transcription: Transcription, settings: ProcessingSettings, candidates: any[]): string {
  return `Actúa como un experto en retención de Shorts, TikTok y Reels.
  
Tu objetivo es analizar la transcripción de este vídeo y seleccionar los ${settings.maxClips} mejores momentos para crear clips virales.

CRITERIOS ESTRICTOS:
1. Contenido de alto impacto (ganchos fuertes, revelaciones, humor, curiosidad).
2. Autocontenido (debe entenderse sin contexto externo).
3. Duración de los clips: entre ${settings.minDuration} y ${settings.maxDuration} segundos.

TRANSCRIPCIÓN COMPLETA:
"${transcription.fullText}"

REFERENCIA DE TIEMPOS (CANDIDATOS):
${candidates.map((c, i) => `[${i}] ${formatSrtTime(c.startTime)}-${formatSrtTime(c.endTime)}: "${c.text}"`).join('\n')}

INSTRUCCIONES DE SALIDA:
Devuelve ESTRICTAMENTE un array JSON válido con la siguiente estructura y NADA MÁS. NO uses bloques de código markdown, NO escribas explicaciones antes o después del JSON.

[
  {
    "title": "Título viral corto",
    "hook": "Frase ganadora inicial que engancha los primeros 3 segundos",
    "start": "00:01:23",
    "end": "00:01:55",
    "reason": "Por qué esto retendrá a la audiencia",
    "keywords": ["palabra1", "palabra2", "palabra3"]
  }
]
`;
}

// Extrae JSON si el modelo no respeta no usar markdown
function extractJsonArray(text: string): AIResponseClip[] {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
    return JSON.parse(text);
  } catch (error) {
    console.error("Error parsing AI JSON:", text.substring(0, 200));
    throw new Error("El modelo no devolvió un JSON válido.");
  }
}

// ── PROVIDER CALLS ────────────────────────────────────────────────

async function callOpenAICompatibleAPI(
  url: string,
  apiKey: string,
  model: string,
  prompt: string
): Promise<AIResponseClip[]> {
  const response = await axios.post(
    url,
    {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    }
  );

  const content = response.data.choices[0]?.message?.content || '[]';
  return extractJsonArray(content);
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string
): Promise<AIResponseClip[]> {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    },
    { timeout: 120000 }
  );

  const content = response.data.candidates[0]?.content?.parts[0]?.text || '[]';
  return extractJsonArray(content);
}

// ── MAIN ANALYZER ─────────────────────────────────────────────────

export async function analyzeClips(
  transcription: Transcription,
  settings: ProcessingSettings
): Promise<ClipSegment[]> {
  const candidates = buildCandidateSegments(transcription, settings.minDuration, settings.maxDuration);
  const prompt = buildPrompt(transcription, settings, candidates);
  
  let rawClips: AIResponseClip[] = [];

  try {
    const provider = settings.aiProvider;
    const model = settings.aiModel;

    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');
      rawClips = await callGemini(apiKey, model, prompt);
      
    } else if (provider === 'openrouter') {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error('OPENROUTER_API_KEY no configurada');
      rawClips = await callOpenAICompatibleAPI('https://openrouter.ai/api/v1/chat/completions', apiKey, model, prompt);
      
    } else if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY no configurada');
      rawClips = await callOpenAICompatibleAPI('https://api.openai.com/v1/chat/completions', apiKey, model, prompt);
      
    } else if (provider === 'groq') {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error('GROQ_API_KEY no configurada');
      rawClips = await callOpenAICompatibleAPI('https://api.groq.com/openai/v1/chat/completions', apiKey, model, prompt);
    }

  } catch (error) {
    console.warn('[aiManager] API Failed. Using heuristic fallback:', error instanceof Error ? error.message : String(error));
    // Fallback simple if API fails
    rawClips = [{
      title: "Clip de Respaldo",
      hook: "Mira esto",
      start: formatSrtTime(candidates[0]?.startTime || 0),
      end: formatSrtTime(candidates[0]?.endTime || settings.maxDuration),
      reason: "Fallback heurístico por error de API",
    }];
  }

  // Parse and match with transcript
  return rawClips.map((clip, index) => {
    const startTime = parseTimeToSeconds(clip.start);
    const endTime = parseTimeToSeconds(clip.end);
    
    // Filtramos segmentos que se solapan y los clampamos a los límites del clip
    const clampedSegments = transcription.segments
      .filter(s => s.startTime < endTime && s.endTime > startTime) // Se solapa
      .map(s => {
        const originalStart = s.startTime;
        const originalEnd = s.endTime;
        const clampedStart = Math.max(startTime, s.startTime);
        const clampedEnd = Math.min(endTime, s.endTime);
        
        console.log(`Procesando bloque: "${s.text.substring(0, 20)}..." Start: ${originalStart} End: ${originalEnd} ClipRange: ${startTime} - ${endTime}`);
        
        return {
          ...s,
          startTime: clampedStart,
          endTime: clampedEnd
        };
      })
      .filter(s => s.endTime - s.startTime > 0);

    const transcriptText = clampedSegments.map(s => s.text).join(' ') || clip.hook;

    return {
      id: '', // assigned later
      title: clip.title,
      startTime,
      endTime,
      score: 1.0 - (index * 0.1), // Mock score based on order
      transcript: transcriptText,
      transcriptSegments: clampedSegments,
      keywords: clip.keywords || [],
    };
  });
}
