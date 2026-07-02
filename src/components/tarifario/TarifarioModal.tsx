import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClient } from '../../services/apiClient';
import { Modal } from '../common/Modal';
import { Check, Calendar, AlertCircle } from 'lucide-react';
import { useDialog } from '../../context/DialogContext';
import { toTitleCase } from '../../utils/formatters';
import { SIATC_THEME } from '../../utils/siatc-theme';
import { cn } from '../../utils/cn';

interface TarifarioModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialData: {
        casId: string;
        casNombre: string;
        categoria: string;
        servicio: string;
        servicioNombre: string;
    };
}

export default function TarifarioModal({ isOpen, onClose, onSuccess, initialData }: TarifarioModalProps) {
    const { t } = useTranslation();
    const [importe, setImporte] = useState<number>(0);
    const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0]);
    const [fechaFin, setFechaFin] = useState('');
    const [loading, setLoading] = useState(false);
    const { alert } = useDialog();

    const handleSave = async () => {
        if (importe <= 0) {
            alert({ title: t('tarifarioModal.errors.invalidAmountTitle'), message: t('tarifarioModal.errors.invalidAmount'), type: 'warning' });
            return;
        }

        setLoading(true);
        try {
            await ApiClient.request('/tarifarios/create', {
                method: 'POST',
                body: JSON.stringify({
                    empresa: initialData.casId,
                    categoria: initialData.categoria,
                    servicio: initialData.servicio,
                    importe: importe,
                    fecha_inicio: fechaInicio,
                    fecha_fin: fechaFin || null,
                    estado: 'A'
                })
            });
            alert({ title: t('tarifarioModal.success.title'), message: t('tarifarioModal.success.message'), type: 'success' });
            onSuccess();
            onClose();
        } catch (e: unknown) {
            alert({ title: "Error", message: e instanceof Error ? e.message : t('tarifarioModal.errors.createFailed'), type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={t('tarifarioModal.title')}
        >
            <div className="flex flex-col gap-6">
                {/* Context Card */}
                <div className="bg-primary/5 border border-primary/10 rounded-cb-card p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-primary">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-[11px] font-bold uppercase tracking-wider">{t('tarifarioModal.ticketInfo')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider">{t('tarifarioModal.casLabel')}</span>
                            <span className="text-sm font-bold text-cb-text-primary truncate">{initialData.casNombre}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider">{t('tarifarioModal.categoryLabel')}</span>
                            <span className="text-sm font-bold text-cb-text-primary truncate">{toTitleCase(initialData.categoria)}</span>
                        </div>
                        <div className="flex flex-col col-span-2">
                            <span className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider">{t('tarifarioModal.serviceLabel')}</span>
                            <span className="text-sm font-bold text-cb-text-primary">{toTitleCase(initialData.servicioNombre)} ({toTitleCase(initialData.servicio)})</span>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 col-span-full">
                        <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">{t('tarifarioModal.amountLabel')}</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-primary">S/</span>
                            <input 
                                type="number" 
                                value={importe}
                                onChange={(e) => setImporte(Number(e.target.value))}
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-10 pr-4 text-base font-bold dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                                placeholder="0.00"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">{t('tarifarioModal.startDateLabel')}</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/50" />
                            <input 
                                type="date" 
                                value={fechaInicio}
                                onChange={(e) => setFechaInicio(e.target.value)}
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-10 pr-4 dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">{t('tarifarioModal.endDateLabel')}</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/50" />
                            <input 
                                type="date" 
                                value={fechaFin}
                                onChange={(e) => setFechaFin(e.target.value)}
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-10 pr-4 dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                            />
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center gap-3 pt-4">
                    <button 
                        onClick={onClose}
                        className={cn(SIATC_THEME.COMPONENTS.BUTTON_SECONDARY, "flex-1")}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className={cn(SIATC_THEME.COMPONENTS.BUTTON_PRIMARY, "flex-[2]")}
                    >
                        {loading ? t('tarifarioModal.saving') : (
                            <>
                                <Check className="w-4 h-4" />
                                {t('tarifarioModal.createAndLink')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
