import React from 'react';
import { X } from 'lucide-react';
import { SIATC_THEME } from '../../../utils/siatc-theme';
import { cn } from '../../../utils/cn';

interface SIATCModalWrapperProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';
}

/**
 * Wrapper de Modal SIATC Platinum
 * Implementa Glassmorphism y la curvatura maestra.
 */
export const SIATCModalWrapper: React.FC<SIATCModalWrapperProps> = ({
    isOpen,
    onClose,
    title,
    children,
    maxWidth = '2xl'
}) => {
    if (!isOpen) return null;

    const maxWidthClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '3xl': 'max-w-3xl',
        '4xl': 'max-w-4xl',
        '5xl': 'max-w-5xl',
        full: 'max-w-full'
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Overlay */}
            <div 
                className={cn("fixed inset-0 transition-opacity", SIATC_THEME.TOKENS.MODAL_OVERLAY)} 
                onClick={onClose}
            />
            
            {/* Modal Content */}
            <div className={cn(
                "relative w-full transform transition-all animate-in zoom-in-95 duration-200",
                maxWidthClasses[maxWidth],
                SIATC_THEME.COMPONENTS.MODAL_CONTENT
            )}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-black tracking-tight text-foreground">
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl hover:bg-muted transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="relative">
                    {children}
                </div>
            </div>
        </div>
    );
};
