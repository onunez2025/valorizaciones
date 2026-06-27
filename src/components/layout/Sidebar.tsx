import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Briefcase,
    CalendarDays,
    Box,
    LogOut,
    ChevronRight
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuth } from '../../hooks/useAuth';
import { useAppConfig } from '../../context/AppConfigContext';
import { SIATC_THEME } from '../../utils/siatc-theme';
import { toTitleCase } from '../../utils/formatters';

export function Sidebar({ className, isEffectivelyExpanded = true }: { className?: string; isEffectivelyExpanded?: boolean }) {
    const { logout, hasPermission } = useAuth();
    const appConfig = useAppConfig();
    const logoUrl = appConfig?.logoUrl || '/logo.png';
    const showFull = isEffectivelyExpanded;

    const navItems = [
        {
            to: '/dashboard',
            icon: LayoutDashboard,
            label: 'Dashboard',
            permission: 'val.dashboard.view' as const
        },
        {
            to: '/valuations',
            icon: Briefcase,
            label: 'Valorizaciones',
            permission: 'val.valuations.view' as const
        },
        {
            to: '/tarifario',
            icon: CalendarDays,
            label: 'Tarifario',
            permission: 'val.tarifario.view' as const
        },
        {
            to: '/materiales',
            icon: Box,
            label: 'Materiales',
            permission: 'val.tarifario.view' as const
        },
    ];

    const filteredNavItems = navItems.filter(item =>
        !item.permission || hasPermission(item.permission)
    );

    return (
        <div className={cn(
            SIATC_THEME.LAYOUT.SIDEBAR_INNER,
            className
        )}>
            {/* Header / Logo */}
            {showFull ? (
                <div className="p-6 flex items-center gap-3 border-b border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
                    <div className="w-12 h-12 flex items-center justify-center shrink-0 overflow-hidden transition-transform hover:scale-105">
                        <img src={logoUrl} alt="Valorizaciones Logo" className="h-full w-full object-contain" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <h1 className="font-bold text-lg leading-none tracking-tight text-foreground uppercase truncate">Valorizaciones</h1>
                        <p className="text-[9px] font-black text-primary tracking-wider uppercase mt-1.5 opacity-70 truncate">Control Gestión</p>
                    </div>
                </div>
            ) : (
                <div className="px-1 py-4 flex flex-col items-center gap-2 border-b border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
                    <div className="w-9 h-9 flex items-center justify-center shrink-0 overflow-hidden">
                        <img src={logoUrl} alt="Valorizaciones Logo" className="h-full w-full object-contain" />
                    </div>
                </div>
            )}

            {/* Navigation */}
            {showFull ? (
                <nav className="flex-1 px-3 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
                    <p className="text-[10px] font-black text-muted-foreground tracking-[0.2em] px-4 py-2 uppercase opacity-40">Menú Principal</p>
                    {filteredNavItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            className={({ isActive }) => isActive
                                ? SIATC_THEME.LAYOUT.SIDEBAR_ITEM_ACTIVE
                                : SIATC_THEME.LAYOUT.SIDEBAR_ITEM_INACTIVE
                            }
                        >
                            <div className="flex items-center gap-3 relative z-10">
                                <item.icon className={cn(
                                    "w-5 h-5 transition-transform duration-500",
                                    "group-hover/item:scale-110"
                                )} />
                                <span className="tracking-tight">{toTitleCase(item.label)}</span>
                            </div>
                            <ChevronRight className={cn(
                                "w-4 h-4 transition-all duration-300 opacity-0 -translate-x-2 relative z-10",
                                "group-hover/item:opacity-100 group-hover/item:translate-x-0"
                            )} />
                        </NavLink>
                    ))}
                </nav>
            ) : (
                <nav className="flex-1 px-1 py-4 space-y-2 overflow-y-auto custom-scrollbar flex flex-col items-center">
                    {filteredNavItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            title={item.label}
                            className={({ isActive }) => cn(
                                "w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-md"
                                    : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                            )}
                        >
                            <item.icon className="w-5 h-5 shrink-0" />
                        </NavLink>
                    ))}
                </nav>
            )}

            {/* Footer */}
            <div className={cn(
                "border-t border-border/50 bg-muted/20",
                showFull ? 'p-4' : 'p-2 flex flex-col items-center'
            )}>
                {showFull ? (
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 text-xs font-black text-rose-500 hover:bg-rose-500 hover:text-white rounded-2xl transition-all shadow-rose-500/10 hover:shadow-lg uppercase tracking-[0.2em]"
                    >
                        <LogOut className="w-4 h-4" />
                        Cerrar Sesión
                    </button>
                ) : (
                    <button
                        onClick={logout}
                        title="Cerrar Sesión"
                        className="w-9 h-9 flex items-center justify-center rounded-xl text-rose-500 hover:bg-rose-500 hover:text-white transition-all"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
