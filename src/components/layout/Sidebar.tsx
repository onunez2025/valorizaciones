import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Briefcase,
    FileText,
    LogOut
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';

export function Sidebar({ className }: { className?: string }) {
    const { theme } = useTheme();
    const { logout, hasPermission } = useAuth();

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
            "flex flex-col h-full border-r border-border transition-colors duration-300 font-sans",
            theme === 'dark' ? "bg-card text-card-foreground" : "bg-white text-slate-800",
            className
        )}>
            {/* Header / Logo Section - StandardIZED Padding (Matches Tablero Control) */}
            <div className="p-6 flex items-center gap-3 min-h-[62px]">
                <div className="w-10 h-10 flex items-center justify-center shrink-0 overflow-hidden">
                    <img src="/Logo.png" alt="Logo" className="h-full w-full object-contain" />
                </div>
                <div className="overflow-hidden">
                    <h1 className="font-bold text-lg leading-none tracking-tight truncate">Valorizaciones</h1>
                    <p className="text-[10px] text-muted-foreground mt-1 font-bold opacity-60">Control Gestión</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
                {filteredNavItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) => cn(
                            "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                            isActive
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                    >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                    </NavLink>
                ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-border space-y-2">
                <button
                    onClick={logout}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-500/10 rounded-md transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    Cerrar Sesión
                </button>
            </div>
        </div>
    );
}
