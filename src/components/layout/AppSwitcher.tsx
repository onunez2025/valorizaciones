import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Grid, Info, X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { SIATC_THEME } from '../../utils/siatc-theme';
import { useAuth } from '../../hooks/useAuth';
import { ApiClient } from '../../services/apiClient';
import { useMediaQuery } from '../../hooks/useMediaQuery';

interface Application {
    id: string;
    code: string;
    label: string;
    url: string;
    logo_url?: string;
    is_active?: boolean;
    display_order?: number;
}

interface AppSwitcherProps {
    currentAppId: string;
}

export function AppSwitcher({ currentAppId }: AppSwitcherProps) {
    const isMobile = useMediaQuery('(max-width: 767px)');
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [apps, setApps] = useState<Application[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Fetch active applications on open
    useEffect(() => {
        const fetchApps = async () => {
            try {
                const data = await ApiClient.request('/applications?activeOnly=true') as Application[];
                setApps(data);
            } catch (err) {
                console.error("Failed to load ecosystem apps", err);
            }
        };
        if (isOpen && apps.length === 0) {
            fetchApps();
        }
    }, [isOpen, apps.length]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (isMobile) return;
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMobile]);

    // Filter apps:
    // 1. Omit the current app (e.g. CONSOLE or FLOW)
    // 2. Filter by user allowed apps list (smart switcher)
    const allowedAppsCodes = (user?.apps || '').split(',').map((a: string) => a.trim().toUpperCase()).filter(Boolean);
    
    const filteredApps = apps.filter(app => {
        const appCode = app.code.toUpperCase();
        // Omit current
        if (appCode === currentAppId.toUpperCase()) return false;
        
        // Super admin sees all active apps, other users only see allowed ones
        const roleName = user?.role_name?.toLowerCase();
        const isSuperAdmin = roleName === 'administrador' || roleName === 'console.administrador';
        if (isSuperAdmin) return true;
        
        return allowedAppsCodes.includes(appCode);
    });

    const theme = SIATC_THEME.APP_SWITCHER;

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    theme.TRIGGER,
                    isOpen && theme.TRIGGER_ACTIVE,
                    "cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                )}
                title="Ecosistema de Aplicaciones SIATC"
                type="button"
            >
                <Grid className={cn('w-5 h-5 transition-transform duration-500', isOpen && 'rotate-90')} />
            </button>

            {isOpen && (
                isMobile ? (
                    createPortal(
                        <div className={cn(
                            "fixed inset-0 w-screen h-screen rounded-none border-none bg-card z-[100] flex flex-col p-0 overflow-y-auto"
                        )}>
                            {/* Switcher Header */}
                            <div className={cn(theme.HEADER, "px-6 pt-6 pb-4")}>
                                <div className="flex flex-col gap-1">
                                    <h3 className={theme.HEADER_TITLE}>Ecosistema SIATC</h3>
                                    <span className={theme.HEADER_SUBTITLE}>Nube Corporativa</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className={theme.SYNC_BADGE}>
                                        <div className={theme.SYNC_DOT} />
                                        <span className={theme.SYNC_TEXT}>Global Sync</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsOpen(false)}
                                        className="p-2 rounded-xl hover:bg-rose-500/10 hover:text-rose-500 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Apps Grid */}
                            {filteredApps.length > 0 ? (
                                <div className={cn(theme.GRID, "grid grid-cols-2 p-4 gap-4 flex-1")}>
                                    {filteredApps.map(app => (
                                        <a
                                            key={app.id}
                                            href={app.url}
                                            className={cn(theme.ITEM_CARD, "min-h-[110px] justify-center")}
                                        >
                                            <div className={theme.ITEM_LOGO_WRAPPER}>
                                                <img 
                                                    src={app.logo_url || '/Logo.png'} 
                                                    alt={app.label} 
                                                    className="w-full h-full object-contain" 
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).src = '/Logo.png';
                                                    }}
                                                />
                                            </div>
                                            <span className={theme.ITEM_NAME}>
                                                {app.label}
                                            </span>
                                        </a>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-10 text-center text-xs text-cb-text-secondary font-bold tracking-tight flex-1 flex items-center justify-center">
                                    No tienes acceso a otras aplicaciones del ecosistema.
                                </div>
                            )}

                            {/* Footer */}
                            <div className={cn(theme.FOOTER, "px-6 py-4 mt-auto")}>
                                <Info className="w-4 h-4 text-muted-foreground opacity-30 shrink-0" />
                                <p className={theme.FOOTER_TEXT}>Plataforma Unificada SIATC v3.5</p>
                            </div>
                        </div>,
                        document.body
                    )
                ) : (
                    <div className={cn(
                        theme.CONTAINER,
                        "absolute right-0 mt-6 w-[540px] h-auto rounded-[2.5rem] border border-cb-border bg-card/95 overflow-hidden"
                    )}>
                        {/* Switcher Header */}
                        <div className={cn(theme.HEADER, "px-10 pt-8 pb-4")}>
                            <div className="flex flex-col gap-1">
                                <h3 className={theme.HEADER_TITLE}>Ecosistema SIATC</h3>
                                <span className={theme.HEADER_SUBTITLE}>Nube Corporativa</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className={theme.SYNC_BADGE}>
                                    <div className={theme.SYNC_DOT} />
                                    <span className={theme.SYNC_TEXT}>Global Sync</span>
                                </div>
                            </div>
                        </div>

                        {/* Apps Grid */}
                        {filteredApps.length > 0 ? (
                            <div className={cn(theme.GRID, "grid grid-cols-4 p-6 gap-4")}>
                                {filteredApps.map(app => (
                                    <a
                                        key={app.id}
                                        href={app.url}
                                        className={cn(theme.ITEM_CARD, "min-h-[110px] justify-center")}
                                    >
                                        <div className={theme.ITEM_LOGO_WRAPPER}>
                                            <img 
                                                src={app.logo_url || '/Logo.png'} 
                                                alt={app.label} 
                                                className="w-full h-full object-contain" 
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).src = '/Logo.png';
                                                }}
                                            />
                                        </div>
                                        <span className={theme.ITEM_NAME}>
                                            {app.label}
                                        </span>
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <div className="p-10 text-center text-xs text-cb-text-secondary font-bold tracking-tight">
                                No tienes acceso a otras aplicaciones del ecosistema.
                            </div>
                        )}

                        {/* Footer */}
                        <div className={cn(theme.FOOTER, "px-10 py-5")}>
                            <Info className="w-4 h-4 text-muted-foreground opacity-30 shrink-0" />
                            <p className={theme.FOOTER_TEXT}>Plataforma Unificada SIATC v3.5</p>
                        </div>
                    </div>
                )
            )}
        </div>
    );
}
