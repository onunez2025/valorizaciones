import React, { useState, useEffect } from 'react';
import { Save, Loader2, Settings2, ChevronRight } from 'lucide-react';
import { ApiClient } from '../../services/apiClient';
import { useDialog } from '../../context/DialogContext';
import { SIATC_THEME } from '../../utils/siatc-theme';
import { cn } from '../../utils/cn';

interface ConfigItem {
    Clave: string;
    Valor: string;
    Descripcion?: string;
}

export default function SettingsPage() {
    const { alert } = useDialog();
    const [diasMax, setDiasMax] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const data = await ApiClient.request('/config') as ConfigItem[];
                const diasConfig = data.find((c) => c.Clave === 'DIAS_MAX_CIERRE');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async () => {
        if (!diasMax || isNaN(Number(diasMax))) {
            alert({ title: 'Error', message: 'Ingrese un número válido mayor a 0', type: 'error' });
            return;
        }

        const valueStr = diasMax.toString();

        setSaving(true);
        try {
            await ApiClient.request('/config', {
                method: 'POST',
                body: JSON.stringify({
                    clave: 'DIAS_MAX_CIERRE',
                    valor: valueStr,
                    descripcion: 'Máximo de días permitidos entre la visita y el cierre (CheckOut) para considerar tarifa.'
                })
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
            <div className="flex-1 p-6 flex flex-col justify-center items-center bg-cb-bg dark:bg-cb-bg/50">
                <Loader2 className="w-8 h-8 animate-spin text-cb-neutral" />
                <p className="mt-4 text-xs font-bold text-cb-text-secondary tracking-[0.2em] animate-pulse uppercase">
                    Cargando configuración...
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full space-y-4 min-h-0 animate-in fade-in duration-500">
            {/* Header */}
            <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-cb-text-secondary font-medium">
                        <Settings2 className="w-4 h-4 text-cb-neutral" />
                        <span>Configuración</span>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                        <span className="text-cb-text-primary">Ajustes Generales</span>
                    </div>
                    <h1 className={SIATC_THEME.TYPOGRAPHY.PAGE_TITLE}>Ajustes Generales</h1>
                    <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>
                        Configure los parámetros operativos de la plataforma.
                    </p>
                </div>
            </div>

            {/* Content Card Container */}
            <div className={cn(SIATC_THEME.COMPONENTS.CARD_CONTAINER, "max-w-4xl w-full mx-auto flex-1 flex flex-col min-h-0")}>
                <div className="p-6 border-b border-cb-border flex items-center gap-3 bg-cb-bg/30">
                    <div className="p-2 bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary-foreground rounded-cb-btn border border-cb-border/50">
                        <Settings2 className="w-5 h-5 stroke-[2]" />
                    </div>
                    <h2 className={SIATC_THEME.TYPOGRAPHY.SECTION_TITLE}>Parámetros de Valorización</h2>
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between">
                    <div className="space-y-6 max-w-xl">
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-cb-text-primary">
                                Días Máximos de Cierre
                            </label>
                            <p className="text-xs text-cb-text-secondary leading-relaxed">
                                Define la cantidad máxima de días permitidos entre la fecha de visita y la fecha de cierre del ticket (CheckOut). Si se supera este límite, la tarifa base calculada será S/ 0.00 .
                            </p>
                            <input
                                type="number"
                                min="0"
                                value={diasMax}
                                onChange={(e) => setDiasMax(e.target.value)}
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, "w-32 text-center text-cb-text-primary border-cb-border dark:bg-cb-bg font-mono")}
                                placeholder="Ej. 2"
                            />
                        </div>
                    </div>

                    <div className="pt-6 border-t border-cb-border flex justify-start">
                        <button
                           onClick={handleSave}
                           disabled={saving}
                           className={cn(
                               SIATC_THEME.COMPONENTS.BUTTON_PRIMARY,
                               "px-6",
                               saving && "opacity-80 cursor-not-allowed"
                           )}
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
    );
}
