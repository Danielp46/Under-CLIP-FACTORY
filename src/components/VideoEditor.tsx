'use client';

import { useRef, useState } from 'react';
import axios from 'axios';
import { Captions, Loader2, Upload } from 'lucide-react';

type Language = 'es' | 'en';

export default function VideoEditor() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<Language>('es');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleGenerateSrt = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('video', file);
      formData.append('language', language);

      const response = await axios.post('/api/process/srt', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/x-subrip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${file.name.replace(/\.[^.]+$/, '')}.srt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        setError(e.response?.data?.error || e.message);
      } else {
        setError('Error al generar subtitulos SRT');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-white">Editor de video</h2>
        <p className="text-sm text-gray-400 mt-1">Sube un video y genera su archivo SRT.</p>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <label className="text-sm text-gray-300 font-medium">Video</label>
          <div
            className="mt-2 drop-zone p-6 text-center cursor-pointer"
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <Upload className="mx-auto text-brand-400" size={20} />
            <p className="text-sm text-gray-300 mt-2">{file ? file.name : 'Selecciona un video'}</p>
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-300 font-medium">Idioma</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            className="input-base mt-2"
          >
            <option value="es">Espanol (es)</option>
            <option value="en">English (en)</option>
          </select>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="button"
          disabled={!file || loading}
          onClick={handleGenerateSrt}
          className="btn-primary flex items-center justify-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Captions size={16} />}
          {loading ? 'Generando SRT...' : 'Generar SRT'}
        </button>
      </div>
    </div>
  );
}
