import React, { useState, useEffect, useContext, createContext, useCallback } from 'react';
import type { User, Permission } from '../types';
import { StorageService } from '../services/storageService';
import { API_BASE_URL } from '../services/apiClient';

interface AuthContextType {
    user: User | null;
    login: (user: User, token?: string, remember?: boolean) => void;
    logout: () => void;
    isAuthenticated: boolean;
    isLoading: boolean;
    hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    login: () => { },
    logout: () => { },
    isAuthenticated: false,
    isLoading: true,
    hasPermission: () => false,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const logout = useCallback(() => {
        setUser(null);
        StorageService.remove('current_user');
        StorageService.remove('auth_token');
        
        // Clear shared cookie
        const isProd = window.location.hostname.endsWith('.siatc.cloud');
        const cookieDomain = isProd ? '; domain=.siatc.cloud' : '';
        document.cookie = `token=; path=/${cookieDomain}; max-age=0; SameSite=Lax; Secure=${isProd ? 'true' : 'false'}`;
        
        window.location.href = '/login';
    }, []);

    useEffect(() => {
        const validateSession = async () => {
            try {
                const getCookie = (name: string): string | null => {
                    const value = `; ${document.cookie}`;
                    const parts = value.split(`; ${name}=`);
                    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
                    return null;
                };

                const decodeJwt = (t: string): Record<string, unknown> | null => {
                    try {
                        const base64Url = t.split('.')[1];
                        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map((c) => {
                            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                        }).join(''));
                        return JSON.parse(jsonPayload) as Record<string, unknown>;
                    } catch (_e) {
                        return null;
                    }
                };

                const cookieToken = getCookie('token');
                const localToken = StorageService.getToken();
                let activeToken = localToken;

                if (cookieToken) {
                    if (cookieToken !== localToken) {
                        StorageService.setToken(cookieToken);
                        activeToken = cookieToken;
                        
                        const payload = decodeJwt(cookieToken);
                        if (payload) {
                            const preHydratedUser = {
                                id: payload.id as string,
                                username: payload.username as string,
                                role_id: payload.role_id as string,
                                role_name: payload.role_name as string,
                                permissions: (payload.permissions as string[]) || [],
                                apps: payload.apps as string
                            };
                            setUser(preHydratedUser as unknown as User);
                            StorageService.setCurrentUser(preHydratedUser as unknown as User);
                        }
                    }
                } else {
                    if (localToken) {
                        logout();
                        window.location.href = '/login?expired=true';
                        return;
                    }
                }

                if (!activeToken) {
                    setIsLoading(false);
                    return;
                }

                const response = await fetch(`${API_BASE_URL}/auth/me`, {
                    headers: { 'Authorization': `Bearer ${activeToken}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    setUser(data.user);
                    StorageService.setCurrentUser(data.user);
                    // Almacenar token fresco del servidor (incluye casRUC para RLS cross-app SSO)
                    if (data.token) {
                        StorageService.setToken(data.token);
                        const isProd = window.location.hostname.endsWith('.siatc.cloud');
                        const cookieDomain = isProd ? '; domain=.siatc.cloud' : '';
                        document.cookie = `token=${data.token}; path=/${cookieDomain}; max-age=${24 * 60 * 60}; SameSite=Lax; Secure=${isProd ? 'true' : 'false'}`;
                    }
                } else {
                    logout();
                    window.location.href = '/login?expired=true';
                }
            } catch (error) {
                console.error("Session validation error:", error);
            } finally {
                setIsLoading(false);
            }
        };

        validateSession();
    }, [logout]);

    // --- Inactivity Logout Logic (5 Minutes) ---
    useEffect(() => {
        if (!user) return;

        let timeoutId: ReturnType<typeof setTimeout>;

        const resetTimer = () => {
            timeoutId = setTimeout(() => {
                logout();
                window.location.href = '/login?expired=true';
            }, 5 * 60 * 1000); // 5 minutes
        };

        const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
        
        const handleActivity = () => {
            if (timeoutId) clearTimeout(timeoutId);
            resetTimer();
        };

        activityEvents.forEach(event => {
            window.addEventListener(event, handleActivity);
        });

        resetTimer();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            activityEvents.forEach(event => {
                window.removeEventListener(event, handleActivity);
            });
        };
    }, [user, logout]);
    // ------------------------------------------

    const login = useCallback((newUser: User, token?: string, remember: boolean = true) => {
        setUser(newUser);
        StorageService.setCurrentUser(newUser, remember);
        if (token) {
            StorageService.setToken(token, remember);
            
            // Set shared cookie for SSO across subdomains
            const isProd = window.location.hostname.endsWith('.siatc.cloud');
            const cookieDomain = isProd ? '; domain=.siatc.cloud' : '';
            document.cookie = `token=${token}; path=/${cookieDomain}; max-age=${24 * 60 * 60}; SameSite=Lax; Secure=${isProd ? 'true' : 'false'}`;
        }
    }, []);

    const hasPermission = (permission: Permission): boolean => {
        if (!user) return false;
        if (user.role_name?.toLowerCase() === 'administrador') return true;
        return user.permissions?.includes(permission) || false;
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, isLoading, hasPermission }}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
