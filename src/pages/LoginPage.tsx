import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { useAppConfig } from '../context/AppConfigContext';
import { User, Lock, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { cn } from '../utils/cn';
import { API_BASE_URL } from '../services/apiClient';
import { SIATC_THEME } from '../utils/siatc-theme';

export default function LoginPage() {
    const { login } = useAuth();
    const { theme, setTheme } = useTheme();
    const appConfig = useAppConfig();
    const logoUrl = appConfig?.logoUrl || '/logo.png';
    const [searchParams] = useSearchParams();
    const isExpired = searchParams.get('expired') === 'true';
    const navigate = useNavigate();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Credenciales inválidas');
            }

            const data = await response.json();
            login(data.user, data.token, undefined, data.sessionConfig);

            if (data.user.requires_password_change) {
                navigate('/force-change-password');
            } else {
                navigate('/dashboard');
            }

        } catch (err: unknown) {
            console.error('Login error:', err);
            setError(err instanceof Error ? err.message : 'Credenciales inválidas');
        } finally {
            setLoading(false);
        }
    };

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    return (
        <div className={SIATC_THEME.LOGIN_LAYOUT.CONTAINER}>
            {/* Left Side - Brand / Visual (Matches Ecosystem Standard) */}
            <div className={SIATC_THEME.LOGIN_LAYOUT.LEFT_PANEL}>
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+IDxyZWN0IHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgZmlsbD0ibm9uZSIvPiA8ZyBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjIiPiA8cGF0aCBkPSJNMCAzdjU0TTMgMGg1NCIvPiA8L2c+IDwvc3ZnPg==')] bg-[size:60px_60px]" />
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-900/50" />

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 flex items-center justify-center shrink-0 overflow-hidden">
                            <img src={logoUrl} alt="Valorizaciones Logo" className="h-full w-full object-contain" />
                        </div>
                        <span className="text-2xl font-bold tracking-tight text-white">Valorizaciones</span>
                    </div>
                    <h1 className="text-5xl font-bold mb-4 leading-tight text-white">
                        Sistema<br />Gestión de<br />Valorizaciones
                    </h1>
                    <div className="text-slate-400 text-lg max-w-md space-y-6">
                        <p>Control automatizado de pagos, penalidades<br />y servicios de terceros.</p>
                        <div className="flex flex-col w-fit gap-2">
                            <span className="text-2xl font-bold text-slate-100 tracking-tight">Gerencia de Atención al Cliente</span>
                            <img 
                                src="/Logo - Grupo Sole - Transparente blanco.png" 
                                alt="Logo Grupo Sole" 
                                className="h-auto max-w-[12rem] object-contain"
                            />
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-sm text-slate-500">
                    © 2026 GAC - Grupo Sole. Rinnai Corporation. Todos los derechos reservados.
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className={SIATC_THEME.LOGIN_LAYOUT.RIGHT_PANEL}>
                <div className="absolute top-6 right-6 flex items-center gap-4">
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full hover:bg-accent text-muted-foreground transition-colors"
                        title="Alternar Tema"
                    >
                        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    </button>
                    <button
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border hover:bg-accent text-sm font-medium transition-colors opacity-50 cursor-not-allowed"
                        disabled
                    >
                        ES
                    </button>
                </div>
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center">
                        <h2 className={SIATC_THEME.LOGIN_LAYOUT.TITLE}>Bienvenido</h2>
                        <p className={SIATC_THEME.LOGIN_LAYOUT.SUBTITLE}>
                            Ingresa tus credenciales para acceder al sistema
                        </p>
                    </div>

                    {isExpired && (
                        <div className={SIATC_THEME.LOGIN_LAYOUT.ALERT_EXPIRED}>
                            <Lock className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold">Sesión expirada</p>
                                <p className="opacity-90">Por seguridad, tu sesión ha finalizado. Por favor ingresa tus credenciales de nuevo.</p>
                            </div>
                        </div>
                    )}

                    <div className={SIATC_THEME.LOGIN_LAYOUT.CARD}>
                        <form onSubmit={handleLogin} className="space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1.5 ml-1 text-cb-text-primary">
                                        Usuario
                                    </label>
                                    <div className={SIATC_THEME.LOGIN_LAYOUT.INPUT_WRAPPER}>
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                                            <User className="w-5 h-5" />
                                        </div>
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            className={SIATC_THEME.LOGIN_LAYOUT.INPUT}
                                            placeholder="Ingrese usuario"
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-1.5 ml-1 text-cb-text-primary">
                                        Contraseña
                                    </label>
                                    <div className={SIATC_THEME.LOGIN_LAYOUT.INPUT_WRAPPER}>
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                                            <Lock className="w-5 h-5" />
                                        </div>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className={SIATC_THEME.LOGIN_LAYOUT.INPUT}
                                            placeholder="Ingrese contraseña"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-sm">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" className="w-4 h-4 rounded border-input text-primary focus:ring-primary" />
                                    <span className="text-cb-text-secondary">Recordarme</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setError('Por favor, contacta a tu administrador de sistemas para una nueva contraseña.')}
                                    className="font-medium text-primary hover:text-primary/80 transition-colors bg-transparent border-none p-0 cursor-pointer"
                                >
                                    ¿Olvidaste tu contraseña?
                                </button>
                            </div>

                            {error && (
                                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium text-center animate-in fade-in zoom-in-95">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className={cn(
                                    SIATC_THEME.COMPONENTS.BUTTON_PRIMARY,
                                    "w-full flex justify-center disabled:opacity-70 disabled:cursor-not-allowed"
                                )}
                            >
                                {loading ? 'Autenticando...' : 'Iniciar Sesión'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
