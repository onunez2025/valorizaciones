import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, ExternalLink, ChevronRight, Sparkles } from 'lucide-react';
import { cn } from '../../utils/cn';

// PLATINUM MASTER APPSWITCHER v2.0
// Este componente es IDENTICO en todas las apps del ecosistema.

interface AppSystem {
  id: string;
  name: string;
  description: string;
  url: string;
  color: string;
  active?: boolean;
}

const APPS: AppSystem[] = [
  {
    id: 'valorizaciones',
    name: 'Valorizaciones',
    description: 'Gestión de servicios y penalidades',
    url: 'http://localhost:5173',
    color: 'from-blue-500 to-indigo-600',
    active: true
  },
  {
    id: 'ebm',
    name: 'EBM',
    description: 'Presupuesto y tracking financiero',
    url: 'http://localhost:5174',
    color: 'from-emerald-500 to-teal-600'
  },
  {
    id: 'liquidaciones',
    name: 'Liquidaciones',
    description: 'Cierre y pago de servicios',
    url: 'http://localhost:5176',
    color: 'from-amber-500 to-orange-600'
  },
  {
    id: 'fsm',
    name: 'Gestor FSM',
    description: 'Gestión de tickets y campo',
    url: 'http://localhost:5175',
    color: 'from-purple-500 to-violet-600'
  },
  {
    id: 'tablero',
    name: 'Tablero Control',
    description: 'KPIs y analítica avanzada',
    url: 'http://localhost:5177',
    color: 'from-rose-500 to-pink-600'
  }
];

export const AppSwitcher: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative group flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300",
          isOpen 
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-95" 
            : "bg-white/10 hover:bg-white/20 text-white/70 hover:text-white"
        )}
      >
        <LayoutGrid className={cn("w-6 h-6 transition-transform duration-500", isOpen && "rotate-180")} />
        
        {/* Glow effect on hover */}
        <div className="absolute inset-0 rounded-2xl bg-white/20 opacity-0 group-hover:opacity-100 blur-md transition-opacity" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-4 w-[320px] bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl border border-slate-200 dark:border-slate-800 p-4 animate-in fade-in slide-in-from-top-4 duration-300 z-[100] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-3 py-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Ecosistema SIATC</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Switcher Platinum Master</p>
            </div>
          </div>

          <div className="space-y-2">
            {APPS.map((app) => (
              <a
                key={app.id}
                href={app.url}
                className={cn(
                  "group relative flex items-center gap-4 p-3 rounded-2xl transition-all duration-300",
                  app.active 
                    ? "bg-primary/5 border border-primary/20 ring-1 ring-primary/10" 
                    : "hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
                )}
              >
                {/* Icon/Color Indicator */}
                <div className={cn(
                  "flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white font-black shadow-lg shadow-current/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3",
                  app.color
                )}>
                  {app.name.charAt(0)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "text-sm font-black transition-colors",
                      app.active ? "text-primary" : "text-slate-700 dark:text-slate-300 group-hover:text-primary"
                    )}>
                      {app.name}
                    </span>
                    <ChevronRight className={cn(
                      "w-4 h-4 transition-all duration-300",
                      app.active ? "text-primary opacity-100" : "text-slate-300 opacity-0 group-hover:opacity-100 group-hover:translate-x-1"
                    )} />
                  </div>
                  <p className="text-[10px] font-medium text-slate-400 group-hover:text-slate-500 truncate mt-0.5 uppercase tracking-tight">
                    {app.description}
                  </p>
                </div>

                {/* Active Indicator */}
                {app.active && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </a>
            ))}
          </div>

          {/* Footer stats */}
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center px-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">v2.0 Platinum</span>
            <div className="flex gap-1">
              {[1,2,3].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/20" />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
