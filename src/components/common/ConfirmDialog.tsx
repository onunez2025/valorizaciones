import React from 'react';
import { Modal } from './Modal';
import { AlertCircle, Info } from 'lucide-react';
import { cn } from '../../utils/cn';

interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmDialog({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    variant = 'danger'
}: ConfirmDialogProps) {
    
    const iconMap = {
        danger: <AlertCircle className="h-6 w-6 text-destructive" />,
        warning: <AlertCircle className="h-6 w-6 text-yellow-500" />,
        info: <Info className="h-6 w-6 text-primary" />
    };

    const confirmButtonClasses = {
        danger: 'bg-destructive hover:bg-destructive/90 text-white',
        warning: 'bg-yellow-500 hover:bg-yellow-600 text-white',
        info: 'bg-primary hover:bg-primary/90 text-white'
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <div className="flex flex-col gap-4">
                <div className="flex items-start gap-4">
                    <div className="mt-1">
                        {iconMap[variant]}
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-foreground/80 leading-relaxed">
                            {message}
                        </p>
                    </div>
                </div>
                
                <div className="flex justify-end gap-3 pt-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent rounded-md transition-colors border border-border"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md shadow-sm transition-colors",
                            confirmButtonClasses[variant]
                        )}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
