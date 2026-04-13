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
        <div className="flex-1 h-full overflow-hidden flex flex-col p-4 lg:p-6 bg-slate-50/50 dark:bg-slate-950/20">
            <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-6 h-full min-h-0 max-w-[1600px] mx-auto w-full">
                {/* SIATC Premium Sidebar */}
                <aside className="shrink-0 flex flex-col min-h-0 h-fit lg:h-full group">
                    <div className="bg-card rounded-[2rem] border border-border/50 shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden flex flex-col h-full backdrop-blur-sm">
                        <div className="p-6 border-b border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20 ring-4 ring-primary/5">
                                    <Settings2 className="w-5 h-5 stroke-[2.5]" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] leading-none">Módulo de</span>
                                    <span className="text-lg font-bold text-foreground tracking-tight">Configuración</span>
                                </div>
                            </div>
                        </div>

                        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] px-4 py-3 opacity-60">Administración</p>
                            {filteredItems.map((item) => (
                                <NavLink
                                    key={item.to}
                                    to={item.to}
                                    className={({ isActive }) => cn(
                                        "group/item flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-300 relative overflow-hidden",
                                        isActive
                                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 translate-x-1"
                                            : "text-muted-foreground hover:bg-muted hover:text-foreground hover:translate-x-1"
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
                        <div className="p-4 bg-muted/30 border-t border-border/50">
                            <div className="p-4 bg-background rounded-2xl border border-border/50 shadow-sm">
                                <div className="flex items-center gap-2 mb-1.5 font-bold text-[10px] text-primary uppercase tracking-widest">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                                    Sistema SIATC
                                </div>
                                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter leading-relaxed">
                                    Valorizaciones v2.1.0
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
