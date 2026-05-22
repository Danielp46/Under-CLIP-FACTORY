'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Film, AlertCircle, Loader2, Zap, Subtitles, Settings2, Ratio } from 'lucide-react';
import axios from 'axios';
import clsx from 'clsx';
import type { ClipSettings, Job } from '@/app/page';

interface VideoUploaderProps {
  settings: ClipSettings;
  onSettingsChange?: (s: ClipSettings) => void;
  onJobCreated: (fileName: string, fileId: string) => void;
  onJobUpdate: (id: string, updates: Partial<Job>) => void;
}

const ACCEPTED_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
const MAX_SIZE_MB = 2000;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

export default function VideoUploader({ settings, onSettingsChange, onJobCreated, onJobUpdate }: VideoUploaderProps) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<{ duration: number; width: number; height: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ClipSettings>(key: K, value: ClipSettings[K]) => {
    onSettingsChange?.({ ...settings, [key]: value });
  };

  const validateFile = (f: File): string | null => {
    if (!ACCEPTED_TYPES.includes(f.type)) return 'Formato no soportado. Usa MP4, MOV, AVI, WebM o MKV.';
    if (f.size > MAX_SIZE_MB * 1024 * 1024) return `El vídeo supera el límite de ${MAX_SIZE_MB} MB.`;
    return null;
  };

  const handleFile = useCallback((f: File) => {
    setError(null);
    const err = validateFile(f);
    if (err) { setError(err); return; }

    setFile(f);
    // Extract video metadata via browser
    const url = URL.createObjectURL(f);
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.onloadedmetadata = () => {
      setVideoMeta({ duration: vid.duration, width: vid.videoWidth, height: vid.videoHeight });
      URL.revokeObjectURL(url);
    };
    vid.src = url;
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('video', file);
      
      console.log('Enviando:', settings.subtitlesPosition, settings.subtitlesPreset);
      formData.append('subtitlesPosition', settings.subtitlesPosition);
      formData.append('subtitlesPreset', settings.subtitlesPreset);
      formData.append('subtitleSize', settings.subtitleSize);
      formData.append('isUppercase', String(settings.isUppercase));
      
      // Incluimos explicitamente todo settings en el formData, incluyendo subtítulos
      formData.append('settings', JSON.stringify(settings));

      const { data } = await axios.post<{ jobId: string }>('/api/process/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) {
            const pct = Math.round((e.loaded / e.total) * 100);
            // Show upload progress in the job
          }
        },
      });

      onJobCreated(file.name, data.jobId);
      setFile(null);
      setVideoMeta(null);
    } catch (e: unknown) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.error || e.message : 'Error desconocido';
      setError(`Error al subir: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="animate-slide-up">
        <h2 className="text-2xl font-bold text-white">
          Subir <span className="gradient-text">Vídeo</span>
        </h2>
        <p className="text-gray-400 text-sm mt-1">
          Sube tu vídeo largo y la IA extraerá los mejores clips verticales automáticamente.
        </p>
      </div>

      {/* Drop zone */}
      <div
        className={clsx('drop-zone p-12 text-center transition-all', dragging && 'dragging')}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !file && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {!file ? (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto">
              <Upload size={28} className="text-brand-400" />
            </div>
            <div>
              <p className="text-gray-200 font-medium">Arrastra tu vídeo aquí</p>
              <p className="text-gray-500 text-sm mt-1">o haz clic para seleccionar</p>
            </div>
            <div className="flex items-center justify-center gap-3 text-xs text-gray-600">
              <span className="px-2 py-1 rounded bg-surface-700 font-mono">MP4</span>
              <span className="px-2 py-1 rounded bg-surface-700 font-mono">MOV</span>
              <span className="px-2 py-1 rounded bg-surface-700 font-mono">AVI</span>
              <span className="px-2 py-1 rounded bg-surface-700 font-mono">WebM</span>
              <span className="px-2 py-1 rounded bg-surface-700 font-mono">MKV</span>
              <span className="text-gray-500">· Máx. 2GB</span>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-accent-green/10 border border-accent-green/20 flex items-center justify-center mx-auto">
              <Film size={28} className="text-accent-green" />
            </div>
            <div>
              <p className="text-gray-100 font-semibold truncate max-w-xs mx-auto">{file.name}</p>
              <div className="flex items-center justify-center gap-4 mt-2 text-xs text-gray-500 font-mono">
                <span>{formatBytes(file.size)}</span>
                {videoMeta && (
                  <>
                    <span>·</span>
                    <span>{videoMeta.width}×{videoMeta.height}</span>
                    <span>·</span>
                    <span>{formatDuration(videoMeta.duration)}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setVideoMeta(null); }}
              className="text-xs text-gray-500 hover:text-red-400 transition-colors"
            >
              Cambiar archivo
            </button>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 animate-slide-up">
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* ── Subtitles ─────────────────────────────────────────────── */}
      <Section title="Diseño de Subtítulos Moderno" icon={Subtitles}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Left Panel: Selectors */}
          <div className="space-y-5">
            <Field label="Estilo de subtítulos">
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['dynamic', 'Dinámico', '✨ Enfoque viral'],
                  ['static',  'Estático', '📝 Línea estándar'],
                  ['none',    'Sin subs', '🚫 Vídeo limpio'],
                ] as const).map(([style, label, desc]) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => set('subtitleStyle', style)}
                    className={`py-3 px-2 rounded-lg text-left transition-all border ${
                      settings.subtitleStyle === style
                        ? 'bg-brand-500/20 border-brand-500/50'
                        : 'bg-surface-700 border-white/5 hover:border-white/10'
                    }`}
                  >
                    <p className={`text-xs font-bold ${settings.subtitleStyle === style ? 'text-brand-300' : 'text-gray-300'}`}>{label}</p>
                    <p className="text-[9px] text-gray-500 mt-0.5">{desc}</p>
                  </button>
                ))}
              </div>
            </Field>

            {settings.subtitleStyle !== 'none' && (
              <>
                <Field label="Posición de subtítulos" hint={`Zona segura: ${settings.subtitlesPosition}`}>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['top',    'Arriba'],
                      ['center', 'Centro'],
                      ['bottom', 'Abajo'],
                    ] as const).map(([pos, label]) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => set('subtitlesPosition', pos as any)}
                        className={`py-2 px-1 rounded-lg text-center transition-all border text-xs font-bold ${
                          settings.subtitlesPosition === pos
                            ? 'bg-brand-500/20 border-brand-500/50 text-brand-300'
                            : 'bg-surface-700 border-white/5 hover:border-white/10 text-gray-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Preset Cyberpunk de color" hint={
                  settings.subtitlesPreset === 'preset1' ? 'Core Tech' :
                  settings.subtitlesPreset === 'preset2' ? 'Hacker Underground' : 'Cyber Dual-Neon'
                }>
                  <div className="space-y-2">
                    {([
                      ['preset1', 'Core Tech', 'Blanco Hielo / Morado Neón', 'bg-gradient-to-r from-[#FFE2FF] to-[#9D00FF]'],
                      ['preset2', 'Hacker Underground', 'Blanco Hielo / Rosa Magenta', 'bg-gradient-to-r from-[#FFE2FF] to-[#FF007F]'],
                      ['preset3', 'Cyber Dual-Neon', 'Cian Eléctrico / Rosa Magenta', 'bg-gradient-to-r from-[#00F0FF] to-[#FF007F]'],
                    ] as const).map(([id, label, colorsDesc, gradientBg]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => set('subtitlesPreset', id as any)}
                        className={`w-full p-2.5 rounded-lg transition-all border text-left flex items-center justify-between ${
                          settings.subtitlesPreset === id
                            ? 'bg-brand-500/15 border-brand-500/50'
                            : 'bg-surface-700 border-white/5 hover:border-white/10'
                        }`}
                      >
                        <div>
                          <p className={`text-xs font-bold ${settings.subtitlesPreset === id ? 'text-brand-300' : 'text-gray-200'}`}>{label}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">{colorsDesc}</p>
                        </div>
                        <div className={`w-12 h-3.5 rounded border border-white/10 ${gradientBg}`} />
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Tamano de subtitulo" hint={settings.subtitleSize}>
                  <div className="grid grid-cols-2 gap-2">
                    {(['Mediana', 'Grande'] as const).map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => set('subtitleSize', size)}
                        className={`py-2 px-2 rounded-lg text-xs font-bold transition-all border ${
                          settings.subtitleSize === size
                            ? 'bg-brand-500/20 border-brand-500/50 text-brand-300'
                            : 'bg-surface-700 border-white/5 hover:border-white/10 text-gray-400'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Todo Mayusculas" hint={settings.isUppercase ? 'Activado' : 'Desactivado'}>
                  <label className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={settings.isUppercase}
                      onChange={(e) => set('isUppercase', e.target.checked)}
                      className="accent-brand-500"
                    />
                    Activar mayusculas en subtitulos
                  </label>
                </Field>
              </>
            )}
          </div>

          {/* Right Panel: Smartphone Simulator Preview */}
          <div className="flex justify-center pt-2">
            <div className="relative w-[210px] h-[370px] bg-black rounded-[36px] border-[6px] border-surface-600 shadow-2xl overflow-hidden shrink-0 flex flex-col justify-between p-3 select-none">
              {/* Notch / Dynamic Island */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full z-20 border border-white/5 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-surface-900 border border-white/5 shrink-0" />
              </div>

              {/* Mock Screen Content */}
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-950 via-slate-900 to-zinc-950 flex flex-col justify-center items-center z-0 overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:14px_24px]" />
                
                <div className="w-full h-[118px] bg-surface-800/40 border-y border-white/5 flex items-center justify-center backdrop-blur-sm relative shadow-inner overflow-hidden">
                  <span className="text-[9px] font-mono text-gray-500 uppercase tracking-widest animate-pulse">Mock Video Player</span>
                  <div className="absolute bottom-1 right-2 text-[7px] font-mono text-cyan-400 bg-black/60 px-1 py-0.5 rounded">16:9 NATIVE</div>
                </div>

                <div className="absolute w-24 h-24 rounded-full bg-brand-500/10 blur-xl top-[60%] left-1/3" />
                <div className="absolute w-24 h-24 rounded-full bg-accent-cyan/10 blur-xl top-[20%] right-1/4" />
              </div>

              {/* Real-time Subtitles Overlaid */}
              {settings.subtitleStyle !== 'none' && (
                <div
                  className={`absolute left-0 right-0 px-2 flex justify-center z-10 pointer-events-none transition-all duration-300 ease-out`}
                  style={{
                    top: settings.subtitlesPosition === 'top' ? '22%' :
                         settings.subtitlesPosition === 'center' ? '46%' : 'auto',
                    bottom: settings.subtitlesPosition === 'bottom' ? '18%' : 'auto',
                    transform: settings.subtitlesPosition === 'center' ? 'translateY(-50%)' : 'none',
                  }}
                >
                  <div
                    className="text-center font-bold tracking-wide uppercase leading-snug px-1 py-0.5 select-none"
                    style={{
                      fontFamily: 'Impact, sans-serif',
                      fontSize: '15px',
                      textShadow: '-1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, -2px 0 0 #000, 2px 0 0 #000, 0 -2px 0 #000, 0 2px 0 #000',
                    }}
                  >
                    {settings.subtitlesPreset === 'preset1' && (
                      <>
                        <span style={{ color: '#FFE2FF' }}>La nueva </span>
                        <span style={{ color: '#9D00FF' }}>IA </span>
                        <span style={{ color: '#FFE2FF' }}>es </span>
                        <span style={{ color: '#9D00FF' }}>brutal</span>
                      </>
                    )}
                    {settings.subtitlesPreset === 'preset2' && (
                      <>
                        <span style={{ color: '#FFE2FF' }}>La nueva </span>
                        <span style={{ color: '#FF007F' }}>IA </span>
                        <span style={{ color: '#FFE2FF' }}>es </span>
                        <span style={{ color: '#FF007F' }}>brutal</span>
                      </>
                    )}
                    {settings.subtitlesPreset === 'preset3' && (
                      <>
                        <span style={{ color: '#00F0FF' }}>La nueva </span>
                        <span style={{ color: '#FF007F' }}>IA </span>
                        <span style={{ color: '#00F0FF' }}>es </span>
                        <span style={{ color: '#FF007F' }}>brutal</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Section>

      {/* ── Clip parameters ──────────────────────────────────────── */}
      <Section title="Parámetros de Clips" icon={Settings2}>
        <Field label="Número máximo de clips" hint={`${settings.maxClips} clips`}>
          <input
            type="range" min={1} max={20} value={settings.maxClips}
            onChange={e => set('maxClips', parseInt(e.target.value))}
            className="w-full accent-brand-500"
          />
          <div className="flex justify-between text-xs text-gray-600 font-mono mt-1">
            <span>1</span><span>5</span><span>10</span><span>15</span><span>20</span>
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Duración mínima" hint={`${settings.minDuration}s`}>
            <input
              type="range" min={10} max={60} value={settings.minDuration}
              onChange={e => set('minDuration', parseInt(e.target.value))}
              className="w-full accent-brand-500"
            />
          </Field>
          <Field label="Duración máxima" hint={`${settings.maxDuration}s`}>
            <input
              type="range" min={30} max={180} value={settings.maxDuration}
              onChange={e => set('maxDuration', parseInt(e.target.value))}
              className="w-full accent-brand-500"
            />
          </Field>
        </div>
      </Section>

      {/* ── Format ───────────────────────────────────────────────── */}
      <Section title="Formato de Salida" icon={Ratio}>
        <Field label="Relación de aspecto">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['9:16', 'TikTok / Reels', '📱'],
              ['1:1',  'Instagram',      '⬛'],
              ['4:5',  'Feed',           '🖼️'],
            ] as const).map(([ratio, label, emoji]) => (
              <button
                key={ratio}
                type="button"
                onClick={() => set('aspectRatio', ratio as any)}
                className={`py-3 rounded-lg text-center transition-all border ${
                  settings.aspectRatio === ratio
                    ? 'bg-brand-500/20 border-brand-500/50'
                    : 'bg-surface-700 border-white/5 hover:border-white/10'
                }`}
              >
                <div className="text-xl mb-1">{emoji}</div>
                <div className={`text-xs font-bold ${settings.aspectRatio === ratio ? 'text-brand-300' : 'text-gray-400'}`}>{ratio}</div>
                <div className="text-[10px] text-gray-600">{label}</div>
              </button>
            ))}
          </div>
        </Field>
      </Section>

      {/* Action button */}
      {file && (
        <div className="flex gap-3 animate-slide-up">
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="btn-primary flex items-center gap-2 flex-1 justify-center py-3"
          >
            {uploading ? (
              <><Loader2 size={16} className="animate-spin" /> Subiendo y procesando...</>
            ) : (
              <><Zap size={16} /> Procesar con IA → {settings.maxClips} clips</>
            )}
          </button>
        </div>
      )}

      {/* Settings summary */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Configuración activa</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Clips', value: settings.maxClips },
            { label: 'Ratio', value: settings.aspectRatio },
            { label: 'Duración', value: `${settings.minDuration}–${settings.maxDuration}s` },
            { label: 'IA', value: settings.aiProvider.toUpperCase() },
          ].map(({ label, value }) => (
            <div key={label} className="bg-surface-700 rounded-lg p-2.5 text-center">
              <p className="text-[11px] text-gray-500">{label}</p>
              <p className="text-sm font-bold text-brand-400 mt-0.5 font-mono">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Re-using these components locally for the subtitles UI
function Section({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode;
}) {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-white/5">
        <div className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center">
          <Icon size={14} className="text-brand-400" />
        </div>
        <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-300 font-medium">{label}</label>
        {hint && <span className="text-xs text-gray-600">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
