import { NavLink, Outlet, useLocation, Navigate } from 'react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Settings2, MapPin, Briefcase } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuth } from '../../hooks/useAuth';
import { SIATC_THEME } from '../../utils/siatc-theme';

export default function ConfigLayout() {
    const { t } = useTranslation();
    const { hasPermission } = useAuth();
    const location = useLocation();

    const configItems = [
        { to: '/config/settings', icon: Settings2, label: t('config.nav.settings'), permission: 'val.config.users' as const },
        { to: '/config/institucional', icon: Briefcase, label: t('config.nav.institutional'), permission: 'val.config.users' as const },
        { to: '/config/distritos', icon: MapPin, label: t('config.nav.districts'), permission: 'val.config.users' as const },
    ];

    const filteredItems = configItems.filter(item =>
        !item.permission || hasPermission(item.permission)
    );

    const isAtRoot = location.pathname === '/config' || location.pathname === '/config/';
    const firstLocalItem = isAtRoot ? filteredItems.find(item => !('isExternal' in item && item.isExternal)) : null;
    const externalFallback = isAtRoot && !firstLocalItem && filteredItems.length > 0 ? filteredItems[0].to : null;

    useEffect(() => {
        if (externalFallback) {
            window.location.href = externalFallback;
        }
    }, [externalFallback]);

    // If we are at the root /config, redirect to the first authorized item
    if (isAtRoot) {
        if (firstLocalItem) {
            return <Navigate to={firstLocalItem.to} replace />;
        } else if (externalFallback) {
            return null;
        }
    }

    return (
        <div className={SIATC_THEME.LAYOUT.PAGE_WRAPPER}>
            <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4 h-full min-h-0 w-full">
                {/* Móvil/tablet: barra de tabs horizontal (el sidebar vertical completo
                    apilaba todo su chrome arriba del contenido real antes de llegar
                    al Outlet) */}
                <nav className="lg:hidden flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
                    {filteredItems.map((item) => {
                        if ('isExternal' in item && item.isExternal) {
                            return (
                                <a
                                    key={item.to}
                                    href={item.to}
                                    className={cn(SIATC_THEME.MOBILE.TOUCH_TARGET, "flex items-center gap-2 px-4 shrink-0 rounded-full border border-cb-border bg-card text-cb-text-secondary text-sm font-bold whitespace-nowrap transition-colors hover:bg-muted")}
                                >
                                    <item.icon className="w-4 h-4 shrink-0" />
                                    {item.label}
                                </a>
                            );
                        }
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) => cn(
                                    SIATC_THEME.MOBILE.TOUCH_TARGET,
                                    "flex items-center gap-2 px-4 shrink-0 rounded-full border text-sm font-bold whitespace-nowrap transition-colors",
                                    isActive
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "bg-card text-cb-text-secondary border-cb-border hover:bg-muted"
                                )}
                            >
                                <item.icon className="w-4 h-4 shrink-0" />
                                {item.label}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* SIATC Premium Sidebar — solo en lg: (escritorio) */}
                <aside className="hidden lg:flex shrink-0 flex-col min-h-0 h-fit lg:h-full group">
                    <div className={cn(SIATC_THEME.LAYOUT.SIDEBAR_CONTAINER, "w-full lg:w-72 h-full bg-card border-cb-border")}>
                        <div className="p-6 border-b border-cb-border bg-gradient-to-br from-primary/5 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary text-white rounded-cb-btn shadow-lg shadow-primary/20 ring-4 ring-primary/5">
                                    <Settings2 className="w-5 h-5 stroke-[2.5]" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-primary tracking-wider leading-none uppercase">{t('config.moduleOf')}</span>
                                    <span className="text-lg font-bold text-cb-text-primary tracking-tight">{t('config.title')}</span>
                                </div>
                            </div>
                        </div>

                        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
                            <p className="text-[11px] font-bold text-cb-neutral tracking-wider px-4 py-3 opacity-60 uppercase">{t('config.adminControl')}</p>
                            {filteredItems.map((item) => {
                                if ('isExternal' in item && item.isExternal) {
                                    return (
                                        <a
                                            key={item.to}
                                            href={item.to}
                                            className={SIATC_THEME.LAYOUT.SIDEBAR_ITEM_INACTIVE}
                                        >
                                            <div className="flex items-center gap-3 relative z-10">
                                                <item.icon className="w-5 h-5 transition-transform duration-500 group-hover/item:scale-110 shrink-0" />
                                                <span className="tracking-tight">{item.label}</span>
                                            </div>
                                            <ChevronRight className="w-4 h-4 transition-all duration-300 opacity-0 -translate-x-2 relative z-10 group-hover/item:opacity-100 group-hover/item:translate-x-0" />
                                        </a>
                                    );
                                }
                                return (
                                    <NavLink
                                        key={item.to}
                                        to={item.to}
                                        className={({ isActive }) => cn(
                                            isActive
                                                ? SIATC_THEME.LAYOUT.SIDEBAR_ITEM_ACTIVE
                                                : SIATC_THEME.LAYOUT.SIDEBAR_ITEM_INACTIVE
                                        )}
                                    >
                                        <div className="flex items-center gap-3 relative z-10">
                                            <item.icon className="w-5 h-5 transition-transform duration-500 group-hover/item:scale-110 shrink-0" />
                                            <span className="tracking-tight">{item.label}</span>
                                        </div>
                                        <ChevronRight className="w-4 h-4 transition-all duration-300 opacity-0 -translate-x-2 relative z-10 group-hover/item:opacity-100 group-hover/item:translate-x-0" />
                                    </NavLink>
                                );
                            })}
                        </nav>

                        {/* Sidebar Footer Info — oculto en móvil/tablet: es chrome decorativo,
                            no aporta a la tarea y empuja el contenido real hacia abajo cuando
                            el sidebar completo se apila arriba del Outlet (grid-cols-1 < lg:) */}
                        <div className="hidden lg:block p-4 bg-cb-bg/30 border-t border-cb-border">
                            <div className="p-4 bg-cb-bg/50 rounded-cb-card border border-cb-border shadow-cb-level-1">
                                <div className="flex items-center gap-2 mb-1.5 font-bold text-[11px] text-cb-text-primary tracking-wider uppercase">
                                    <div className="w-1.5 h-1.5 rounded-full bg-cb-success animate-pulse" />
                                    {t('config.siatcSystem')}
                                </div>
                                <p className="text-[11px] text-cb-text-secondary font-bold leading-relaxed">
                                    {t('config.siatcDescription')}
                                </p>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 min-w-0 h-full flex flex-col min-h-0 bg-transparent">
                    <div className="flex-1 flex flex-col min-h-0">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
