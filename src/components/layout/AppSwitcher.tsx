import { useState, useRef, useEffect } from 'react';
import { Grid, Info } from 'lucide-react';
import { cn } from '../../utils/cn';
import { SIATC_THEME } from '../../utils/siatc-theme';

// SIATC PREMIUM MASTER — AppSwitcher v3.0 (Platinum 4-Cols Grid)
// Idéntico en todos los proyectos del ecosistema. Solo cambia currentAppId.

const apps = [
    { id: 's-project',       name: 'S-Project',       url: 'https://gac-sole-sproject.jppsfv.easypanel.host/',                logo: '/ecosystem-logos/s-project.png' },
    { id: 'mesa-atencion',   name: 'Mesa de Atención', url: 'https://gac-sole-nc-cxg-cancelaciones.jppsfv.easypanel.host/',  logo: '/ecosystem-logos/mesa-atencion.png' },
    { id: 'gestor-fsm',      name: 'Gestor FSM',       url: 'https://gac-sole-gestor-de-tickets-fsm.jppsfv.easypanel.host/', logo: '/ecosystem-logos/gestor-fsm.png' },
    { id: 'liquidaciones',   name: 'Liquidaciones',    url: 'https://gac-sole-liquidaciones.jppsfv.easypanel.host/',          logo: '/ecosystem-logos/liquidaciones.png' },
    { id: 'tablero-control', name: 'Tablero Control',  url: 'https://gac-sole-tablero-control.jppsfv.easypanel.host/',       logo: '/ecosystem-logos/tablero-control.png' },
    { id: 'ebm',             name: 'EBM',              url: 'https://gac-sole-ebm.jppsfv.easypanel.host/',                   logo: '/ecosystem-logos/ebm.png' },
    { id: 'valorizaciones',  name: 'Valorizaciones',   url: 'https://gac-sole-valorizaciones.jppsfv.easypanel.host/',        logo: '/ecosystem-logos/valorizaciones.png' },
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

    const theme = SIATC_THEME.APP_SWITCHER;

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    theme.TRIGGER,
                    isOpen && theme.TRIGGER_ACTIVE
                )}
                title="Ecosistema de Aplicaciones SIATC"
                type="button"
            >
                <Grid className={cn('w-5 h-5 transition-transform duration-500', isOpen && 'rotate-90')} />
            </button>

            {isOpen && (
                <div className={theme.CONTAINER}>
                    {/* Switcher Header */}
                    <div className={theme.HEADER}>
                        <div className="flex flex-col gap-1">
                            <h3 className={theme.HEADER_TITLE}>Ecosistema SIATC</h3>
                            <span className={theme.HEADER_SUBTITLE}>Nube Corporativa</span>
                        </div>
                        <div className={theme.SYNC_BADGE}>
                            <div className={theme.SYNC_DOT} />
                            <span className={theme.SYNC_TEXT}>Global Sync</span>
                        </div>
                    </div>

                    {/* Apps Grid */}
                    <div className={theme.GRID}>
                        {otherApps.map(app => (
                            <a
                                key={app.id}
                                href={app.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={theme.ITEM_CARD}
                            >
                                <div className={theme.ITEM_LOGO_WRAPPER}>
                                    <img src={app.logo} alt={app.name} className="w-full h-full object-contain" />
                                </div>
                                <span className={theme.ITEM_NAME}>
                                    {app.name}
                                </span>
                            </a>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className={theme.FOOTER}>
                        <Info className="w-4 h-4 text-muted-foreground opacity-30 shrink-0" />
                        <p className={theme.FOOTER_TEXT}>Plataforma Unificada SIATC v3.5</p>
                    </div>
                </div>
            )}
        </div>
    );
}
