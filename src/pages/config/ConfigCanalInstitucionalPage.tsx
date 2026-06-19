import { useState, useEffect } from 'react';
import { ApiClient } from '../../services/apiClient';
import { Plus, Edit2, Trash2, Search, DollarSign, AlertCircle, ChevronRight, Layers } from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { useDialog } from '../../context/DialogContext';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';
import { SIATC_THEME } from '../../utils/siatc-theme';
import { SIATCTable, SIATCTableRow, SIATCTableCell, SIATCTableFooter } from '../../components/siatc/table/SIATCTable';

const CUPO_AREAS = ['OBRAS', 'TALLER', 'GENERAL'] as const;
type CupoArea = typeof CUPO_AREAS[number];

interface ConfigInstitucional {
    Id: number;
    Cupo_Area: CupoArea;
    Fecha_Inicio: string;
    Fecha_Fin: string;
    Importe: number;
    Activo: boolean;
    Creado_Por: string;
    Creado_El: string;
}

interface EditForm {
    id?: number;
    cupo_area: CupoArea;
    fecha_inicio: string;
    fecha_fin: string;
    importe: number;
    activo: boolean;
}

const AREA_BADGE: Record<CupoArea, string> = {
    OBRAS:   'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    TALLER:  'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    GENERAL: 'bg-muted text-muted-foreground',
};

const formatDateUTC = (dateStr: string) => {
    if (!dateStr) return '';
    try {
        return new Date(dateStr).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' });
    } catch { return dateStr; }
};

export default function ConfigCanalInstitucionalPage() {
    const [configs, setConfigs] = useState<ConfigInstitucional[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editForm, setEditForm] = useState<EditForm | null>(null);
    const { alert, confirm } = useDialog();
    const [currentPage, setCurrentPage] = useState(1);
    const recordsPerPage = 10;

    const fetchData = async () => {
        setLoading(true);
        try {
            setConfigs(await ApiClient.request('/config-canal-institucional'));
        } catch {
            alert({ message: 'Error al cargar la configuración institucional.' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleDelete = (id: number) => {
        confirm({
            title: '¿Eliminar regla?',
            message: 'Esta acción afectará los cálculos de valorización futuros.',
            confirmText: 'Sí, eliminar',
            type: 'danger',
            onConfirm: async () => {
                try {
                    await ApiClient.request(`/config-canal-institucional/${id}`, { method: 'DELETE' });
                    alert({ title: 'Eliminado', message: 'La regla ha sido eliminada.', type: 'success' });
                    fetchData();
                } catch {
                    alert({ message: 'Error al eliminar.' });
                }
            }
        });
    };

    const handleSave = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        try {
            await ApiClient.request('/config-canal-institucional', {
                method: 'POST',
                body: JSON.stringify(editForm)
            });
            alert({ title: 'Guardado', message: 'Configuración actualizada correctamente.', type: 'success' });
            setIsModalOpen(false);
            fetchData();
        } catch {
            alert({ message: 'Error al guardar la configuración.' });
        }
    };

    const openNew = () => {
        setEditForm({
            cupo_area: 'OBRAS',
            fecha_inicio: format(new Date(), 'yyyy-MM-dd'),
            fecha_fin: format(new Date(), 'yyyy-MM-dd'),
            importe: 0,
            activo: true,
        });
        setIsModalOpen(true);
    };

    const openEdit = (c: ConfigInstitucional) => {
        setEditForm({
            id: c.Id,
            cupo_area: c.Cupo_Area,
            fecha_inicio: c.Fecha_Inicio.split('T')[0],
            fecha_fin: c.Fecha_Fin.split('T')[0],
            importe: c.Importe,
            activo: c.Activo,
        });
        setIsModalOpen(true);
    };

    const filtered = configs.filter(c =>
        c.Cupo_Area?.toLowerCase().includes(search.toLowerCase())
    );
    const totalPages = Math.ceil(filtered.length / recordsPerPage);
    const paginated = filtered.slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage);

    return (
        <div className="flex flex-col h-full space-y-4 min-h-0 animate-in fade-in duration-500">
            <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-cb-text-secondary font-medium">
                        <Layers className="w-4 h-4 text-cb-neutral" />
                        <span>Configuración</span>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                        <span className="text-cb-text-primary">Canal Institucional</span>
                    </div>
                    <h1 className={SIATC_THEME.TYPOGRAPHY.PAGE_TITLE}>Canal Institucional</h1>
                    <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>
                        Tarifa plana por Cupo de Área (OBRAS / TALLER / GENERAL).
                    </p>
                </div>
                <button onClick={openNew} className={SIATC_THEME.COMPONENTS.BUTTON_PRIMARY}>
                    <Plus className="w-4 h-4 stroke-[2.5]" /> Nueva Regla
                </button>
            </div>

            <div className={SIATC_THEME.LAYOUT.CONTENT_CONTAINER}>
                <div className={SIATC_THEME.LAYOUT.SEARCH_BAR_WRAPPER}>
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/60" />
                        <input
                            type="text"
                            placeholder="Buscar por cupo área..."
                            className={cn(SIATC_THEME.COMPONENTS.INPUT, 'pl-11 pr-4')}
                            value={search}
                            onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                </div>

                <SIATCTable containerClassName="relative">
                    {loading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/60 backdrop-blur-md z-50">
                            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            <span className="text-sm font-bold text-cb-text-secondary mt-6 tracking-[0.2em] animate-pulse">Cargando reglas</span>
                        </div>
                    ) : paginated.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 opacity-30">
                            <AlertCircle className="w-16 h-16 mb-4 text-cb-neutral" />
                            <h3 className="text-sm font-bold uppercase tracking-widest text-cb-neutral">No hay reglas configuradas</h3>
                            <p className="text-xs text-cb-text-secondary mt-2 max-w-xs">Crea una regla para aplicar tarifa plana por Cupo Área.</p>
                        </div>
                    ) : (
                        <>
                            <thead className={SIATC_THEME.TABLE.HEADER_ROW}>
                                <tr className="border-b border-cb-border">
                                    <th className={SIATC_THEME.TABLE.HEADER_TH}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Cupo Área</span></th>
                                    <th className={cn(SIATC_THEME.TABLE.HEADER_TH, 'text-center')}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Importe</span></th>
                                    <th className={cn(SIATC_THEME.TABLE.HEADER_TH, 'text-center')}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Vigencia</span></th>
                                    <th className={cn(SIATC_THEME.TABLE.HEADER_TH, 'text-right')}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-cb-border/60">
                                {paginated.map(c => (
                                    <SIATCTableRow key={c.Id}>
                                        <SIATCTableCell>
                                            <span className={cn('px-3 py-1 rounded text-xs font-black tracking-tight', AREA_BADGE[c.Cupo_Area] ?? AREA_BADGE.GENERAL)}>
                                                {c.Cupo_Area}
                                            </span>
                                        </SIATCTableCell>
                                        <SIATCTableCell className="text-center">
                                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-500 font-mono">S/. {c.Importe.toFixed(2)}</span>
                                        </SIATCTableCell>
                                        <SIATCTableCell className="text-center">
                                            <span className="text-xs font-medium text-cb-text-secondary whitespace-nowrap font-mono">
                                                {formatDateUTC(c.Fecha_Inicio)} – {formatDateUTC(c.Fecha_Fin)}
                                            </span>
                                        </SIATCTableCell>
                                        <SIATCTableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => openEdit(c)}
                                                    className="p-2 bg-primary/10 text-primary hover:bg-primary hover:text-white dark:bg-primary/20 dark:text-primary-foreground dark:hover:bg-primary dark:hover:text-white rounded-lg transition-all shadow-sm cursor-pointer"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(c.Id)}
                                                    className="p-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-500 dark:hover:text-white rounded-lg transition-all shadow-sm cursor-pointer"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </SIATCTableCell>
                                    </SIATCTableRow>
                                ))}
                            </tbody>
                        </>
                    )}
                </SIATCTable>

                <SIATCTableFooter
                    totalRecords={filtered.length}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editForm?.id ? 'Editar Regla' : 'Nueva Regla de Canal Institucional'}
                size="lg"
            >
                <form onSubmit={handleSave} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="flex flex-col gap-2 md:col-span-2">
                            <label className="text-[10px] font-bold text-cb-text-secondary uppercase tracking-widest ml-1">Cupo Área</label>
                            <select
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, 'px-4')}
                                value={editForm?.cupo_area ?? 'OBRAS'}
                                onChange={e => setEditForm(f => f ? { ...f, cupo_area: e.target.value as CupoArea } : f)}
                                required
                            >
                                {CUPO_AREAS.map(a => (
                                    <option key={a} value={a}>{a}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-cb-text-secondary uppercase tracking-widest ml-1">Fecha Inicio</label>
                            <input
                                type="date"
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, 'px-4')}
                                value={editForm?.fecha_inicio ?? ''}
                                onChange={e => setEditForm(f => f ? { ...f, fecha_inicio: e.target.value } : f)}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-bold text-cb-text-secondary uppercase tracking-widest ml-1">Fecha Fin</label>
                            <input
                                type="date"
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, 'px-4')}
                                value={editForm?.fecha_fin ?? ''}
                                onChange={e => setEditForm(f => f ? { ...f, fecha_fin: e.target.value } : f)}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-2 md:col-span-2">
                            <label className="text-[10px] font-bold text-cb-text-secondary uppercase tracking-widest ml-1">Importe (S/.)</label>
                            <div className="relative">
                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 pointer-events-none" />
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className={cn(SIATC_THEME.COMPONENTS.INPUT, 'pl-11 pr-4')}
                                    value={editForm?.importe ?? 0}
                                    onChange={e => setEditForm(f => f ? { ...f, importe: parseFloat(e.target.value) } : f)}
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex gap-4">
                        <button type="button" onClick={() => setIsModalOpen(false)} className={SIATC_THEME.COMPONENTS.BUTTON_SECONDARY}>
                            Cancelar
                        </button>
                        <button type="submit" className={SIATC_THEME.COMPONENTS.BUTTON_PRIMARY}>
                            Guardar Regla
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
