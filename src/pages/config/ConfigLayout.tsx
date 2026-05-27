import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import { Users, Shield, Terminal, ChevronRight, Settings2, MapPin, Briefcase } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuth } from '../../hooks/useAuth';
import { SIATC_THEME } from '../../utils/siatc-theme';

export default function ConfigLayout() {
    const { hasPermission } = useAuth();
    const location = useLocation();

    const configItems = [
        { to: '/config/settings', icon: Settings2, label: 'Ajustes Generales', permission: 'val.config.users' as const },
        { to: '/config/institucional', icon: Briefcase, label: 'Canal Institucional', permission: 'val.config.users' as const },
        { to: '/config/distritos', icon: MapPin, label: 'Adicionales por Distrito', permission: 'val.config.users' as const },
        { to: '/config/users', icon: Users, label: 'Gestión de Usuarios', permission: 'val.config.users' as const },
        { to: '/config/roles', icon: Shield, label: 'Perfiles y Permisos', permission: 'val.config.roles' as const },
        { to: '/config/audit', icon: Terminal, label: 'Logs de Auditoría', permission: 'val.config.audit' as const },
    ];

    const filteredItems = configItems.filter(item =>
        !item.permission || hasPermission(item.permission)
    );

    // If we are at the root /config, redirect to the first authorized item
    if (location.pathname === '/config' || location.pathname === '/config/') {
        if (filteredItems.length > 0) {
            return <Navigate to={filteredItems[0].to} replace />;
        }
    }

    return (
        <div className={SIATC_THEME.LAYOUT.PAGE_WRAPPER}>
            <div className="grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-4 h-full min-h-0 w-full">
                {/* SIATC Premium Sidebar */}
                <aside className="shrink-0 flex flex-col min-h-0 h-fit lg:h-full group">
                    <div className={cn(SIATC_THEME.LAYOUT.SIDEBAR_CONTAINER, "w-full lg:w-72 h-full bg-card border-cb-border")}>
                        <div className="p-6 border-b border-cb-border bg-gradient-to-br from-primary/5 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary text-white rounded-cb-btn shadow-lg shadow-primary/20 ring-4 ring-primary/5">
                                    <Settings2 className="w-5 h-5 stroke-[2.5]" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[11px] font-bold text-primary tracking-wider leading-none uppercase">Módulo de</span>
                                    <span className="text-lg font-bold text-cb-text-primary tracking-tight">Configuración</span>
                                </div>
                            </div>
                        </div>

                        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
                            <p className="text-[11px] font-bold text-cb-neutral tracking-wider px-4 py-3 opacity-60 uppercase">Control Administrativo</p>
                            {filteredItems.map((item) => (
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
                                        <item.icon className={cn(
                                            "w-5 h-5 transition-transform duration-500",
                                            "group-hover/item:scale-110"
                                        )} />
                                        <span className="tracking-tight">{item.label}</span>
                                    </div>
                                    <ChevronRight className={cn(
                                        "w-4 h-4 transition-all duration-300 opacity-0 -translate-x-2 relative z-10",
                                        "group-hover/item:opacity-100 group-hover/item:translate-x-0"
                                    )} />
                                </NavLink>
                            ))}
                        </nav>

                        {/* Sidebar Footer Info */}
                        <div className="p-4 bg-cb-bg/30 border-t border-cb-border">
                            <div className="p-4 bg-cb-bg/50 rounded-cb-card border border-cb-border shadow-cb-level-1">
                                <div className="flex items-center gap-2 mb-1.5 font-bold text-[11px] text-cb-text-primary tracking-wider uppercase">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#05B169] animate-pulse" />
                                    Sistema SIATC
                                </div>
                                <p className="text-[11px] text-cb-text-secondary font-bold leading-relaxed">
                                    Valorizaciones CAS
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
