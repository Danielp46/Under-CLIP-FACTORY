import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const ENV_PATH = path.join(process.cwd(), '.env.local');

// Modelo por defecto recomendado para cada proveedor
export const DEFAULT_MODELS: Record<string, string> = {
  gemini:     'gemini-2.0-flash',
  openrouter: 'google/gemini-2.5-flash',
  openai:     'gpt-4o-mini',
  groq:       'llama-3.3-70b-versatile',
};

async function readEnvFile(): Promise<Record<string, string>> {
  try {
    const content = await readFile(ENV_PATH, 'utf-8');
    const env: Record<string, string> = {};
    for (const line of content.split('\n')) {
      if (!line || line.trim().startsWith('#')) continue;
      const idx = line.indexOf('=');
      if (idx > -1) {
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        env[key] = val;
      }
    }
    return env;
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const env = await readEnvFile();

    const mask = (val: string | undefined, placeholder: string) =>
      val && val !== placeholder ? '********' : '';

    const defaultProvider = env.DEFAULT_AI_PROVIDER || 'gemini';
    const defaultModel    = env.DEFAULT_AI_MODEL    || DEFAULT_MODELS[defaultProvider] || 'gemini-2.0-flash';

    return NextResponse.json({
      GEMINI_API_KEY:     mask(env.GEMINI_API_KEY,     'your_gemini_api_key_here'),
      OPENROUTER_API_KEY: mask(env.OPENROUTER_API_KEY, 'your_openrouter_api_key_here'),
      OPENAI_API_KEY:     mask(env.OPENAI_API_KEY,     'your_openai_api_key_here'),
      GROQ_API_KEY:       mask(env.GROQ_API_KEY,       'your_groq_api_key_here'),
      defaultProvider,
      defaultModel,
    });
  } catch {
    return NextResponse.json({ error: 'Error al leer la configuración' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const updates = await request.json();

    let content = '';
    try {
      content = await readFile(ENV_PATH, 'utf-8');
    } catch {
      content = '# Auto-generated config\n';
    }

    let lines = content.split(/\r?\n/);

    const updateOrAdd = (key: string, val: string) => {
      if (val === '********') return; // valor ofuscado sin cambios → ignorar
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith(`${key}=`)) {
          lines[i] = `${key}=${val}`;
          found = true;
          break;
        }
      }
      if (!found && val) lines.push(`${key}=${val}`);
      // Inyectar en el runtime actual para no requerir reinicio
      if (val) process.env[key] = val;
    };

    if ('GEMINI_API_KEY'     in updates) updateOrAdd('GEMINI_API_KEY',     updates.GEMINI_API_KEY);
    if ('OPENROUTER_API_KEY' in updates) updateOrAdd('OPENROUTER_API_KEY', updates.OPENROUTER_API_KEY);
    if ('OPENAI_API_KEY'     in updates) updateOrAdd('OPENAI_API_KEY',     updates.OPENAI_API_KEY);
    if ('GROQ_API_KEY'       in updates) updateOrAdd('GROQ_API_KEY',       updates.GROQ_API_KEY);

    // ── Proveedor por defecto ────────────────────────────────────────
    if ('defaultProvider' in updates && updates.defaultProvider) {
      updateOrAdd('DEFAULT_AI_PROVIDER', updates.defaultProvider);
      // Si no se especifica modelo, usar el recomendado del proveedor
      const model = updates.defaultModel || DEFAULT_MODELS[updates.defaultProvider] || '';
      if (model) updateOrAdd('DEFAULT_AI_MODEL', model);
    }

    await writeFile(ENV_PATH, lines.join('\n'), 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save settings error:', error);
    return NextResponse.json({ error: 'Error al guardar la configuración' }, { status: 500 });
  }
}
