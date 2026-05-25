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
        window.location.href = '/login';
    }, []);

    useEffect(() => {
        const validateSession = async () => {
            try {
                const savedUser = StorageService.getCurrentUser();
                const token = StorageService.getToken();

                if (!savedUser || !token) {
                    setIsLoading(false);
                    return;
                }

                setUser(savedUser);

                const response = await fetch(`${API_BASE_URL}/auth/me`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    setUser(data.user);
                    StorageService.setCurrentUser(data.user);
                } else {
                    StorageService.remove('current_user');
                    StorageService.remove('auth_token');
                    window.location.href = '/login?expired=true';
                }
            } catch (error) {
                console.error("Session validation error", error);
            } finally {
                setIsLoading(false);
            }
        };

        validateSession();
    }, []);

    // --- Inactivity Logout Logic (5 Minutes) ---
    useEffect(() => {
        if (!user) return;

        let timeoutId: any;

        const resetTimer = () => {
            timeoutId = setTimeout(() => {
                StorageService.remove('current_user');
                StorageService.remove('auth_token');
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
    }, [user]);
    // ------------------------------------------

    const login = useCallback((newUser: User, token?: string, remember: boolean = true) => {
        setUser(newUser);
        StorageService.setCurrentUser(newUser, remember);
        if (token) {
            StorageService.setToken(token, remember);
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

export const useAuth = () => useContext(AuthContext);
