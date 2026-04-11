import { NavLink, Outlet, useLocation, Navigate } from 'react-router-dom';
import { Users, Shield, Terminal } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuth } from '../../hooks/useAuth';

export default function ConfigLayout() {
    const { hasPermission } = useAuth();
    const location = useLocation();

    const configItems = [
        { to: '/config/users', icon: Users, label: 'Usuarios', permission: 'val.config.users' as const },
        { to: '/config/roles', icon: Shield, label: 'Roles', permission: 'val.config.roles' as const },
        { to: '/config/audit', icon: Terminal, label: 'Auditoría', permission: 'val.config.audit' as const },
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
        <div className="flex-1 h-full overflow-hidden flex flex-col p-4 lg:p-8">
            <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-8 h-full min-h-0">
                {/* Secondary Sidebar */}
                <aside className="shrink-0">
                    <div className="bg-card rounded-lg border border-border shadow-sm p-3 space-y-1">
                        <p className="text-xs font-bold text-foreground uppercase tracking-wider px-3 py-2">Configuración</p>
                        {filteredItems.map(item => (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                className={({ isActive }) => cn(
                                    "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-primary/5 dark:bg-primary/10 text-primary"
                                        : "text-foreground hover:bg-card hover:text-foreground"
                                )}
                            >
                                <item.icon className="w-4 h-4" />
                                {item.label}
                            </NavLink>
                        ))}
                    </div>
                </aside>

                {/* Config Content */}
                <div className="flex-1 min-w-0 h-full flex flex-col min-h-0">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
