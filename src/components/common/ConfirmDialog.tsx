import { Modal } from './Modal';
import { AlertCircle, Info } from 'lucide-react';
import { cn } from '../../utils/cn';
import { SIATC_THEME } from '../../utils/siatc-theme';

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
        danger: <AlertCircle className="h-6 w-6 text-[#DF2935]" />,
        warning: <AlertCircle className="h-6 w-6 text-[#F0AD4E]" />,
        info: <Info className="h-6 w-6 text-primary" />
    };

    const confirmButtonClasses = {
        danger: SIATC_THEME.COMPONENTS.BUTTON_DANGER,
        warning: 'h-[36px] px-4 inline-flex items-center justify-center gap-2 bg-[#F0AD4E] hover:bg-[#F0AD4E]/90 text-white rounded-cb-btn transition-all active:scale-95 font-bold text-sm shadow-sm',
        info: SIATC_THEME.COMPONENTS.BUTTON_INFO
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <div className="flex flex-col gap-4">
                <div className="flex items-start gap-4">
                    <div className="mt-1">
                        {iconMap[variant]}
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-cb-text-secondary leading-relaxed">
                            {message}
                        </p>
                    </div>
                </div>
                
                <div className="flex justify-end gap-3 pt-2">
                    <button
                        onClick={onClose}
                        className={SIATC_THEME.COMPONENTS.BUTTON_SECONDARY}
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={cn(confirmButtonClasses[variant])}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
