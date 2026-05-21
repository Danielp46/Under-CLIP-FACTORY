'use client';

import { useState, useEffect } from 'react';
import {
  Cpu, Key,
  CheckCircle, XCircle, Loader2, Save, Star,
} from 'lucide-react';
import axios from 'axios';
import type { ClipSettings as ClipSettingsType } from '@/app/page';

interface ClipSettingsProps {
  settings: ClipSettingsType;
  onChange: (s: ClipSettingsType) => void;
}

// Map proveedor → modelo recomendado
const DEFAULT_MODELS: Record<string, string> = {
  gemini:     'gemini-2.0-flash',
  openrouter: 'google/gemini-2.5-flash',
  openai:     'gpt-4o-mini',
  groq:       'llama-3.3-70b-versatile',
};

const PROVIDERS = [
  { id: 'gemini',     label: '✦ Gemini',     color: 'from-blue-500 to-cyan-400' },
  { id: 'openrouter', label: '🌐 OpenRouter', color: 'from-purple-500 to-pink-400' },
  { id: 'openai',     label: '⊕ OpenAI',     color: 'from-green-500 to-emerald-400' },
  { id: 'groq',       label: '⚡ Groq',       color: 'from-amber-500 to-orange-400' },
] as const;

type Provider = typeof PROVIDERS[number]['id'];

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

export default function ClipSettings({ settings, onChange }: ClipSettingsProps) {
  const set = <K extends keyof ClipSettingsType>(key: K, value: ClipSettingsType[K]) =>
    onChange({ ...settings, [key]: value });

  // ── API Keys state ───────────────────────────────────────────────
  const [apiKeys, setApiKeys] = useState({
    GEMINI_API_KEY:     '',
    OPENROUTER_API_KEY: '',
    OPENAI_API_KEY:     '',
    GROQ_API_KEY:       '',
  });

  // ── Default provider state ───────────────────────────────────────
  const [defaultProvider, setDefaultProvider] = useState<Provider>('gemini');

  // ── Test status per provider ─────────────────────────────────────
  const [testStatus, setTestStatus] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [testError, setTestError]   = useState<Record<string, string>>({});

  // ── Save feedback ────────────────────────────────────────────────
  const [isSaving,  setIsSaving]  = useState(false);
  const [saveOk,    setSaveOk]    = useState(false);

  // Load saved settings on mount
  useEffect(() => {
    axios.get('/api/settings').then((res) => {
      setApiKeys((prev) => ({ ...prev, ...res.data }));
      if (res.data.defaultProvider) {
        setDefaultProvider(res.data.defaultProvider as Provider);
      }
    }).catch(console.error);
  }, []);

  // ── Key input handlers ───────────────────────────────────────────
  const handleKeyChange = (keyName: string, value: string) => {
    setApiKeys((prev) => ({ ...prev, [keyName]: value }));
    const provider = KEY_TO_PROVIDER[keyName];
    if (provider) setTestStatus((prev) => ({ ...prev, [provider]: 'idle' }));
  };

  const KEY_TO_PROVIDER: Record<string, string> = {
    GEMINI_API_KEY:     'gemini',
    OPENROUTER_API_KEY: 'openrouter',
    OPENAI_API_KEY:     'openai',
    GROQ_API_KEY:       'groq',
  };

  const PROVIDER_TO_KEY: Record<string, keyof typeof apiKeys> = {
    gemini:     'GEMINI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    openai:     'OPENAI_API_KEY',
    groq:       'GROQ_API_KEY',
  };

  // ── Test a single provider ───────────────────────────────────────
  const handleTestKey = async (provider: string) => {
    const keyName = PROVIDER_TO_KEY[provider];
    const key = apiKeys[keyName];
    if (!key) return;

    setTestStatus((prev) => ({ ...prev, [provider]: 'loading' }));
    try {
      const res = await axios.post('/api/settings/test', { provider, apiKey: key });
      setTestStatus((prev) => ({
        ...prev,
        [provider]: res.data.success ? 'success' : 'error',
      }));
      if (!res.data.success) {
        setTestError((prev) => ({ ...prev, [provider]: res.data.error }));
      }
    } catch (e: any) {
      setTestStatus((prev) => ({ ...prev, [provider]: 'error' }));
      setTestError((prev) => ({
        ...prev,
        [provider]: e.response?.data?.error || 'Error de conexión',
      }));
    }
  };

  // ── Set provider as default ──────────────────────────────────────
  const handleSetDefault = (provider: Provider) => {
    setDefaultProvider(provider);
    // Sync the clip settings provider and model immediately
    onChange({
      ...settings,
      aiProvider: provider,
      aiModel: DEFAULT_MODELS[provider],
    });
  };

  // ── Save all settings ────────────────────────────────────────────
  const handleSaveConfig = async () => {
    setIsSaving(true);
    setSaveOk(false);
    try {
      await axios.post('/api/settings', {
        ...apiKeys,
        defaultProvider,
        defaultModel: DEFAULT_MODELS[defaultProvider],
      });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (error) {
      console.error('Error saving settings', error);
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render one API key row ───────────────────────────────────────
  const renderKeyRow = (provider: Provider, keyName: keyof typeof apiKeys, label: string) => {
    const status   = testStatus[provider] || 'idle';
    const errorMsg = testError[provider]  || '';
    const keyVal   = apiKeys[keyName];
    const isDefault = defaultProvider === provider;

    return (
      <div
        key={provider}
        className={`rounded-xl border p-4 space-y-3 transition-all duration-200 ${
          isDefault
            ? 'border-brand-500/40 bg-brand-500/5'
            : 'border-white/5 bg-surface-800/50'
        }`}
      >
        {/* Provider header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200">{label}</span>
            {isDefault && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-500/20 border border-brand-500/30 text-[10px] font-bold text-brand-300 uppercase tracking-wider">
                <Star size={9} className="fill-brand-400 text-brand-400" />
                Predeterminado
              </span>
            )}
          </div>

          {/* "Set as default" radio-style button */}
          <button
            onClick={() => handleSetDefault(provider)}
            title="Establecer como predeterminado"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
              isDefault
                ? 'bg-brand-500/20 border-brand-500/40 text-brand-300 cursor-default'
                : 'bg-surface-700 border-white/10 text-gray-500 hover:text-gray-200 hover:border-brand-500/30 hover:bg-brand-500/10'
            }`}
          >
            <Star
              size={11}
              className={isDefault ? 'fill-brand-400 text-brand-400' : 'text-gray-600'}
            />
            {isDefault ? 'Activo' : 'Usar por defecto'}
          </button>
        </div>

        {/* Key input + Test button */}
        <div className="flex gap-2">
          <input
            type="password"
            placeholder={keyVal === '********' ? '•••••••• (Clave guardada)' : 'Pega tu API Key aquí...'}
            value={keyVal === '********' ? '' : keyVal}
            onChange={(e) => handleKeyChange(keyName, e.target.value)}
            className="input-base flex-1 text-xs"
          />
          <button
            onClick={() => handleTestKey(provider)}
            disabled={status === 'loading' || !keyVal}
            className="px-3 py-2 bg-surface-700 hover:bg-surface-600 border border-white/10 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center min-w-[68px] gap-1"
          >
            {status === 'loading'
              ? <Loader2 size={13} className="animate-spin text-brand-400" />
              : 'Test'}
          </button>
        </div>

        {/* Test result */}
        {status === 'success' && (
          <div className="flex items-center gap-1.5 text-xs text-green-400 animate-fade-in">
            <CheckCircle size={12} />
            <span>Conexión Exitosa</span>
          </div>
        )}
        {status === 'error' && (
          <div className="flex items-center gap-1.5 text-xs text-red-400 animate-fade-in">
            <XCircle size={12} className="shrink-0" />
            <span className="line-clamp-2">{errorMsg}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-slide-up pb-20">
      <div>
        <h2 className="text-2xl font-bold text-white">
          Configuración <span className="gradient-text">de Clips</span>
        </h2>
        <p className="text-gray-400 text-sm mt-1">
          Gestiona tus claves de API, el proveedor por defecto y los parámetros de extracción.
        </p>
      </div>

      {/* ── API Keys Section ─────────────────────────────────────── */}
      <Section title="Claves de API y Proveedor Preferido" icon={Key}>
        <p className="text-xs text-gray-500 -mt-1">
          Haz clic en <strong className="text-gray-400">«Usar por defecto»</strong> para que la aplicación
          pre-seleccione ese proveedor automáticamente en cada nueva subida.
        </p>

        <div className="space-y-3">
          {renderKeyRow('gemini',     'GEMINI_API_KEY',     '✦ Google Gemini')}
          {renderKeyRow('openrouter', 'OPENROUTER_API_KEY', '🌐 OpenRouter')}
          {renderKeyRow('openai',     'OPENAI_API_KEY',     '⊕ OpenAI')}
          {renderKeyRow('groq',       'GROQ_API_KEY',       '⚡ Groq')}
        </div>

        {/* Save button with feedback */}
        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
          {saveOk ? (
            <div className="flex items-center gap-1.5 text-sm text-green-400 animate-fade-in">
              <CheckCircle size={14} />
              <span>Configuración guardada</span>
            </div>
          ) : (
            <span className="text-xs text-gray-600">
              Proveedor por defecto: <span className="text-brand-400 font-mono">{defaultProvider}</span>
            </span>
          )}
          <button
            onClick={handleSaveConfig}
            disabled={isSaving}
            className="btn-primary flex items-center gap-2"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar Configuración
          </button>
        </div>
      </Section>

      {/* ── AI Provider for current session ─────────────────────── */}
      <Section title="Proveedor de IA (Sesión Actual)" icon={Cpu}>
        <Field label="Motor de análisis" hint="Cambia solo para esta subida">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PROVIDERS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => {
                  onChange({ ...settings, aiProvider: id, aiModel: DEFAULT_MODELS[id] });
                }}
                className={`relative py-2.5 px-2 rounded-lg text-xs font-semibold transition-all border ${
                  settings.aiProvider === id
                    ? 'bg-brand-500/20 border-brand-500/50 text-brand-300'
                    : 'bg-surface-700 border-white/5 text-gray-400 hover:border-white/10 hover:text-gray-200'
                }`}
              >
                {label}
                {defaultProvider === id && (
                  <Star
                    size={8}
                    className="absolute top-1 right-1 fill-brand-400 text-brand-400"
                  />
                )}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Modelo de IA">
          <select
            value={settings.aiModel}
            onChange={e => set('aiModel', e.target.value)}
            className="input-base"
          >
            {settings.aiProvider === 'gemini' && (
              <>
                <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              </>
            )}
            {settings.aiProvider === 'openrouter' && (
              <>
                <option value="google/gemini-2.5-flash">Google Gemini 2.5 Flash</option>
                <option value="anthropic/claude-3-haiku">Anthropic Claude 3 Haiku</option>
                <option value="openai/gpt-4o-mini">OpenAI GPT-4o Mini</option>
              </>
            )}
            {settings.aiProvider === 'openai' && (
              <option value="gpt-4o-mini">GPT-4o Mini</option>
            )}
            {settings.aiProvider === 'groq' && (
              <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile</option>
            )}
          </select>
        </Field>

        <Field label="Idioma del vídeo">
          <select
            value={settings.language}
            onChange={e => set('language', e.target.value)}
            className="input-base"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
            <option value="auto">Auto-detect</option>
          </select>
        </Field>
      </Section>


      {/* ── Summary ───────────────────────────────────────────────── */}
      <div className="card-elevated p-4 font-mono text-xs text-gray-500 space-y-1">
        <p className="text-gray-400 font-semibold mb-2 not-italic font-sans">Resumen de configuración</p>
        <p>→ {settings.maxClips} clips · {settings.minDuration}–{settings.maxDuration}s · {settings.aspectRatio}</p>
        <p>→ IA: {settings.aiProvider} ({settings.aiModel}) · Idioma: {settings.language} · Subs: {settings.subtitleStyle}</p>
        <p>→ Subtítulos: Posición: <span className="text-brand-400 font-bold">{settings.subtitlesPosition}</span> · Preset: <span className="text-brand-400 font-bold">{settings.subtitlesPreset}</span></p>
        <p>→ Predeterminado: <span className="text-brand-400">{defaultProvider}</span></p>
      </div>
    </div>
  );
}
