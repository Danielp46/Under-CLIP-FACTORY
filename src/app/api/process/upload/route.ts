import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// App Router: fuerza modo dinámico para que Next.js no intente pre-renderizar
// esta ruta y acepte cuerpos grandes (FormData con vídeo).
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const videoFile = formData.get('video') as File | null;
    const settingsRaw = formData.get('settings') as string | null;
    const subtitlesPosition = formData.get('subtitlesPosition') as string | null;
    const subtitlesPreset = formData.get('subtitlesPreset') as string | null;
    const subtitleSize = formData.get('subtitleSize') as string | null;
    const isUppercaseRaw = formData.get('isUppercase') as string | null;
    const isUppercase = isUppercaseRaw === 'true';

    console.log('Recibido en Backend:', subtitlesPosition, subtitlesPreset);

    if (!videoFile) {
      return NextResponse.json({ error: 'No se recibió ningún vídeo' }, { status: 400 });
    }

    const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
    if (subtitlesPosition) settings.subtitlesPosition = subtitlesPosition;
    if (subtitlesPreset) settings.subtitlesPreset = subtitlesPreset;
    if (subtitleSize === 'Mediana' || subtitleSize === 'Grande') settings.subtitleSize = subtitleSize;
    settings.isUppercase = isUppercase;

    const jobId = uuidv4();

    // Create upload directory
    const uploadsDir = path.join(process.cwd(), 'uploads', jobId);
    await mkdir(uploadsDir, { recursive: true });

    // Save video file
    const buffer = Buffer.from(await videoFile.arrayBuffer());
    const ext = path.extname(videoFile.name) || '.mp4';
    const videoPath = path.join(uploadsDir, `source${ext}`);
    await writeFile(videoPath, buffer);

    // Save job metadata
    const jobMeta = {
      id: jobId,
      fileName: videoFile.name,
      videoPath,
      settings,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    await writeFile(
      path.join(uploadsDir, 'job.json'),
      JSON.stringify(jobMeta, null, 2)
    );

    // Start processing asynchronously (fire and forget)
    // We return the jobId immediately so the UI can track progress via polling
    startProcessingJob(jobId, videoPath, settings).catch(console.error);

    return NextResponse.json({ jobId, status: 'pending' }, { status: 201 });
  } catch (error) {
    console.error('[upload] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

// Async job processor — runs in background after returning 201
async function startProcessingJob(
  jobId: string,
  videoPath: string,
  settings: Record<string, unknown>
) {
  // Dynamic import to avoid loading heavy modules at build time
  const { processVideo } = await import('@/services/videoProcessor');
  await processVideo(jobId, videoPath, settings);
}
