import React, { useState } from 'react';
import { Menu, X, Sun, Moon, Settings } from 'lucide-react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AppSwitcher } from './AppSwitcher';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../utils/cn';
import { SIATC_THEME } from '../../utils/siatc-theme';

export function MainLayout() {
    const { isAuthenticated, isLoading, user, hasPermission } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { theme, setTheme } = useTheme();

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-6">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-muted-foreground font-medium animate-pulse">Cargando Valorizaciones...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="h-screen bg-[#F8FAFC] dark:bg-[#020617] text-foreground flex overflow-hidden font-sans">
            {/* Mobile Sidebar Overlay */}
            <div
                className={cn(
                    "fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-md lg:hidden transition-all duration-500",
                    sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar Container: SIATC Platinum 288px (w-72), Glassmorphism */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-[70] w-72 transition-transform duration-500 ease-in-out lg:static lg:translate-x-0",
                    sidebarOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="h-full flex flex-col p-4 bg-transparent">
                    <div className={cn(
                        "flex-1 flex flex-col overflow-hidden relative rounded-[2.5rem] border border-white dark:border-white/5 shadow-2xl shadow-slate-200/50 dark:shadow-none",
                        SIATC_THEME.TOKENS.SIDEBAR_BG
                    )}>
                        <div className="flex items-center justify-end p-6 lg:hidden">
                            <button
                                onClick={() => setSidebarOpen(false)}
                                className="p-2 hover:bg-rose-500/10 hover:text-rose-500 rounded-2xl transition-all"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <Sidebar className="flex-1" />
                    </div>
                </div>
            </aside>

            {/* Main Content Viewport */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative pr-4 pb-4">
                {/* SIATC PREMIUM HEADER — h-20 estandarizado */}
                <header className="h-20 shrink-0 px-8 flex items-center justify-between sticky top-0 z-40">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-3 -ml-3 text-muted-foreground hover:bg-white dark:hover:bg-white/5 rounded-2xl lg:hidden shadow-sm transition-all border border-transparent hover:border-border/50"
                        >
                            <Menu className="w-6 h-6" />
                        </button>

                        <div className="flex items-center gap-4 group cursor-default">
                            <div className="w-12 h-12 flex items-center justify-center group-hover:scale-110 transition-all duration-500">
                                <img src="/logo.png" alt="Valorizaciones" className="w-10 h-10 object-contain" />
                            </div>
                            <div className="flex flex-col">
                                <span className="font-black text-sm tracking-tight text-foreground uppercase pt-1">Valorizaciones</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[10px] font-black text-muted-foreground tracking-widest uppercase opacity-60">Liquidaciones & Canales</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Header Actions: Glassmorphism Group — SIATC Platinum Standard */}
                    <div className={cn(
                        "flex items-center p-1.5 gap-2 rounded-[2rem] border",
                        SIATC_THEME.EFFECTS.GLASS_PANEL
                    )}>
                        {/* Theme Toggle */}
                        <button 
                            onClick={toggleTheme}
                            className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-primary hover:bg-primary/10 rounded-full transition-all duration-300"
                            title="Alternar Tema"
                        >
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>

                        {/* Config (Gear Icon) */}
                        {(hasPermission('val.config.users') || hasPermission('val.config.roles') || hasPermission('val.config.audit')) && (
                            <NavLink 
                                to="/config"
                                className={({ isActive }) => cn(
                                    "w-11 h-11 flex items-center justify-center rounded-full transition-all duration-300 group",
                                    isActive 
                                        ? "text-primary bg-primary/20 shadow-inner" 
                                        : "text-slate-400 hover:text-primary hover:bg-primary/10"
                                )}
                                title="Configuración del Sistema"
                            >
                                <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-500" />
                            </NavLink>
                        )}

                        <AppSwitcher currentAppId="valorizaciones" />

                        <div className="w-px h-6 bg-border/50 mx-1" />

                        {/* User Profile Avatar */}
                        <NavLink 
                            to="/profile"
                            className={({ isActive }) => cn(
                                "flex items-center gap-3 pl-1 pr-4 py-1 rounded-full group transition-all duration-300 border border-transparent",
                                isActive ? "bg-primary/10 border-primary/20" : "hover:bg-white dark:hover:bg-white/5"
                            )}
                            title="Mi Perfil"
                        >
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-primary/20 ring-2 ring-white dark:ring-slate-900 overflow-hidden shrink-0">
                                {user?.avatar_url ? (
                                    <img src={user.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    user?.username?.substring(0, 2).toUpperCase() || 'VAL'
                                )}
                            </div>
                            <div className="flex flex-col min-w-0 hidden md:flex">
                                <span className="text-[11px] font-black text-foreground truncate uppercase tracking-tight">{user?.username || 'Usuario'}</span>
                                <span className="text-[9px] font-black text-primary/70 uppercase tracking-widest">{user?.role_name || 'Admin'}</span>
                            </div>
                        </NavLink>
                    </div>
                </header>

                {/* Content Viewport */}
                <main className={SIATC_THEME.LAYOUT.VIEWPORT}>
                    <div className="flex-1 w-full max-w-[1600px] mx-auto flex flex-col min-h-0">
                        <Outlet />
                    </div>
                </main>

                {/* Background ambient decoration */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full -translate-y-1/2 translate-x-1/2 -z-10 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-500/5 blur-[100px] rounded-full translate-y-1/2 -translate-x-1/2 -z-10 pointer-events-none" />
            </div>
        </div>
    );
}
