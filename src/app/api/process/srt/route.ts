import { NextRequest, NextResponse } from 'next/server';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getGroqTranscription, type TranscriptionSegment, type SupportedTranscriptionLanguage } from '@/services/transcriptionService';

export const dynamic = 'force-dynamic';

function formatSrtTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe - Math.floor(safe)) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function jsonToSrt(words: TranscriptionSegment[]): string {
  return words
    .map((word, index) => {
      const start = formatSrtTime(word.startTime);
      const end = formatSrtTime(word.endTime);
      const text = (word.text || '').trim();
      return `${index + 1}\n${start} --> ${end}\n${text}\n`;
    })
    .join('\n');
}

export async function POST(request: NextRequest) {
  let videoPath: string | null = null;

  try {
    const formData = await request.formData();
    const videoFile = formData.get('video') as File | null;
    const languageRaw = (formData.get('language') as string | null) || 'es';
    const language: SupportedTranscriptionLanguage = languageRaw === 'en' ? 'en' : 'es';

    if (!videoFile) {
      return NextResponse.json({ error: 'No se recibio ningun video' }, { status: 400 });
    }

    const jobId = uuidv4();
    const uploadsDir = path.join(process.cwd(), 'uploads', jobId);
    await mkdir(uploadsDir, { recursive: true });

    const buffer = Buffer.from(await videoFile.arrayBuffer());
    const ext = path.extname(videoFile.name) || '.mp4';
    videoPath = path.join(uploadsDir, `source${ext}`);
    await writeFile(videoPath, buffer);

    const transcription = await getGroqTranscription(videoPath, language);
    const srtText = jsonToSrt(transcription.segments);
    const fileName = `${videoFile.name.replace(/\.[^.]+$/, '')}.srt`;

    return new NextResponse(srtText, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-subrip; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[srt] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 500 }
    );
  } finally {
    if (videoPath && existsSync(videoPath)) {
      await unlink(videoPath).catch(() => {});
    }
  }
}
