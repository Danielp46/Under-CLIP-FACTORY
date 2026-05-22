'use client';

import { Upload, List, Settings, Scissors, ChevronRight, Captions } from 'lucide-react';
import clsx from 'clsx';

type Tab = 'upload' | 'editor' | 'queue' | 'settings';

interface SidebarProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  jobCount: number;
}

const navItems = [
  { id: 'upload' as Tab, label: 'Generar Short', icon: Upload, desc: 'Importa tu video' },
  { id: 'editor' as Tab, label: 'Editor de video', icon: Captions, desc: 'Extrae subtitulos SRT' },
  { id: 'queue' as Tab, label: 'Cola de Clips', icon: List, desc: 'Trabajos activos' },
  { id: 'settings' as Tab, label: 'Configuracion', icon: Settings, desc: 'IA y ajustes' },
];

export default function Sidebar({ activeTab, onTabChange, jobCount }: SidebarProps) {
  return (
    <aside className="w-56 h-full flex flex-col glass-strong border-r border-white/5 shrink-0">
      <div className="px-4 py-5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Scissors size={18} className="text-brand-400" />
          <span className="text-xs font-bold text-gray-300 tracking-widest uppercase">Navigation</span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ id, label, icon: Icon, desc }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200 group',
                isActive
                  ? 'bg-brand-600/20 border border-brand-500/30 text-white'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5 border border-transparent'
              )}
            >
              <div className={clsx(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                isActive ? 'bg-brand-500/30 text-brand-400' : 'bg-white/5 text-gray-500 group-hover:bg-white/10 group-hover:text-gray-300'
              )}>
                <Icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{label}</p>
                  {id === 'queue' && jobCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-brand-500/30 text-brand-300">
                      {jobCount}
                    </span>
                  )}
                </div>
                <p className={clsx('text-[11px] truncate mt-0.5', isActive ? 'text-brand-400/70' : 'text-gray-600')}>
                  {desc}
                </p>
              </div>
              {isActive && <ChevronRight size={12} className="text-brand-400 shrink-0" />}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        <div className="text-[10px] text-gray-600 space-y-1 font-mono">
          <p className="flex justify-between">
            <span>FFmpeg</span>
            <span className="text-accent-green">v8.0</span>
          </p>
          <p className="flex justify-between">
            <span>Python</span>
            <span className="text-accent-green">v3.11</span>
          </p>
          <p className="flex justify-between">
            <span>Node.js</span>
            <span className="text-accent-green">v22</span>
          </p>
        </div>
      </div>
    </aside>
  );
}
