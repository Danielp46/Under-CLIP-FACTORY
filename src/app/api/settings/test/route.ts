import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    const { provider, apiKey } = await request.json();

    if (!provider || !apiKey) {
      return NextResponse.json({ success: false, error: 'Faltan parámetros' }, { status: 400 });
    }

    if (apiKey === '********') {
      return NextResponse.json({ success: false, error: 'Por favor, introduce una clave real para probar.' }, { status: 400 });
    }

    let success = false;
    let errorMessage = 'Proveedor no soportado para test';

    try {
      if (provider === 'gemini') {
        // Simple model list fetch to verify API key
        const res = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        success = res.status === 200;
      } 
      else if (provider === 'openrouter') {
        const res = await axios.get('https://openrouter.ai/api/v1/auth/key', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        success = res.status === 200;
      } 
      else if (provider === 'openai') {
        const res = await axios.get('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        success = res.status === 200;
      } 
      else if (provider === 'groq') {
        const res = await axios.get('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        success = res.status === 200;
      }

      if (success) {
        return NextResponse.json({ success: true });
      } else {
        return NextResponse.json({ success: false, error: 'Verificación fallida: Respuesta inválida' });
      }

    } catch (apiError: any) {
      console.error(`[Test API] Error testing ${provider}:`, apiError?.response?.data || apiError.message);
      let errorDesc = apiError?.response?.data?.error?.message || apiError.message;
      return NextResponse.json({ success: false, error: errorDesc || 'Credenciales inválidas o error de red' });
    }

  } catch (error) {
    return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 });
  }
}
