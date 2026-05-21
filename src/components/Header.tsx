'use client';

import { Zap, Github, Bell } from 'lucide-react';

export default function Header() {
  return (
    <header className="glass-strong border-b border-white/5 px-6 py-3 flex items-center justify-between shrink-0">
      {/* Logo + Title */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent-green border-2 border-surface-900" />
        </div>
        <div>
          <h1 className="text-sm font-bold gradient-text leading-none">UNDER CLIP FACTORY</h1>
          <p className="text-[10px] text-gray-500 mt-0.5">AI-Powered Clip Engine</p>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Status pill */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-700 border border-white/5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
          <span className="text-xs text-gray-400 font-mono">FFmpeg OK</span>
        </div>

        {/* Version */}
        <span className="text-xs text-gray-600 font-mono hidden sm:block">v0.1.0</span>

        {/* GitHub icon */}
        <button
          className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-surface-700 transition-colors"
          title="GitHub"
        >
          <Github size={16} />
        </button>
      </div>
    </header>
  );
}
