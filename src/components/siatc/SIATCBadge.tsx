import React from 'react';
import { cn } from '../../utils/cn';
import { SIATC_THEME } from '../../utils/siatc-theme';

// SIATC PREMIUM MASTER - SIATCBadge v2.0 (Platinum)
// Componente bloqueado: NO modificar estilos directamente. Usar variantes.

type SIATCBadgeVariant = 'success' | 'warning' | 'error' | 'danger' | 'info' | 'primary' | 'secondary';

interface SIATCBadgeProps {
    children: React.ReactNode;
    variant?: SIATCBadgeVariant;
    icon?: React.ElementType;
    dot?: boolean;
    className?: string;
}

export const SIATCBadge: React.FC<SIATCBadgeProps> = ({
    children,
    variant = 'info',
    icon: Icon,
    dot = false,
    className
}) => {
    const variantClass = {
        success:   SIATC_THEME.STATES.SUCCESS,
        warning:   SIATC_THEME.STATES.WARNING,
        error:     SIATC_THEME.STATES.ERROR,
        danger:    SIATC_THEME.STATES.ERROR,
        info:      SIATC_THEME.STATES.INFO,
        primary:   SIATC_THEME.STATES.PRIMARY,
        secondary: SIATC_THEME.STATES.SECONDARY,
    }[variant];

    const dotColorClass = {
        success:   'bg-emerald-500',
        warning:   'bg-amber-500',
        error:     'bg-rose-500',
        danger:    'bg-rose-500',
        info:      'bg-blue-500',
        primary:   'bg-primary',
        secondary: 'bg-slate-400',
    }[variant];

    return (
        <span className={cn(
            SIATC_THEME.STATES.BADGE_BASE,
            variantClass,
            className
        )}>
            {dot && (
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0 animate-pulse', dotColorClass)} />
            )}
            {!dot && Icon && <Icon className="w-3 h-3 shrink-0" />}
            {children}
        </span>
    );
};
