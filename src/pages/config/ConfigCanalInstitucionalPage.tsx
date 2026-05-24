import { useState, useEffect } from 'react';
import { ApiClient } from '../../services/apiClient';
import { 
    Users, Plus, Edit2, Trash2, Search, 
    DollarSign, AlertCircle, ChevronRight
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { useDialog } from '../../context/DialogContext';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';
import { SIATC_THEME } from '../../utils/siatc-theme';

interface ConfigInstitucional {
    Id: number;
    Usuario_Creador: string;
    Fecha_Inicio: string;
    Fecha_Fin: string;
    Importe: number;
    Keywords: string;
    Validacion_Tipo: 'CONTIENE' | 'NO_CONTIENE';
    Activo: boolean;
    Creado_Por: string;
    Creado_El: string;
}

const formatDateUTC = (dateStr: string) => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
    } catch {
        return dateStr;
    }
};

const formatToInputDate = (dateStr: string) => {
    if (!dateStr) return '';
    return dateStr.split('T')[0];
};

export default function ConfigCanalInstitucionalPage() {
    const [configs, setConfigs] = useState<ConfigInstitucional[]>([]);
    const [creators, setCreators] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<Partial<ConfigInstitucional> | null>(null);
    const { alert, confirm } = useDialog();

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.request('/config-canal-institucional');
            setConfigs(data);
        } catch {
            alert({ message: "Error al cargar la configuración institucional." });
        } finally {
            setLoading(false);
        }
    };

    const fetchCreators = async () => {
        try {
            const data = await ApiClient.request('/c4c-creators');
            setCreators(data);
        } catch {
            console.error("No se pudieron cargar los creadores.");
        }
    };

    useEffect(() => {
        fetchData();
        fetchCreators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDelete = async (id: number) => {
        if (await confirm({ 
            title: "¿Eliminar regla?", 
            message: "Esta acción afectará los cálculos de valorización futuros.",
            confirmText: "Si, eliminar",
            type: 'danger'
        })) {
            try {
                await ApiClient.request(`/config-canal-institucional/${id}`, { method: 'DELETE' });
                alert({ title: "Eliminado", message: "La regla ha sido eliminada.", type: 'success' });
                fetchData();
            } catch {
                alert({ message: "Error al eliminar." });
            }
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await ApiClient.request('/config-canal-institucional', {
                method: 'POST',
                body: JSON.stringify(editingConfig)
            });
            alert({ title: "Guardado", message: "Configuración actualizada correctamente.", type: 'success' });
            setIsModalOpen(false);
            fetchData();
        } catch {
            alert({ message: "Error al guardar la configuración." });
        }
    };

    const filteredConfigs = configs.filter(c => 
        c.Usuario_Creador.toLowerCase().includes(search.toLowerCase()) || 
        (c.Keywords && c.Keywords.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className={SIATC_THEME.LAYOUT.PAGE_WRAPPER}>
            {/* Header */}
            <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-cb-text-secondary font-medium">
                        <Briefcase className="w-4 h-4 text-cb-neutral" />
                        <span>Configuración</span>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                        <span className="text-cb-text-primary">Canal Institucional</span>
                    </div>
                    <h1 className={SIATC_THEME.TYPOGRAPHY.PAGE_TITLE}>Canal Institucional (OData)</h1>
                    <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>
                        Control de tarifas planas por usuario creador y palabras clave.
                    </p>
                </div>
                <button 
                    onClick={() => {
                        setEditingConfig({
                            usuario_creador: '',
                            fecha_inicio: format(new Date(), 'yyyy-MM-dd'),
                            fecha_fin: format(new Date(), 'yyyy-MM-dd'),
                            importe: 0,
                            keywords: '',
                            validacion_tipo: 'CONTIENE',
                            activo: true
                        });
                        setIsModalOpen(true);
                    }}
                    className={SIATC_THEME.COMPONENTS.BUTTON_PRIMARY}
                >
                    <Plus className="w-4 h-4 stroke-[2.5]" /> Nueva Regla
                </button>
            </div>

            {/* Content Table */}
            <div className={cn(SIATC_THEME.LAYOUT.CONTENT_CONTAINER, "dark:bg-cb-bg")}>
                <div className={SIATC_THEME.LAYOUT.SEARCH_BAR_WRAPPER}>
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/60" />
                        <input 
                            type="text" 
                            placeholder="Buscar por usuario o palabras clave..." 
                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-11 pr-4 dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className={SIATC_THEME.TABLE.SCROLL_AREA}>
                    {loading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/60 backdrop-blur-md z-50">
                            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-bold text-cb-text-secondary mt-6 tracking-[0.2em] animate-pulse">Consultando reglas institucionales</span>
                        </div>
                    ) : filteredConfigs.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 opacity-30">
                            <AlertCircle className="w-16 h-16 mb-4 text-cb-neutral" />
                            <h3 className="text-sm font-bold uppercase tracking-widest text-cb-neutral">No hay reglas configuradas</h3>
                            <p className="text-xs text-cb-text-secondary mt-2 max-w-xs">Configura un usuario de C4C para aplicar tarifas institucionales.</p>
                        </div>
                    ) : (
                        <table className={SIATC_THEME.TABLE.TABLE_ELEMENT}>
                            <thead className={SIATC_THEME.TABLE.HEADER_ROW}>
                                <tr className="border-b border-cb-border">
                                    <th className={SIATC_THEME.TABLE.HEADER_TH}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Usuario Creador (C4C)</span></th>
                                    <th className={cn(SIATC_THEME.TABLE.HEADER_TH, "text-center")}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Importe Único</span></th>
                                    <th className={cn(SIATC_THEME.TABLE.HEADER_TH, "text-center")}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Vigencia</span></th>
                                    <th className={cn(SIATC_THEME.TABLE.HEADER_TH, "text-right")}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-cb-border/60">
                                {filteredConfigs.map(c => (
                                    <tr key={c.Id} className={SIATC_THEME.TABLE.BODY_ROW}>
                                        <td className={SIATC_THEME.TABLE.CELL}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary dark:text-primary-foreground border border-cb-border shadow-inner">
                                                    <Users className="w-4 h-4" />
                                                </div>
                                                <span className="text-sm font-bold text-cb-text-primary">{c.Usuario_Creador}</span>
                                            </div>
                                        </td>
                                        <td className={cn(SIATC_THEME.TABLE.CELL, "text-center")}>
                                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-500 font-mono">S/. {c.Importe.toFixed(2)}</span>
                                        </td>
                                        <td className={cn(SIATC_THEME.TABLE.CELL, "text-center")}>
                                            <div className="text-xs font-medium text-cb-text-secondary whitespace-nowrap font-mono">
                                                {formatDateUTC(c.Fecha_Inicio)} - {formatDateUTC(c.Fecha_Fin)}
                                            </div>
                                        </td>
                                        <td className={cn(SIATC_THEME.TABLE.CELL, "text-right")}>
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => {
                                                        setEditingConfig({
                                                            ...c,
                                                            usuario_creador: c.Usuario_Creador,
                                                            fecha_inicio: formatToInputDate(c.Fecha_Inicio),
                                                            fecha_fin: formatToInputDate(c.Fecha_Fin),
                                                            importe: c.Importe,
                                                            activo: c.Activo
                                                        });
                                                        setIsModalOpen(true);
                                                    }}
                                                    className="p-2 bg-primary/10 text-primary hover:bg-primary hover:text-white dark:bg-primary/20 dark:text-primary-foreground dark:hover:bg-primary dark:hover:text-white rounded-lg transition-all shadow-sm"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(c.Id)}
                                                    className="p-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white rounded-lg transition-all shadow-sm"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer Stats: SIATC Standard */}
                <div className={SIATC_THEME.TABLE.FOOTER}>
                    <p className={SIATC_THEME.TYPOGRAPHY.FOOTER_STATS}>
                        Total de reglas: <span className="text-cb-text-primary ml-1">{filteredConfigs.length}</span>
                    </p>
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white dark:bg-cb-bg rounded-cb-btn border border-cb-border shadow-cb-level-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-bold text-cb-neutral tracking-widest uppercase">Operativo</span>
                    </div>
                </div>
            </div>

            {/* Modal */}
            <Modal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                title={editingConfig?.Id ? "Editar Regla Institucional" : "Configurar Canal Institucional"}
                size="lg"
            >
                <form onSubmit={handleSave} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="flex flex-col gap-2 md:col-span-2">
                            <label className="text-[10px] font-bold text-cb-text-secondary uppercase tracking-widest ml-1">Usuario Creador del Ticket (Nombre exacto en C4C)</label>
                            <div className="relative">
                                <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/60 pointer-events-none" />
                                <input 
                                    type="text" 
                                    list="creators-list"
                                    className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-11 pr-4 dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                                    placeholder="Buscar o escribir nombre... Ej: Jose Perez"
                                    value={editingConfig?.usuario_creador || ''}
                                    onChange={(e) => setEditingConfig({...editingConfig, usuario_creador: e.target.value})}
                                    required
                                />
                                <datalist id="creators-list">
                                    {creators.map(c => <option key={c} value={c} />)}
                                </datalist>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-cb-text-secondary uppercase tracking-widest ml-1">Fecha Inicio</label>
                            <input 
                                type="date" 
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, "px-4 dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                                value={editingConfig?.fecha_inicio || ''}
                                onChange={(e) => setEditingConfig({...editingConfig, fecha_inicio: e.target.value})}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-cb-text-secondary uppercase tracking-widest ml-1">Fecha Fin</label>
                            <input 
                                type="date" 
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, "px-4 dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                                value={editingConfig?.fecha_fin || ''}
                                onChange={(e) => setEditingConfig({...editingConfig, fecha_fin: e.target.value})}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-cb-text-secondary uppercase tracking-widest ml-1">Importe Institucional (S/.)</label>
                            <div className="relative">
                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 pointer-events-none" />
                                <input 
                                    type="number" 
                                    step="0.01"
                                    className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-11 pr-4 dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                                    value={editingConfig?.importe || 0}
                                    onChange={(e) => setEditingConfig({...editingConfig, importe: parseFloat(e.target.value)})}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 flex gap-4">
                        <button 
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className={SIATC_THEME.COMPONENTS.BUTTON_SECONDARY}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            className={SIATC_THEME.COMPONENTS.BUTTON_PRIMARY}
                        >
                            Confirmar Configuración
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
