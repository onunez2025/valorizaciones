import { useState, useEffect } from 'react';
import { Search, Save } from 'lucide-react';
import { ApiClient } from '../../services/apiClient';
import type { PenaltyMotive, ValuationTicket } from '../../types';
import { Modal } from '../common/Modal';
import { toTitleCase } from '../../utils/formatters';
import { SIATC_THEME } from '../../utils/siatc-theme';
import { cn } from '../../utils/cn';

interface PenaltyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    ruc: string;
    tickets: ValuationTicket[];
    type: 'penalty' | 'additional';
    initialTicket?: string;
    initialDate?: string;
    existingData?: any;
}

export default function PenaltyModal({ isOpen, onClose, onSuccess, ruc, tickets, type, initialTicket, initialDate, existingData }: PenaltyModalProps) {
    const [motives, setMotives] = useState<PenaltyMotive[]>([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [searchResults, setSearchResults] = useState<ValuationTicket[]>([]);
    
    const [formData, setFormData] = useState({
        ticket: initialTicket || '',
        motivo: '',
        descripcion: '',
        importe: '',
        fecha: initialDate || new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        if (isOpen) {
            if (existingData) {
                setFormData({
                    ticket: existingData.Ticket || '',
                    motivo: existingData.Motivo || '',
                    descripcion: existingData.Descripcion || '',
                    importe: Math.abs(existingData.Importe).toString(),
                    fecha: existingData.Fecha ? existingData.Fecha.split('T')[0] : new Date().toISOString().split('T')[0]
                });
            } else {
                setFormData({
                    ticket: initialTicket || '',
                    motivo: '',
                    descripcion: '',
                    importe: '',
                    fecha: initialDate || new Date().toISOString().split('T')[0]
                });
            }
        }
    }, [isOpen, initialTicket, initialDate, existingData]);

    useEffect(() => {
        if (isOpen && type === 'penalty') {
            ApiClient.request('/penalty-motives').then(setMotives).catch(console.error);
        }
    }, [isOpen, type]);

    useEffect(() => {
        if (formData.ticket.length >= 3) {
            const timer = setTimeout(async () => {
                try {
                    const data = await ApiClient.request(`/tickets/search/${ruc}?q=${formData.ticket}`);
                    setSearchResults(data);
                } catch (error) {
                    console.error("Error searching tickets:", error);
                }
            }, 300);
            return () => clearTimeout(timer);
        } else {
            setSearchResults(tickets.slice(0, 10)); // Mostrar sugerencias iniciales
        }
    }, [formData.ticket, ruc, tickets]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const endpoint = type === 'penalty' ? '/penalties' : '/adicionales';
            const method = existingData ? 'PUT' : 'POST';
            const url = existingData ? `${endpoint}/${existingData.Id}` : endpoint;

            await ApiClient.request(url, {
                method,
                body: JSON.stringify({
                    ...formData,
                    ruc,
                    importe: parseFloat(formData.importe)
                })
            });
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Error saving record:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title={type === 'penalty' ? "Registrar Penalidad / Descuento" : "Registrar Importe Adicional"}
        >
            <form onSubmit={handleSubmit} className="space-y-5 p-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="relative space-y-1.5 text-left">
                        <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Ticket Asociado (Opcional)</label>
                        <div className="relative">
                            <input 
                                type="text"
                                placeholder="Escriba ticket o servicio..."
                                value={formData.ticket}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setFormData({...formData, ticket: val});
                                    if (!val) setShowDropdown(false);
                                    else setShowDropdown(true);
                                }}
                                onFocus={() => setShowDropdown(true)}
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, "pr-10 dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <Search className="w-4 h-4 text-cb-neutral/50" />
                            </div>
                        </div>

                        {showDropdown && (
                            <div className="absolute z-50 w-full mt-1 bg-white dark:bg-cb-bg border border-cb-border rounded-cb-card shadow-cb-level-2 max-h-60 overflow-auto custom-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="p-1">
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setFormData({...formData, ticket: ''});
                                            setShowDropdown(false);
                                        }}
                                        className="w-full text-left px-3 py-2 text-xs font-bold text-cb-neutral hover:bg-cb-bg rounded-cb-btn transition-colors"
                                    >
                                        -- Sin ticket específico --
                                    </button>
                                    {searchResults
                                        .map(t => (
                                            <button 
                                                key={t.Ticket}
                                                type="button"
                                                onClick={() => {
                                                    setFormData({
                                                        ...formData, 
                                                        ticket: t.Ticket,
                                                        fecha: t.Fecha.split('T')[0]
                                                    });
                                                    setShowDropdown(false);
                                                }}
                                                className="w-full text-left px-3 py-2 rounded-cb-btn hover:bg-primary/5 transition-colors group border-b border-cb-border/10 last:border-none"
                                            >
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold group-hover:text-primary transition-colors text-cb-text-primary">{t.Ticket}</span>
                                                    <span className="text-[10px] text-cb-neutral font-bold truncate">{toTitleCase(t.ServicioNombre || t.Servicio)}</span>
                                                </div>
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="space-y-1.5 text-left">
                        <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Fecha</label>
                        <input 
                            type="date"
                            value={formData.fecha}
                            onChange={(e) => setFormData({...formData, fecha: e.target.value})}
                            required
                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                        />
                    </div>
                </div>

                <div className="space-y-1.5 text-left">
                    <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Motivo / Concepto</label>
                    {type === 'penalty' ? (
                        <select 
                            value={formData.motivo}
                            onChange={(e) => setFormData({...formData, motivo: e.target.value})}
                            required
                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                        >
                            <option value="">-- Seleccionar motivo --</option>
                            {motives.map(m => (
                                <option key={m.IdMotivo} value={m.Motivo}>{toTitleCase(m.Motivo)}</option>
                            ))}
                        </select>
                    ) : (
                        <input 
                            type="text"
                            placeholder="Ej: Bono por cumplimiento, Servicio extra..."
                            value={formData.motivo}
                            onChange={(e) => setFormData({...formData, motivo: e.target.value})}
                            required
                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                        />
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5 text-left">
                        <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Importe (S/)</label>
                        <input 
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={formData.importe}
                            onChange={(e) => setFormData({...formData, importe: e.target.value})}
                            required
                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                        />
                    </div>
                </div>

                <div className="space-y-1.5 text-left">
                    <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Descripción / Observaciones</label>
                    <textarea 
                        rows={3}
                        value={formData.descripcion}
                        onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
                        required
                        className={cn(SIATC_THEME.COMPONENTS.INPUT, "h-auto py-2.5 resize-none dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                        placeholder="Detalle los motivos del descuento o adicional..."
                    />
                </div>

                <div className="pt-4 flex gap-3">
                    <button 
                        type="button" 
                        onClick={onClose}
                        className={cn(SIATC_THEME.COMPONENTS.BUTTON_SECONDARY, "flex-1")}
                    >
                        Cancelar
                    </button>
                    <button 
                        type="submit" 
                        disabled={loading}
                        className={cn(SIATC_THEME.COMPONENTS.BUTTON_PRIMARY, "flex-1")}
                    >
                        {loading ? "Guardando..." : <><Save className="w-4 h-4" /> Guardar</>}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
