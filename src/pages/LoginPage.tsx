import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export const LoginPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const isExpired = searchParams.get('expired') === 'true';

    useEffect(() => {
        const consoleUrl = import.meta.env.VITE_CONSOLE_URL || (import.meta.env.PROD ? 'https://console.siatc.cloud' : 'http://localhost:3008');
        const redirectUrl = `${consoleUrl}/login?redirect=${encodeURIComponent(window.location.origin)}${isExpired ? '&expired=true' : ''}`;
        window.location.href = redirectUrl;
    }, [isExpired]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white font-sans">
            <div className="text-center space-y-4">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
                <p className="text-slate-400 font-medium tracking-wide">Redirigiendo al inicio de sesión centralizado...</p>
            </div>
        </div>
    );
};

export default LoginPage;
