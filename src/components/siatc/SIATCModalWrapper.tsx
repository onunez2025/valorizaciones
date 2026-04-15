import React, { useEffect } from 'react';
import { cn } from '../../utils/cn';
import { SIATC_THEME } from '../../utils/siatc-theme';
import { X } from 'lucide-react';

// SIATC PREMIUM MASTER - SIATCModalWrapper v2.0 (Platinum)
// Componente bloqueado: Fuerza rounded-[2rem], padding p-8, y h-12 en inputs.
// NO modificar estilos base directamente.

interface SIATCModalWrapperProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

export const SIATCModalWrapper: React.FC<SIATCModalWrapperProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    children,
    footer,
    size = 'md',
    className,
}) => {
    // Bloquear scroll del body cuando el modal está abierto
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    // Cerrar con Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const sizeClass = {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
    }[size];

    return (
        <div
            className={cn(
                'fixed inset-0 z-[100] flex items-center justify-center p-4',
                SIATC_THEME.TOKENS.MODAL_OVERLAY,
                'animate-in fade-in duration-200'
            )}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div
                className={cn(
                    SIATC_THEME.COMPONENTS.MODAL_CONTENT,
                    'w-full animate-in zoom-in-95 slide-in-from-bottom-4 duration-300',
                    sizeClass,
                    className
                )}
            >
                {/* Header del Modal */}
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h2 className={cn(SIATC_THEME.TYPOGRAPHY.PAGE_TITLE, 'text-xl')}>
                            {title}
                        </h2>
                        {subtitle && (
                            <p className={cn(SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE, 'mt-1')}>
                                {subtitle}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 -mt-2 text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Cuerpo del Modal */}
                <div className="space-y-4">
                    {children}
                </div>

                {/* Footer del Modal */}
                {footer && (
                    <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};
