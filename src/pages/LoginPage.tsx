import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { User, Lock, Eye, EyeOff, Moon, Sun } from 'lucide-react';
import { cn } from '../utils/cn';
import { API_BASE_URL } from '../services/apiClient';

export default function LoginPage() {
    const { login } = useAuth();
    const { theme, setTheme } = useTheme();
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
            login(data.user, data.token);

            if (data.user.requires_password_change) {
                navigate('/force-change-password');
            } else {
                navigate('/dashboard');
            }

        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.message || 'Credenciales inválidas');
        } finally {
            setLoading(false);
        }
    };

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    return (
        <div className="min-h-screen flex flex-col md:flex-row bg-background text-foreground transition-colors duration-300 font-sans">
            {/* Left Side - Brand / Visual (Matches Ecosystem Standard) */}
            <div className="hidden md:flex flex-col justify-between w-1/2 bg-slate-900 text-white p-12 relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCI+IDxyZWN0IHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgZmlsbD0ibm9uZSIvPiA8ZyBmaWxsPSJub25lIiBzdHJva2U9IiNmZmYiIHN0cm9rZS1vcGFjaXR5PSIwLjA1IiBzdHJva2Utd2lkdGg9IjIiPiA8cGF0aCBkPSJNMCAzdjU0TTMgMGg1NCIvPiA8L2c+IDwvc3ZnPg==')] bg-[size:60px_60px]" />
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-900/50" />

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 flex items-center justify-center shrink-0 overflow-hidden bg-white/10 rounded border border-white/20">
                             {/* Placeholder Logo */}
                            <span className="text-sm font-black text-white">VAL</span>
                        </div>
                        <span className="text-2xl font-bold tracking-tight">Valorizaciones</span>
                    </div>
                    <h1 className="text-5xl font-bold mb-4 leading-tight">
                        Sistema<br />Gestión de<br />Valorizaciones
                    </h1>
                    <div className="text-slate-400 text-lg max-w-md space-y-6">
                        <p>Control automatizado de pagos, penalidades<br />y servicios de terceros.</p>
                        <div className="flex flex-col w-fit gap-2">
                            <span className="text-2xl font-bold text-slate-100 tracking-tight">Gerencia de Atención al Cliente</span>
                            <div className="h-10 w-48 bg-white/5 rounded border border-white/10 flex items-center justify-center">
                                <span className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em]">GRUPO SOLE</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 text-sm text-slate-500">
                    © 2026 GAC - Grupo Sole. Todos los derechos reservados.
                </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="flex-1 flex flex-col justify-center items-center p-8 bg-background relative">
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

                <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-500">
                    <div className="text-center">
                        <h2 className="text-3xl font-bold tracking-tight">Bienvenido</h2>
                        <p className="mt-2 text-muted-foreground text-sm">
                            Ingresa tus credenciales para acceder al sistema
                        </p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6 mt-8">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1.5 ml-1">
                                    Usuario
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                                        <User className="w-5 h-5" />
                                    </div>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={(e) => setUsername(e.target.value)}
                                        className="block w-full pl-10 pr-3 py-2.5 bg-input/50 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
                                        placeholder="Ingrese usuario"
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-1.5 ml-1">
                                    Contraseña
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                                        <Lock className="w-5 h-5" />
                                    </div>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="block w-full pl-10 pr-10 py-2.5 bg-input/50 border border-input rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
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
                                <span className="text-muted-foreground">Recordarme</span>
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
                                "w-full flex justify-center h-9 items-center px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-bold text-primary-foreground bg-gradient-to-r from-primary/80 to-primary hover:from-primary/80 hover:to-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring transition-all transform active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed",
                                loading && "animate-pulse"
                            )}
                        >
                            {loading ? 'Autenticando...' : 'Iniciar Sesión'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
