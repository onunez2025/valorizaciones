import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, Loader2, Settings2 } from 'lucide-react';
import { ApiClient } from '../../services/apiClient';
import { useDialog } from '../../context/DialogContext';

export default function SettingsPage() {
    const { alert } = useDialog();
    const [diasMax, setDiasMax] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const response = await ApiClient.get('/config');
                const diasConfig = response.data.find((c: any) => c.Clave === 'DIAS_MAX_CIERRE');
                if (diasConfig) {
                    setDiasMax(diasConfig.Valor);
                }
            } catch (err) {
                console.error("Error fetching config:", err);
                alert({ title: 'Error', message: 'Error al cargar la configuración', type: 'error' });
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleSave = async () => {
        if (!diasMax || isNaN(Number(diasMax))) {
            alert({ title: 'Error', message: 'Ingrese un número válido mayor a 0', type: 'error' });
            return;
        }

        const valueStr = diasMax.toString();

        setSaving(true);
        try {
            await ApiClient.post('/config', {
                clave: 'DIAS_MAX_CIERRE',
                valor: valueStr,
                descripcion: 'Máximo de días permitidos entre la visita y el cierre (CheckOut) para considerar tarifa.'
            });
            alert({ title: 'Éxito', message: 'Configuración guardada correctamente', type: 'success' });
        } catch (err) {
            console.error("Error saving config:", err);
            alert({ title: 'Error', message: 'No se pudo guardar la configuración', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 p-6 flex flex-col justify-center items-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="mt-4 text-sm text-muted-foreground font-medium animate-pulse">
                    Cargando configuración...
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-slate-50 relative">
            <div className="max-w-4xl mx-auto space-y-6 lg:space-y-8 pb-32">
                <div className="relative overflow-hidden rounded-3xl bg-white border border-border/10 shadow-sm p-6 sm:p-8 shrink-0">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <AlertCircle className="w-48 h-48" />
                    </div>
                    
                    <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                                Ajustes Generales
                            </h1>
                            <p className="text-sm font-medium text-slate-500 mt-2 flex items-center gap-2">
                                Configure los parámetros operativos de la plataforma
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex items-center gap-3">
                        <div className="p-2 bg-slate-100 rounded-xl text-slate-600">
                            <Settings2 className="w-5 h-5 stroke-[2]" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-800">Parámetros de Valorización</h2>
                    </div>

                    <div className="p-6 grid gap-6">
                        <div className="space-y-4 max-w-xl">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">
                                    Días Máximos de Cierre
                                </label>
                                <p className="text-xs text-slate-500 mb-3">
                                    Define la cantidad máxima de días permitidos entre la fecha de visita y la fecha de cierre del ticket (CheckOut). Si se supera este límite, la tarifa base calculada será S/ 0.00 .
                                </p>
                                <input
                                    type="number"
                                    min="0"
                                    value={diasMax}
                                    onChange={(e) => setDiasMax(e.target.value)}
                                    className="w-32 bg-slate-50 text-slate-900 px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 transition-all font-medium placeholder:text-slate-400"
                                    placeholder="Ej. 2"
                                />
                            </div>
                        </div>

                        <div className="pt-4 border-t border-slate-100">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-md shadow-primary/20 disabled:opacity-50 disabled:hover:scale-100"
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
