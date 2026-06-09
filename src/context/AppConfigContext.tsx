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
                if (mine) {
                    const appConf: AppConfig = {
                        code: mine.code,
                        label: mine.label,
                        logoUrl: mine.logo_url || '',
                        url: mine.url,
                    };
                    setConfig(appConf);

                    // Dynamically update favicon
                    if (mine.logo_url) {
                        const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
                        if (link) {
                            link.href = mine.logo_url;
                        } else {
                            const newLink = document.createElement('link');
                            newLink.rel = 'icon';
                            newLink.href = mine.logo_url;
                            document.head.appendChild(newLink);
                        }
                    }

                    // Update document title
                    document.title = `${mine.label} - SIATC`;

                    // Dynamic branding injection (Tenant Branding v2.0)
                    if (mine.theme_config) {
                        try {
                            const theme = mine.theme_config;
                            const root = document.documentElement;

                            // 1. Load Google Fonts dynamically
                            const googleFontsToLoad = new Set<string>();
                            if (theme.typography?.fontTitle) googleFontsToLoad.add(theme.typography.fontTitle);
                            if (theme.typography?.fontSubtitle) googleFontsToLoad.add(theme.typography.fontSubtitle);
                            if (theme.typography?.fontHeader) googleFontsToLoad.add(theme.typography.fontHeader);
                            if (theme.typography?.fontSidebar) googleFontsToLoad.add(theme.typography.fontSidebar);
                            if (theme.typography?.fontTableData) googleFontsToLoad.add(theme.typography.fontTableData);

                            googleFontsToLoad.forEach(fontName => {
                                const fontId = `siatc-font-${fontName.replace(/\s+/g, '-')}`;
                                if (!document.getElementById(fontId)) {
                                    const link = document.createElement('link');
                                    link.id = fontId;
                                    link.rel = 'stylesheet';
                                    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;500;600;700&display=swap`;
                                    document.head.appendChild(link);
                                }
                            });

                            // 2. Inject font families and layout dimensions
                            if (theme.typography?.fontTitle) root.style.setProperty('--font-title', `"${theme.typography.fontTitle}", sans-serif`);
                            if (theme.typography?.fontSubtitle) root.style.setProperty('--font-subtitle', `"${theme.typography.fontSubtitle}", sans-serif`);
                            if (theme.typography?.fontHeader) root.style.setProperty('--font-header', `"${theme.typography.fontHeader}", sans-serif`);
                            if (theme.typography?.fontSidebar) root.style.setProperty('--font-sidebar', `"${theme.typography.fontSidebar}", sans-serif`);
                            if (theme.typography?.fontTableData) root.style.setProperty('--font-table-data', `"${theme.typography.fontTableData}", monospace`);

                            if (theme.typography?.baseFontSize) root.style.fontSize = theme.typography.baseFontSize;
                            if (theme.layout?.sidebarWidth) root.style.setProperty('--sidebar-width', theme.layout.sidebarWidth);
                            if (theme.layout?.headerHeight) root.style.setProperty('--header-height', theme.layout.headerHeight);
                            if (theme.layout?.tableRowHeight) root.style.setProperty('--table-row-height', theme.layout.tableRowHeight);
                            if (theme.layout?.transitionDuration) root.style.setProperty('--transition-duration', theme.layout.transitionDuration);

                            // 3. Inject Border Radii
                            if (theme.border?.radiusChip) root.style.setProperty('--radius-chip', theme.border.radiusChip);
                            if (theme.border?.radiusButton) root.style.setProperty('--radius-button', theme.border.radiusButton);
                            if (theme.border?.radiusInput) root.style.setProperty('--radius-input', theme.border.radiusInput);
                            if (theme.border?.radiusCard) root.style.setProperty('--radius-card', theme.border.radiusCard);
                            if (theme.border?.radiusModal) root.style.setProperty('--radius-modal', theme.border.radiusModal);

                            // 4. Inject Dynamic CSS Rules for colors and shadows
                            let styleTag = document.getElementById('siatc-dynamic-theme-rules') as HTMLStyleElement | null;
                            if (!styleTag) {
                                styleTag = document.createElement('style');
                                styleTag.id = 'siatc-dynamic-theme-rules';
                                document.head.appendChild(styleTag);
                            }

                            let cssRules = '';

                            if (theme.light) {
                                cssRules += `:root {
                                    ${theme.light.primary ? `--primary: ${theme.light.primary} !important; --ring: ${theme.light.primary} !important;` : ''}
                                    ${theme.light.primaryForeground ? `--primary-foreground: ${theme.light.primaryForeground} !important;` : ''}
                                    ${theme.light.background ? `--cb-bg: ${theme.light.background} !important; --background: ${theme.light.background} !important;` : ''}
                                    ${theme.light.card ? `--card: ${theme.light.card} !important;` : ''}
                                    ${theme.light.border ? `--cb-border: ${theme.light.border} !important; --border: ${theme.light.border} !important;` : ''}
                                    ${theme.light.textPrimary ? `--cb-text-primary: ${theme.light.textPrimary} !important; --foreground: ${theme.light.textPrimary} !important;` : ''}
                                    ${theme.light.textSecondary ? `--cb-text-secondary: ${theme.light.textSecondary} !important;` : ''}
                                }\n`;
                            }

                            if (theme.dark) {
                                cssRules += `.dark {
                                    ${theme.dark.primary ? `--primary: ${theme.dark.primary} !important; --ring: ${theme.dark.primary} !important;` : ''}
                                    ${theme.dark.primaryForeground ? `--primary-foreground: ${theme.dark.primaryForeground} !important;` : ''}
                                    ${theme.dark.background ? `--cb-bg: ${theme.dark.background} !important; --background: ${theme.dark.background} !important;` : ''}
                                    ${theme.dark.card ? `--card: ${theme.dark.card} !important;` : ''}
                                    ${theme.dark.border ? `--cb-border: ${theme.dark.border} !important; --border: ${theme.dark.border} !important;` : ''}
                                    ${theme.dark.textPrimary ? `--cb-text-primary: ${theme.dark.textPrimary} !important; --foreground: ${theme.dark.textPrimary} !important;` : ''}
                                    ${theme.dark.textSecondary ? `--cb-text-secondary: ${theme.dark.textSecondary} !important;` : ''}
                                }\n`;
                            }

                            if (theme.shadows) {
                                cssRules += `:root {
                                    ${theme.shadows.level1 ? `--shadow-level-1: ${theme.shadows.level1} !important;` : ''}
                                    ${theme.shadows.level2 ? `--shadow-level-2: ${theme.shadows.level2} !important;` : ''}
                                    ${theme.shadows.level3 ? `--shadow-level-3: ${theme.shadows.level3} !important;` : ''}
                                }\n`;
                            }

                            // Responsive Rules (Tenant Branding v3.0)
                            cssRules += `@media (min-width: 768px) {
                                :root {
                                    --padding-scale: 1.0 !important;
                                }
                            }\n`;

                            cssRules += `@media (max-width: 767px) {
                                :root {
                                    ${theme.responsive?.mobileRadiusCard ? `--radius-card: ${theme.responsive.mobileRadiusCard} !important;` : ''}
                                    ${theme.responsive?.mobileRadiusButton ? `--radius-button: ${theme.responsive.mobileRadiusButton} !important; --radius-input: ${theme.responsive.mobileRadiusButton} !important;` : ''}
                                    --padding-scale: ${theme.responsive?.mobilePaddingScale || '1.0'} !important;
                                }
                                html {
                                    ${theme.responsive?.mobileFontScale ? `font-size: calc(${theme.typography?.baseFontSize || '16px'} * ${theme.responsive.mobileFontScale}) !important;` : ''}
                                }
                            }\n`;

                            styleTag.innerHTML = cssRules;

                        } catch (e) {
                            console.error('[ThemeConfig] Error applying dynamic branding, falling back to local styles:', e);
                        }
                    }
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
