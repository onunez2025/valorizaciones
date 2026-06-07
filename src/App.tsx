import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/layout/MainLayout';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './context/ThemeContext';
import { DialogProvider } from './context/DialogContext';

import { useAppConfig } from './context/AppConfigContext';

// Pages - Lazy loaded
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ValuationsPage = lazy(() => import('./pages/ValuationsPage'));
const TarifarioPage = lazy(() => import('./pages/TarifarioPage'));
const MaterialsPage = lazy(() => import('./pages/MaterialsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

// Configuration Pages
const ConfigLayout = lazy(() => import('./pages/config/ConfigLayout'));
const AuditLogPage = lazy(() => import('./pages/config/AuditLogPage'));

const consoleUrl = import.meta.env.VITE_CONSOLE_URL || (import.meta.env.PROD ? 'https://console.siatc.cloud' : 'http://localhost:3008');

const ExternalRedirect = ({ url }: { url: string }) => {
    React.useEffect(() => {
        window.location.replace(url);
    }, [url]);
    return (
        <div className="flex h-screen items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-6">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                <p className="text-muted-foreground font-medium animate-pulse">Redirigiendo a la administración central...</p>
            </div>
        </div>
    );
};
const SettingsPage = lazy(() => import('./pages/config/SettingsPage'));
const ConfigDistritosPage = lazy(() => import('./pages/config/ConfigDistritosPage'));
const ConfigCanalInstitucionalPage = lazy(() => import('./pages/config/ConfigCanalInstitucionalPage'));

const LoadingFallback = () => {
    const appConfig = useAppConfig();
    const logoUrl = appConfig?.logoUrl || '/Logo.png';
    return (
    <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6">
            <img src={logoUrl} alt="Valorizaciones Logo" className="w-16 h-16 object-contain animate-pulse" />
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-muted-foreground font-medium animate-pulse">Cargando Valorizaciones...</p>
        </div>
    </div>
    );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <DialogProvider>
          <BrowserRouter>
            <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              
              {/* Rutas protegidas se añadirán con MainLayout */}
              <Route element={<MainLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/valuations" element={<ValuationsPage />} />
                <Route path="/tarifario" element={<TarifarioPage />} />
                <Route path="/materiales" element={<MaterialsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                
                {/* Configuración */}
                <Route path="/config" element={<ConfigLayout />}>
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="users" element={<ExternalRedirect url={`${consoleUrl}/users`} />} />
                    <Route path="roles" element={<ExternalRedirect url={`${consoleUrl}/roles`} />} />
                    <Route path="audit" element={<AuditLogPage />} />
                    <Route path="distritos" element={<ConfigDistritosPage />} />
                    <Route path="institucional" element={<ConfigCanalInstitucionalPage />} />
                    <Route index element={<Navigate to="settings" replace />} />
                </Route>

                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        </DialogProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
