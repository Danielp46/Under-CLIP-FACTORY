import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const metaPath = path.join(process.cwd(), 'uploads', jobId, 'job.json');

    const raw = await readFile(metaPath, 'utf-8');
    const job = JSON.parse(raw);

    return NextResponse.json(job);
  } catch (error) {
    return NextResponse.json({ error: 'Job no encontrado' }, { status: 404 });
  }
}
