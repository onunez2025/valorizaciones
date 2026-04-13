import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import { Users, Shield, Terminal, ChevronRight, Settings2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuth } from '../../hooks/useAuth';

export default function ConfigLayout() {
    const { hasPermission } = useAuth();
    const location = useLocation();

    const configItems = [
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
        <div className="flex-1 h-full overflow-hidden flex flex-col p-1 lg:p-2 bg-slate-50">
            <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-1 lg:gap-2 h-full min-h-0 w-full">
                {/* SIATC Premium Sidebar */}
                <aside className="shrink-0 flex flex-col min-h-0 h-fit lg:h-full group">
                    <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col h-full">
                        <div className="p-4 border-b border-border bg-muted/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary text-white rounded-xl shadow-sm">
                                    <Settings2 className="w-4 h-4 stroke-[2.5]" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black text-primary tracking-widest leading-none uppercase">Módulo</span>
                                    <span className="text-sm font-bold text-foreground tracking-tight">Configuración</span>
                                </div>
                            </div>
                        </div>

                        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto custom-scrollbar">
                            <p className="text-[9px] font-bold text-muted-foreground tracking-widest px-3 py-2 uppercase opacity-60">Administración</p>
                            {filteredItems.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    className={({ isActive }) => cn(
                                        "group/item flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-300",
                                        isActive
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                    )}
                                >
                                    <div className="flex items-center gap-2.5 relative z-10">
                                        <item.icon className={cn(
                                            "w-4 h-4 transition-transform duration-500",
                                            "group-hover/item:scale-110"
                                        )} />
                                        <span className="tracking-tight">{item.label}</span>
                                    </div>
                                    <ChevronRight className={cn(
                                        "w-3.5 h-3.5 transition-all duration-300 opacity-0 -translate-x-2 relative z-10",
                                        "group-hover/item:opacity-100 group-hover/item:translate-x-0"
                                    )} />
                                </NavLink>
                            ))}
                        </nav>

                        {/* Sidebar Footer Info */}
                        <div className="p-3 bg-muted/30 border-t border-border">
                            <div className="p-3 bg-background rounded-xl border border-border shadow-sm">
                                <div className="flex items-center gap-2 mb-1 font-bold text-[9px] text-primary tracking-widest uppercase">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    SIATC v2.1
                                </div>
                                <p className="text-[9px] text-muted-foreground font-medium tracking-tight leading-relaxed">
                                    Valorizaciones CAS
                                </p>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 min-w-0 h-full flex flex-col min-h-0">
                    <div className="flex-1 flex flex-col min-h-0">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
