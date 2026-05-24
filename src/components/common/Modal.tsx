import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { SIATC_THEME } from '../../utils/siatc-theme';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    hideCloseButton?: boolean;
}

export function Modal({ isOpen, onClose, title, subtitle, children, size = 'md', hideCloseButton = false }: ModalProps) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    if (!isOpen) return null;

    const sizeClasses = {
        sm: 'max-w-md',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
        xl: 'max-w-4xl',
    };

    return (
        <div className={cn("fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200", SIATC_THEME.TOKENS.MODAL_OVERLAY)}>
            <div className="fixed inset-0" onClick={onClose} />
            <div className={cn(
                SIATC_THEME.COMPONENTS.MODAL_CONTENT,
                "relative w-full mx-4 dark:bg-cb-bg text-cb-text-primary p-0 animate-in zoom-in-95 duration-200",
                sizeClasses[size]
            )}>
                <div className="flex items-center justify-between px-6 py-5 border-b border-cb-border">
                    <div className="flex flex-col">
                        <h2 className="text-[18px] font-bold leading-none tracking-tight text-cb-text-primary">{title}</h2>
                        {subtitle && <p className="text-[11px] text-cb-text-secondary font-bold mt-2">{subtitle}</p>}
                    </div>
                    {!hideCloseButton && (
                        <button
                            onClick={onClose}
                            className="rounded-cb-btn opacity-70 transition-all hover:opacity-100 hover:bg-cb-bg text-cb-text-secondary p-1.5"
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Close</span>
                        </button>
                    )}
                </div>
                <div className="p-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
}
