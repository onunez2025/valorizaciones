import React, { useState } from 'react';
import { Menu, X, Sun, Moon, Settings, User as UserIcon, LogOut } from 'lucide-react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AppSwitcher } from './AppSwitcher';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../utils/cn';
import { SIATC_THEME } from '../../utils/siatc-theme';

/**
 * MAIN LAYOUT PLATINUM - Valorizaciones
 * Sincronizado con el estándar SIATC Ecosistema.
 */
export function MainLayout() {
    const { isAuthenticated, isLoading, user, logout, hasPermission } = useAuth();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { theme, setTheme } = useTheme();
    const navigate = useNavigate();

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-6">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-muted-foreground font-black uppercase tracking-widest text-[10px] animate-pulse">
                        Cargando Valorizaciones CAS...
                    </p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="h-screen bg-background text-foreground flex overflow-hidden font-sans">
            {/* Mobile Sidebar Overlay */}
            <div
                className={cn(
                    "fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden transition-opacity duration-300",
                    sidebarOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={() => setSidebarOpen(false)}
            />

            {/* Sidebar Container with Master Glassmorphism */}
            <aside
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-72 lg:static lg:translate-x-0 transition-transform duration-300 ease-in-out",
                    SIATC_THEME.TOKENS.SIDEBAR_BG,
                    "border-r border-white/10 dark:border-white/5 shadow-2xl lg:shadow-none",
                    sidebarOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="h-full flex flex-col">
                    <div className="flex items-center justify-end p-4 lg:hidden">
                        <button 
                            onClick={() => setSidebarOpen(false)}
                            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    
                    {/* Sidebar Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
                        <Sidebar />
                    </div>

                    {/* Footer / Version */}
                    <div className="p-6 border-t border-border/50">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] opacity-40">
                                v2.1 Platinum
                            </span>
                            <div className="flex gap-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary/20" />
                                <div className="w-1.5 h-1.5 rounded-full bg-primary/40" />
                                <div className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {/* 
                  HEADER PLATINUM - Altura h-20 obligatoria.
                  Glassmorphism focalizado y botones de acción unificados.
                */}
                <header className="h-20 shrink-0 flex items-center justify-between px-8 border-b border-border bg-white/50 dark:bg-slate-900/50 backdrop-blur-md sticky top-0 z-30">
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2.5 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl lg:hidden transition-colors"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        
                        {/* Logo & Brand */}
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-primary shadow-lg shadow-primary/20 flex items-center justify-center overflow-hidden">
                                <img src="/Logo.png" alt="Logo" className="h-full w-full object-contain p-1.5" />
                            </div>
                            <div className="hidden sm:flex flex-col">
                                <span className="font-black text-lg tracking-tight leading-none uppercase">Valorizaciones</span>
                                <span className="text-[10px] font-bold text-primary tracking-widest uppercase mt-1">CAS Ecosystem</span>
                            </div>
                        </div>
                    </div>
                    
                    {/* User & Actions Group */}
                    <div className="flex items-center gap-3 sm:gap-4 lg:gap-6">
                        {/* Action Buttons Group */}
                        <div className="hidden md:flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-2xl border border-border/50">
                            {/* Theme Toggle */}
                            <button 
                                onClick={toggleTheme}
                                className="p-2 rounded-xl text-slate-500 hover:bg-white dark:hover:bg-slate-800 dark:text-slate-400 hover:text-primary transition-all duration-300 shadow-sm hover:shadow-md active:scale-95"
                                title={theme === 'dark' ? "Modo Claro" : "Modo Oscuro"}
                            >
                                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                            </button>

                            {/* Config Toggle */}
                            {(hasPermission('val.config.users') || hasPermission('val.config.roles') || hasPermission('val.config.audit')) && (
                                <NavLink 
                                    to="/config"
                                    className={({ isActive }) => cn(
                                        "p-2 rounded-xl transition-all duration-300 shadow-sm active:scale-95",
                                        isActive 
                                            ? "text-primary bg-white dark:bg-slate-800 shadow-md ring-1 ring-primary/20" 
                                            : "text-slate-500 hover:text-primary hover:bg-white dark:hover:bg-slate-800 dark:text-slate-400"
                                    )}
                                    title="Configuración"
                                >
                                    <Settings className="w-5 h-5" />
                                </NavLink>
                            )}

                            {/* User Profile */}
                            <NavLink 
                                to="/profile"
                                className={({ isActive }) => cn(
                                    "p-2 rounded-xl transition-all duration-300 shadow-sm active:scale-95",
                                    isActive 
                                        ? "text-primary bg-white dark:bg-slate-800 shadow-md ring-1 ring-primary/20" 
                                        : "text-slate-500 hover:text-primary hover:bg-white dark:hover:bg-slate-800 dark:text-slate-400"
                                )}
                                title="Mi Perfil"
                            >
                                <UserIcon className="w-5 h-5" />
                            </NavLink>
                        </div>

                        <div className="w-px h-8 bg-border/60 mx-1 hidden md:block" />

                        {/* App Switcher */}
                        <AppSwitcher />

                        <div className="w-px h-8 bg-border/60 mx-1 hidden md:block" />

                        {/* Logout & User Info */}
                        <div className="flex items-center gap-4">
                            <div className="hidden lg:flex flex-col text-right">
                                <span className="text-sm font-black text-slate-900 dark:text-white truncate max-w-[150px]">
                                    {user?.full_name}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                    {user?.username}
                                </span>
                            </div>
                            
                            <button
                                onClick={() => logout()}
                                className="w-12 h-12 flex items-center justify-center rounded-2xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all duration-300 border border-rose-500/20 active:scale-90"
                                title="Cerrar Sesión"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </header>

                {/* 
                  MASTER CONTENT AREA 
                  Usa padding unificado y custom scrollbar.
                */}
                <main className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col custom-scrollbar bg-slate-50/50 dark:bg-slate-950/20">
                    <div className="flex-1 w-full mx-auto max-w-[1600px] flex flex-col min-h-0">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
