import React, { createContext, useContext, useState, useEffect } from 'react';

const APP_CODE = import.meta.env.VITE_APP_CODE || 'VAL';
const API_BASE_URL = '/api';

interface AppConfig {
    code: string;
    label: string;
    logoUrl: string;
    url: string;
}

const AppConfigContext = createContext<AppConfig | null>(null);

export const useAppConfig = () => useContext(AppConfigContext);

export const AppConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [config, setConfig] = useState<AppConfig | null>(null);

    useEffect(() => {
        fetch(`${API_BASE_URL}/applications?activeOnly=true`)
            .then(r => r.ok ? r.json() : [])
            .then((apps: any[]) => {
                const mine = apps.find((a: any) =>
                    a.code?.toUpperCase() === APP_CODE.toUpperCase()
                );
                if (mine && mine.logo_url) {
                    const appConf: AppConfig = {
                        code: mine.code,
                        label: mine.label,
                        logoUrl: mine.logo_url,
                        url: mine.url,
                    };
                    setConfig(appConf);

                    // Dynamically update favicon
                    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
                    if (link) {
                        link.href = mine.logo_url;
                    } else {
                        const newLink = document.createElement('link');
                        newLink.rel = 'icon';
                        newLink.href = mine.logo_url;
                        document.head.appendChild(newLink);
                    }

                    // Update document title
                    document.title = `${mine.label} - SIATC`;
                }
            })
            .catch(() => {
                // Silently fail — app falls back to local assets
            });
    }, []);

    return (
        <AppConfigContext.Provider value={config}>
            {children}
        </AppConfigContext.Provider>
    );
};
