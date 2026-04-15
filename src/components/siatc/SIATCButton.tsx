import React from 'react';
import { cn } from '../../../utils/cn';
import { SIATC_THEME } from '../../../utils/siatc-theme';

interface SIATCButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'info' | 'ghost';
    isLoading?: boolean;
    icon?: React.ReactNode;
}

/**
 * Botón Estándar SIATC Platinum
 */
export const SIATCButton: React.FC<SIATCButtonProps> = ({
    children,
    variant = 'primary',
    isLoading,
    icon,
    className,
    disabled,
    ...props
}) => {
    const variantClasses = {
        primary: SIATC_THEME.COMPONENTS.BUTTON_PRIMARY,
        secondary: SIATC_THEME.COMPONENTS.BUTTON_SECONDARY,
        success: SIATC_THEME.COMPONENTS.BUTTON_SUCCESS,
        danger: SIATC_THEME.COMPONENTS.BUTTON_DANGER,
        info: SIATC_THEME.COMPONENTS.BUTTON_INFO,
        ghost: SIATC_THEME.COMPONENTS.BUTTON_GHOST,
    };

    return (
        <button
            className={cn(variantClasses[variant], className)}
            disabled={isLoading || disabled}
            {...props}
        >
            {isLoading ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : icon}
            {children}
        </button>
    );
};
