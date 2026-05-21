'use client';

import { Clock, CheckCircle2, XCircle, Loader2, Film, ChevronDown, ChevronUp, Download, Play } from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import type { Job } from '@/app/page';

interface JobQueueProps {
  jobs: Job[];
  onJobUpdate: (id: string, updates: Partial<Job>) => void;
}

const STATUS_CONFIG = {
  pending:      { label: 'Pendiente',     color: 'badge-pending',    icon: Clock },
  transcribing: { label: 'Transcribiendo',color: 'badge-processing', icon: Loader2 },
  analyzing:    { label: 'Analizando IA', color: 'badge-processing', icon: Loader2 },
  clipping:     { label: 'Cortando',      color: 'badge-processing', icon: Loader2 },
  done:         { label: 'Completado',    color: 'badge-done',       icon: CheckCircle2 },
  completed:    { label: 'Completado',    color: 'badge-done',       icon: CheckCircle2 },
  success:      { label: 'Completado',    color: 'badge-done',       icon: CheckCircle2 },
  error:        { label: 'Error',         color: 'badge-error',      icon: XCircle },
};

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function JobCard({ job }: { job: Job }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[job.status];
  const Icon = cfg.icon;
  const isProcessing = ['transcribing', 'analyzing', 'clipping'].includes(job.status);

  return (
    <div className={clsx('card overflow-hidden transition-all', job.status === 'error' && 'border-red-500/20')}>
      {/* Card Header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* File icon */}
          <div className="w-10 h-10 rounded-lg bg-surface-700 flex items-center justify-center shrink-0 mt-0.5">
            <Film size={18} className="text-brand-400" />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-gray-100 truncate max-w-xs">{job.fileName}</p>
              <span className={clsx('badge', cfg.color)}>
                <Icon size={10} className={isProcessing ? 'animate-spin' : ''} />
                {cfg.label}
              </span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5 font-mono">
              {formatTime(job.createdAt)} · ID: {job.id.slice(0, 8)}…
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {job.clips.length > 0 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-400 bg-brand-500/10 hover:bg-brand-500/20 transition-colors"
              >
                {job.clips.length} clips
                {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {isProcessing && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>{cfg.label}…</span>
              <span className="font-mono">{job.progress}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${job.progress}%` }} />
            </div>
          </div>
        )}

        {/* Error message */}
        {job.status === 'error' && job.error && (
          <p className="mt-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{job.error}</p>
        )}
      </div>

      {/* Expanded clips */}
      {expanded && job.clips.length > 0 && (
        <div className="border-t border-white/5 p-4 space-y-2 bg-surface-800/50">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Clips generados</p>
          {job.clips.map((clip, i) => (
            <div key={clip.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-700 border border-white/5">
              <div className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-200 font-medium truncate">{clip.title}</p>
                <p className="text-xs text-gray-500 font-mono">
                  {Math.floor(clip.startTime / 60)}:{String(Math.floor(clip.startTime % 60)).padStart(2, '0')}
                  {' → '}
                  {Math.floor(clip.endTime / 60)}:{String(Math.floor(clip.endTime % 60)).padStart(2, '0')}
                  {' · Score: '}
                  <span className="text-accent-cyan">{clip.score.toFixed(2)}</span>
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {clip.outputPath && (
                  <>
                    <button className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title="Preview">
                      <Play size={12} />
                    </button>
                    <a
                      href={`/api/clips/${clip.id}/download`}
                      className="p-1.5 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 transition-colors"
                      title="Descargar"
                    >
                      <Download size={12} />
                    </a>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function JobQueue({ jobs, onJobUpdate }: JobQueueProps) {
  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-surface-700 flex items-center justify-center mb-4">
          <Film size={24} className="text-gray-600" />
        </div>
        <p className="text-gray-400 font-medium">Sin trabajos activos</p>
        <p className="text-gray-600 text-sm mt-1">Sube un vídeo para empezar</p>
      </div>
    );
  }

  const done = jobs.filter(j => ['completed', 'success', 'done'].includes(j.status)).length;
  const processing = jobs.filter(j => ['transcribing', 'analyzing', 'clipping', 'pending'].includes(j.status)).length;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Stats header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Cola de Trabajos</h2>
          <p className="text-gray-500 text-sm mt-0.5">{jobs.length} total · {processing} activos · {done} completados</p>
        </div>
        <div className="flex gap-2">
          {processing > 0 && (
            <span className="badge badge-processing">
              <Loader2 size={10} className="animate-spin" />
              {processing} procesando
            </span>
          )}
          {done > 0 && (
            <span className="badge badge-done">
              <CheckCircle2 size={10} />
              {done} listos
            </span>
          )}
        </div>
      </div>

      {/* Job list */}
      <div className="space-y-3">
        {jobs.map(job => <JobCard key={job.id} job={job} />)}
      </div>
    </div>
  );
}
