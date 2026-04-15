import React from 'react';
import { cn } from '../../../utils/cn';
import { SIATC_THEME } from '../../../utils/siatc-theme';

interface SIATCBadgeProps {
    variant?: 'success' | 'warning' | 'error' | 'info' | 'primary' | 'secondary';
    children: React.ReactNode;
    className?: string;
    icon?: React.ReactNode;
}

/**
 * Badge Estándar SIATC Platinum
 */
export const SIATCBadge: React.FC<SIATCBadgeProps> = ({
    variant = 'info',
    children,
    className,
    icon
}) => {
    const variantClasses = {
        success: SIATC_THEME.STATES.SUCCESS,
        warning: SIATC_THEME.STATES.WARNING,
        error: SIATC_THEME.STATES.ERROR,
        info: SIATC_THEME.STATES.INFO,
        primary: SIATC_THEME.STATES.PRIMARY,
        secondary: SIATC_THEME.STATES.SECONDARY,
    };

    return (
        <span className={cn(
            SIATC_THEME.STATES.BADGE_BASE,
            variantClasses[variant],
            className
        )}>
            {icon && <span className="shrink-0">{icon}</span>}
            {children}
        </span>
    );
};
