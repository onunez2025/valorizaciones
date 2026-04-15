import React from 'react';
import { cn } from '../../utils/cn';
import { SIATC_THEME } from '../../utils/siatc-theme';

// SIATC PREMIUM MASTER - SIATCButton v2.0 (Platinum)
// Componente bloqueado: NO modificar estilos directamente. Usar variantes y tamaños.

type SIATCButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'info' | 'ghost';
type SIATCButtonSize = 'sm' | 'md' | 'lg';

interface SIATCButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: SIATCButtonVariant;
    size?: SIATCButtonSize;
    isLoading?: boolean;
    icon?: React.ElementType;
    iconRight?: React.ElementType;
    as?: React.ElementType;
}

export const SIATCButton: React.FC<SIATCButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    icon: Icon,
    iconRight: IconRight,
    className,
    disabled,
    as: Component = 'button',
    ...props
}) => {
    const variantClass = {
        primary:   SIATC_THEME.COMPONENTS.BUTTON_PRIMARY,
        secondary: SIATC_THEME.COMPONENTS.BUTTON_SECONDARY,
        success:   SIATC_THEME.COMPONENTS.BUTTON_SUCCESS,
        danger:    SIATC_THEME.COMPONENTS.BUTTON_DANGER,
        info:      SIATC_THEME.COMPONENTS.BUTTON_INFO,
        ghost:     SIATC_THEME.COMPONENTS.BUTTON_GHOST,
    }[variant];

    const sizeClass = {
        sm: 'px-3 py-1.5 text-[11px] gap-1.5 !rounded-lg',
        md: 'px-4 py-2.5 text-sm gap-2',
        lg: 'px-6 py-3.5 text-base gap-3',
    }[size];

    const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';
    const spinnerSize = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';

    return (
        <Component
            className={cn(
                variantClass,
                sizeClass,
                (isLoading || disabled) && 'opacity-60 cursor-not-allowed pointer-events-none',
                className
            )}
            disabled={isLoading || disabled}
            {...props}
        >
            {isLoading ? (
                <div className={cn('border-2 border-current border-t-transparent rounded-full animate-spin shrink-0', spinnerSize)} />
            ) : Icon && (
                <Icon className={cn('shrink-0', iconSize)} />
            )}
            {children}
            {!isLoading && IconRight && (
                <IconRight className={cn('shrink-0', iconSize)} />
            )}
        </Component>
    );
};
