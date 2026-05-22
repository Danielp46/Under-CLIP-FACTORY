'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import VideoUploader from '@/components/VideoUploader';
import VideoEditor from '@/components/VideoEditor';
import ClipSettings from '@/components/ClipSettings';
import JobQueue from '@/components/JobQueue';
import Header from '@/components/Header';

export type Job = {
  id: string;
  fileName: string;
  status: 'pending' | 'transcribing' | 'analyzing' | 'clipping' | 'completed' | 'success' | 'done' | 'error';
  progress: number;
  clips: ClipResult[];
  error?: string;
  createdAt: Date;
};

export type ClipResult = {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  score: number;
  outputPath?: string;
  thumbnailUrl?: string;
};

export type ClipSettings = {
  maxClips: number;
  minDuration: number;
  maxDuration: number;
  isFullVideo: boolean;
  speed: number;
  aspectRatio: '9:16' | '1:1' | '4:5';
  subtitleStyle: 'dynamic' | 'static' | 'none';
  subtitleSize: 'Mediana' | 'Grande';
  isUppercase: boolean;
  aiProvider: 'gemini' | 'openai' | 'groq' | 'openrouter';
  aiModel: string;
  language: string;
  subtitlesPosition: 'top' | 'center' | 'bottom';
  subtitlesPreset: 'preset1' | 'preset2' | 'preset3';
};

// Modelo recomendado para cada proveedor (espejo del backend)
const DEFAULT_MODELS: Record<string, string> = {
  gemini:     'gemini-2.0-flash',
  openrouter: 'google/gemini-2.5-flash',
  openai:     'gpt-4o-mini',
  groq:       'llama-3.3-70b-versatile',
};

const FALLBACK_SETTINGS: ClipSettings = {
  maxClips:      5,
  minDuration:   30,
  maxDuration:   90,
  isFullVideo:   false,
  speed:         1,
  aspectRatio:   '9:16',
  subtitleStyle: 'dynamic',
  subtitleSize:  'Mediana',
  isUppercase:   false,
  aiProvider:    'gemini',
  aiModel:       'gemini-2.0-flash',
  language:      'es',
  subtitlesPosition: 'bottom',
  subtitlesPreset:   'preset1',
};

export default function Home() {
  const [jobs, setJobs]           = useState<Job[]>([]);
  const [settings, setSettings]   = useState<ClipSettings>(FALLBACK_SETTINGS);
  const [activeTab, setActiveTab] = useState<'upload' | 'editor' | 'queue' | 'settings'>('upload');
  const [configLoaded, setConfigLoaded] = useState(false);

  // ── Pre-load default provider from server on first mount ────────
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((data: { defaultProvider?: string; defaultModel?: string }) => {
        if (data.defaultProvider) {
          const provider = data.defaultProvider as ClipSettings['aiProvider'];
          const model    = data.defaultModel || DEFAULT_MODELS[provider] || FALLBACK_SETTINGS.aiModel;
          setSettings(prev => ({ ...prev, aiProvider: provider, aiModel: model }));
        }
      })
      .catch(console.error)
      .finally(() => setConfigLoaded(true));
  }, []);

  // ── Polling for active jobs ──────────────────────────────────
  useEffect(() => {
    const activeJobs = jobs.filter(j => 
      j.status !== 'completed' && j.status !== 'success' && j.status !== 'error'
    );
    
    if (activeJobs.length === 0) return;

    const interval = setInterval(async () => {
      for (const job of activeJobs) {
        try {
          const res = await fetch(`/api/process/status/${job.id}`);
          if (!res.ok) continue;
          const data = await res.json();
          
          let status = data.status;
          if (status === 'done') status = 'completed';

          updateJob(job.id, {
            status: status as Job['status'],
            progress: data.progress ?? job.progress,
            clips: data.clips ?? [],
            error: data.error,
          });
        } catch (err) {
          console.error(`Error polling job ${job.id}:`, err);
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobs]);

  const addJob = (fileName: string, fileId: string) => {
    setJobs(prev => [{
      id: fileId,
      fileName,
      status: 'pending',
      progress: 0,
      clips: [],
      createdAt: new Date(),
    }, ...prev]);
    setActiveTab('queue');
  };

  const updateJob = (id: string, updates: Partial<Job>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface-900">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} jobCount={jobs.length} />

      <main className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'upload' && (
            <div className="max-w-4xl mx-auto animate-fade-in">
              {/* Show a subtle loading state while fetching default provider */}
              {!configLoaded && (
                <div className="flex items-center gap-2 text-xs text-gray-600 mb-4 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
                  Cargando configuración guardada…
                </div>
              )}
              <VideoUploader
                settings={settings}
                onSettingsChange={setSettings}
                onJobCreated={addJob}
                onJobUpdate={updateJob}
              />
            </div>
          )}

          {activeTab === 'editor' && (
            <VideoEditor />
          )}

          {activeTab === 'queue' && (
            <div className="max-w-5xl mx-auto animate-fade-in">
              <JobQueue jobs={jobs} onJobUpdate={updateJob} />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto animate-fade-in">
              <ClipSettings settings={settings} onChange={setSettings} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
