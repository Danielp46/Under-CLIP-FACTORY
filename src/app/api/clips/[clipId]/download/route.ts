import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ clipId: string }> }
) {
  try {
    const { clipId } = await params;

    // Find clip in output directory
    const outputDir = path.join(process.cwd(), 'output', 'clips');
    const clipPath = path.join(outputDir, `${clipId}.mp4`);

    if (!existsSync(clipPath)) {
      return NextResponse.json({ error: 'Clip no encontrado' }, { status: 404 });
    }

    // Stream video file
    const stream = createReadStream(clipPath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${clipId}.mp4"`,
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Error al descargar clip' }, { status: 500 });
  }
}
