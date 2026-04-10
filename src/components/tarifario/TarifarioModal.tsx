import { useState } from 'react';
import { ApiClient } from '../../services/apiClient';
import { Modal } from '../common/Modal';
import { Check, Calendar, AlertCircle } from 'lucide-react';
import { useDialog } from '../../context/DialogContext';
import { toTitleCase } from '../../utils/formatters';

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
    const [importe, setImporte] = useState<number>(0);
    const [fechaInicio, setFechaInicio] = useState(new Date().toISOString().split('T')[0]);
    const [fechaFin, setFechaFin] = useState('');
    const [loading, setLoading] = useState(false);
    const { alert } = useDialog();

    const handleSave = async () => {
        if (importe <= 0) {
            alert({ title: "Valor Inválido", message: "El importe debe ser mayor a cero.", type: 'warning' });
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
            alert({ title: "¡Éxito!", message: "La tarifa ha sido creada y aplicada.", type: 'success' });
            onSuccess();
            onClose();
        } catch (e: any) {
            alert({ title: "Error", message: e.message || "No se pudo crear la tarifa.", type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Vincular Nueva Tarifa"
        >
            <div className="flex flex-col gap-6">
                {/* Context Card */}
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-primary">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-[10px] font-black">Información del Ticket</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-muted-foreground">CAS</span>
                            <span className="text-sm font-black text-foreground truncate">{initialData.casNombre}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-muted-foreground">Categoría</span>
                            <span className="text-sm font-black text-foreground truncate">{toTitleCase(initialData.categoria)}</span>
                        </div>
                        <div className="flex flex-col col-span-2">
                            <span className="text-[10px] font-bold text-muted-foreground">Servicio</span>
                            <span className="text-sm font-black text-foreground">{toTitleCase(initialData.servicioNombre)} ({toTitleCase(initialData.servicio)})</span>
                        </div>
                    </div>
                </div>

                {/* Form */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5 col-span-full">
                        <label className="text-[10px] font-black text-muted-foreground ml-1">Importe de Tarifa (S/)</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-primary">S/</span>
                            <input 
                                type="number" 
                                value={importe}
                                onChange={(e) => setImporte(Number(e.target.value))}
                                className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-xl text-lg font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                placeholder="0.00"
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-muted-foreground ml-1">Fecha Inicio</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input 
                                type="date" 
                                value={fechaInicio}
                                onChange={(e) => setFechaInicio(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-muted-foreground ml-1">Fecha Fin (Opcional)</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input 
                                type="date" 
                                value={fechaFin}
                                onChange={(e) => setFechaFin(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-card border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="flex items-center gap-3 pt-4">
                    <button 
                        onClick={onClose}
                        className="flex-1 px-4 py-3 border border-border rounded-xl font-bold text-sm hover:bg-muted transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={loading}
                        className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-xl font-black text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {loading ? "Guardando..." : (
                            <>
                                <Check className="w-4 h-4" />
                                Crear y Vincular Tarifa
                            </>
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
