import { useState, useRef, useEffect } from 'react';
import { Grid, ChevronRight, Info } from 'lucide-react';
import { cn } from '../../utils/cn';

// SIATC PREMIUM MASTER — AppSwitcher v2.0 (Platinum)
// Idéntico en todos los proyectos del ecosistema. Solo cambia currentAppId.

const apps = [
    { id: 's-project',       name: 'S-Project',       url: 'https://gac-sole-sproject.jppsfv.easypanel.host/',                logo: '/ecosystem-logos/s-project.png' },
    { id: 'gestor-fsm',      name: 'Gestor FSM',       url: 'https://gac-sole-gestor-de-tickets-fsm.jppsfv.easypanel.host/', logo: '/ecosystem-logos/gestor-fsm.png' },
    { id: 'liquidaciones',   name: 'Liquidaciones',    url: 'https://gac-sole-liquidaciones.jppsfv.easypanel.host/',          logo: '/ecosystem-logos/liquidaciones.png' },
    { id: 'tablero-control', name: 'Tablero Control',  url: 'https://gac-sole-tablero-control.jppsfv.easypanel.host/',       logo: '/ecosystem-logos/tablero-control.png' },
    { id: 'ebm',             name: 'EBM',              url: 'https://gac-sole-ebm.jppsfv.easypanel.host/',                   logo: '/ecosystem-logos/ebm.png' },
    { id: 'valorizaciones',  name: 'Valorizaciones',   url: 'https://gac-sole-valorizaciones.jppsfv.easypanel.host/',        logo: '/logo.png' },
];

interface AppSwitcherProps {
    currentAppId: string;
}

export function AppSwitcher({ currentAppId }: AppSwitcherProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const otherApps = apps.filter(app => app.id !== currentAppId);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    'w-11 h-11 flex items-center justify-center rounded-full transition-all duration-300 active:scale-95',
                    isOpen
                        ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-110'
                        : 'text-slate-400 hover:text-primary hover:bg-primary/10'
                )}
                title="Ecosistema de Aplicaciones SIATC"
                type="button"
            >
                <Grid className={cn('w-5 h-5 transition-transform duration-500', isOpen && 'rotate-90')} />
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-6 w-[480px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-white dark:border-white/10 rounded-[2.5rem] shadow-[0_32px_128px_rgba(0,0,0,0.18)] dark:shadow-none z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-300 origin-top-right">
                    {/* Switcher Header */}
                    <div className="px-10 pt-8 pb-4 flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-sm font-black text-foreground tracking-[0.2em] uppercase">Ecosistema SIATC</h3>
                            <span className="text-[10px] font-black text-primary tracking-[0.3em] uppercase opacity-60">Nube Corporativa</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 rounded-full border border-primary/20">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50" />
                            <span className="text-[9px] font-black text-primary uppercase tracking-widest">Global Sync</span>
                        </div>
                    </div>

                    {/* Apps Grid */}
                    <div className="p-8 grid grid-cols-2 gap-4">
                        {otherApps.map(app => (
                            <a
                                key={app.id}
                                href={app.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group relative flex items-center gap-4 p-5 rounded-[1.5rem] bg-slate-50 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 transition-all duration-500 border border-transparent hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5 active:scale-95"
                            >
                                <div className="w-12 h-12 bg-white dark:bg-slate-950 rounded-2xl flex items-center justify-center p-2 shadow-lg shadow-slate-200/50 dark:shadow-none group-hover:scale-110 group-hover:-rotate-3 transition-all duration-500 border border-slate-100/50 dark:border-white/5 shrink-0">
                                    <img src={app.logo} alt={app.name} className="w-full h-full object-contain" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[11px] font-black text-foreground group-hover:text-primary transition-colors tracking-tight uppercase truncate">
                                        {app.name}
                                    </span>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0">
                                        <span className="text-[9px] font-black text-primary/60 uppercase tracking-widest">Lanzar</span>
                                        <ChevronRight className="w-2.5 h-2.5 text-primary" />
                                    </div>
                                </div>
                            </a>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="px-10 py-5 bg-muted/30 border-t border-border/50 flex items-center gap-3">
                        <Info className="w-4 h-4 text-muted-foreground opacity-30 shrink-0" />
                        <p className="text-[10px] font-black text-muted-foreground tracking-[0.15em] uppercase opacity-60">Plataforma Unificada SIATC v3.5</p>
                    </div>
                </div>
            )}
        </div>
    );
}
