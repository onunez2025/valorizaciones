import { useState, useEffect } from 'react';
import { ApiClient } from '../../services/apiClient';
import {
    MapPin, Plus, Edit2, Trash2, Search,
    Filter, Calendar, DollarSign, Check,
    ChevronDown, X, Building2, Activity
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { useDialog } from '../../context/DialogContext';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';
import { SIATC_THEME } from '../../utils/siatc-theme';
import { 
    SIATCTable, 
    SIATCTableRow, 
    SIATCTableCell, 
    SIATCTableFooter 
} from '../../components/siatc/table/SIATCTable';

interface DistritoInfo {
    Distrito: string;
    Ciudad: string;
}

interface ConfigDistrito {
    Id: number;
    CAS_Ids: string; // JSON string in DB
    Distritos: string; // JSON string in DB
    Importe: number;
    Fecha_Inicio: string;
    Fecha_Fin: string | null;
    Activo: boolean;
    Creado_Por: string;
    Creado_El: string;
}

interface CAS {
    ID_CAS: string;
    Nombre_CAS: string;
    Abrev_nombre_colaboradores: string;
}

export default function ConfigDistritosPage() {
    const [configs, setConfigs] = useState<ConfigDistrito[]>([]);
    const [distritosRepo, setDistritosRepo] = useState<DistritoInfo[]>([]);
    const [casList, setCasList] = useState<CAS[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedCity, setSelectedCity] = useState('');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<Partial<ConfigDistrito> & { cas_ids?: string[]; distritos?: string[]; importe?: number; fecha_inicio?: string; fecha_fin?: string; activo?: boolean } | null>(null);
    const { alert, confirm } = useDialog();
    const [currentPage, setCurrentPage] = useState(1);
    const recordsPerPage = 10;

    const cities = Array.from(new Set(distritosRepo.map(d => d.Ciudad))).sort();
    const availableDistrictsForCity = selectedCity 
        ? distritosRepo.filter(d => d.Ciudad === selectedCity).map(d => d.Distrito)
        : Array.from(new Set(distritosRepo.map(d => d.Distrito))).sort();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [configsData, distritosData, casData] = await Promise.all([
                ApiClient.request('/config-distritos'),
                ApiClient.request('/distritos'),
                ApiClient.request('/cas')
            ]);
            setConfigs(configsData);
            setDistritosRepo(distritosData);
            setCasList(casData);
            if (distritosData.length > 0) setSelectedCity(distritosData[0].Ciudad);
        } catch (error: unknown) {
            console.error("Error fetching data:", error);
            alert({ message: "No se pudo cargar la configuración." });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = (id: number) => {
        confirm({
            title: "¿Eliminar configuración?",
            message: "Esta acción no se puede deshacer y afectará los cálculos futuros.",
            confirmText: "Si, eliminar",
            type: 'danger',
            onConfirm: async () => {
                try {
                    await ApiClient.request(`/config-distritos/${id}`, { method: 'DELETE' });
                    alert({ title: "Eliminado", message: "La regla ha sido eliminada.", type: 'success' });
                    fetchData();
                } catch (_error: unknown) {
                    alert({ message: "Error al eliminar." });
                }
            }
        });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingConfig) return;
        try {
            await ApiClient.request('/config-distritos', {
                method: 'POST',
                body: JSON.stringify({
                    id: editingConfig.Id,
                    cas_ids: editingConfig.cas_ids,
                    distritos: editingConfig.distritos,
                    importe: editingConfig.importe,
                    fecha_inicio: editingConfig.fecha_inicio,
                    fecha_fin: editingConfig.fecha_fin || null,
                    activo: editingConfig.activo
                })
            });
            alert({ title: "Guardado", message: "Configuración actualizada correctamente.", type: 'success' });
            setIsEditModalOpen(false);
            fetchData();
        } catch (_error: unknown) {
            alert({ message: "No se pudo guardar la configuración." });
        }
    };

    const filteredConfigs = configs.filter(c => {
        const districts = JSON.parse(c.Distritos).join(', ');
        return districts.toLowerCase().includes(search.toLowerCase());
    });

    const totalPages = Math.ceil(filteredConfigs.length / recordsPerPage);
    const paginatedConfigs = filteredConfigs.slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage);

    return (
        <div className="flex flex-col h-full space-y-4 min-h-0 animate-in fade-in duration-500">
            {/* Header */}
            <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                <div className="space-y-1">
                    <h1 className={cn(SIATC_THEME.TYPOGRAPHY.PAGE_TITLE, "flex items-center gap-3")}>
                        <MapPin className="w-6 h-6 text-primary" />
                        Adicionales por Distrito
                    </h1>
                    <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>Zonificación de incentivos y recargos por CAS/Distrito.</p>
                </div>
                <button 
                    onClick={() => {
                        setEditingConfig({
                            cas_ids: [],
                            distritos: [],
                            importe: 0,
                            fecha_inicio: format(new Date(), 'yyyy-MM-dd'),
                            fecha_fin: '',
                            activo: true
                        });
                        setIsEditModalOpen(true);
                    }}
                    className={SIATC_THEME.COMPONENTS.BUTTON_PRIMARY}
                >
                    <Plus className="w-4 h-4" /> Crear Configuración
                </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={cn(SIATC_THEME.COMPONENTS.CARD_CONTAINER, "p-5 flex items-center gap-4")}>
                    <div className="w-12 h-12 rounded-cb-btn bg-primary/10 flex items-center justify-center text-primary">
                        <Activity className="w-6 h-6 leading-none" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider leading-none mb-1">Reglas Activas</p>
                        <p className="text-2xl font-bold text-cb-text-primary leading-none">{configs.filter(c => c.Activo).length}</p>
                    </div>
                </div>
                <div className={cn(SIATC_THEME.COMPONENTS.CARD_CONTAINER, "p-5 flex items-center gap-4")}>
                    <div className="w-12 h-12 rounded-cb-btn bg-cb-success/10 flex items-center justify-center text-cb-success">
                        <MapPin className="w-6 h-6 leading-none" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider leading-none mb-1">Distritos Cubiertos</p>
                        <p className="text-2xl font-bold text-cb-text-primary leading-none">
                            {new Set(configs.flatMap(c => JSON.parse(c.Distritos))).size}
                        </p>
                    </div>
                </div>
                <div className={cn(SIATC_THEME.COMPONENTS.CARD_CONTAINER, "p-5 flex items-center gap-4")}>
                    <div className="w-12 h-12 rounded-cb-btn bg-cb-warning/10 flex items-center justify-center text-cb-warning">
                        <Building2 className="w-6 h-6 leading-none" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider leading-none mb-1">CAS Participantes</p>
                        <p className="text-2xl font-bold text-cb-text-primary leading-none">
                            {new Set(configs.flatMap(c => JSON.parse(c.CAS_Ids))).size}
                        </p>
                    </div>
                </div>
            </div>

            {/* Content Table */}
            <div className={SIATC_THEME.LAYOUT.CONTENT_CONTAINER}>
                <div className={SIATC_THEME.LAYOUT.SEARCH_BAR_WRAPPER}>
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/60" />
                        <input 
                            type="text" 
                            placeholder="Buscar por distrito..." 
                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-11 pr-4")}
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                    <div className={cn(SIATC_THEME.STATES.BADGE_BASE, SIATC_THEME.STATES.SECONDARY, "px-3 h-[36px]")}>
                        <Filter className="w-3.5 h-3.5" />
                        FILTROS ACTIVOS
                    </div>
                </div>

                <SIATCTable containerClassName="relative">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4 opacity-40">
                            <Activity className="w-10 h-10 animate-spin text-primary" />
                            <p className="text-sm font-bold text-cb-text-secondary italic">Sincronizando configuraciones...</p>
                        </div>
                    ) : paginatedConfigs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-30">
                            <MapPin className="w-16 h-16 mb-6 text-cb-neutral" />
                            <h3 className="text-lg font-bold text-cb-text-primary">No hay reglas configuradas</h3>
                            <p className="text-xs font-bold text-cb-text-secondary mt-2 max-w-xs">Cree una nueva regla para empezar a aplicar adicionales por zona.</p>
                        </div>
                    ) : (
                        <>
                            <thead className={SIATC_THEME.TABLE.HEADER_ROW}>
                                <tr>
                                    <th className={SIATC_THEME.TABLE.HEADER_TH}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Distritos</span></th>
                                    <th className={SIATC_THEME.TABLE.HEADER_TH}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>CAS</span></th>
                                    <th className={cn(SIATC_THEME.TABLE.HEADER_TH, "text-center")}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Importe</span></th>
                                    <th className={cn(SIATC_THEME.TABLE.HEADER_TH, "text-center")}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Vigencia</span></th>
                                    <th className={cn(SIATC_THEME.TABLE.HEADER_TH, "text-center")}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Estado</span></th>
                                    <th className={cn(SIATC_THEME.TABLE.HEADER_TH, "text-right")}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-cb-border/50">
                                {paginatedConfigs.map(c => {
                                    const cCAS = JSON.parse(c.CAS_Ids);
                                    const cDist = JSON.parse(c.Distritos);
                                    return (
                                        <SIATCTableRow key={c.Id}>
                                            <SIATCTableCell className="max-w-[300px]">
                                                <div className="flex flex-wrap gap-1">
                                                    {cDist.map((d: string) => (
                                                        <span key={d} className={cn(SIATC_THEME.STATES.BADGE_BASE, SIATC_THEME.STATES.SECONDARY, "h-[22px] normal-case tracking-normal")}>
                                                            {d}
                                                        </span>
                                                    ))}
                                                </div>
                                            </SIATCTableCell>
                                            <SIATCTableCell className="max-w-[200px]">
                                                <div className="text-xs font-bold text-cb-text-secondary group">
                                                    {cCAS.length} {cCAS.length === 1 ? 'CAS Seleccionado' : 'CAS Seleccionados'}
                                                    <div className="hidden group-hover:flex flex-wrap gap-1 mt-2">
                                                        {cCAS.map((id: string) => {
                                                            const casItem = casList.find(item => item.ID_CAS === id);
                                                            return (
                                                                <span key={id} className={cn(SIATC_THEME.STATES.BADGE_BASE, SIATC_THEME.STATES.PRIMARY, "h-[22px] normal-case tracking-normal")}>
                                                                    {casItem?.Abrev_nombre_colaboradores || id}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </SIATCTableCell>
                                            <SIATCTableCell className="text-center">
                                                <div className={cn(SIATC_THEME.STATES.BADGE_BASE, SIATC_THEME.STATES.SUCCESS, "text-sm h-8 px-3")}>
                                                    <DollarSign className="w-3.5 h-3.5" />
                                                    {c.Importe.toFixed(2)}
                                                </div>
                                            </SIATCTableCell>
                                            <SIATCTableCell>
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className="flex items-center gap-2 text-[10px] font-bold text-cb-text-primary">
                                                        <Calendar className="w-3 h-3 text-primary opacity-50" />
                                                        {format(new Date(c.Fecha_Inicio), 'dd/MM/yy')}
                                                        <span className="text-cb-text-secondary font-black">→</span>
                                                        {c.Fecha_Fin ? format(new Date(c.Fecha_Fin), 'dd/MM/yy') : <span className="text-cb-success italic">Indefinido</span>}
                                                    </div>
                                                </div>
                                            </SIATCTableCell>
                                            <SIATCTableCell className="text-center">
                                                <span className={cn(
                                                    SIATC_THEME.STATES.BADGE_BASE,
                                                    c.Activo 
                                                        ? SIATC_THEME.STATES.SUCCESS 
                                                        : SIATC_THEME.STATES.SECONDARY
                                                )}>
                                                    {c.Activo ? 'ACTIVO' : 'INACTIVO'}
                                                </span>
                                            </SIATCTableCell>
                                            <SIATCTableCell className="text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                                                    <button 
                                                        onClick={() => {
                                                            setEditingConfig({
                                                                ...c,
                                                                cas_ids: JSON.parse(c.CAS_Ids),
                                                                distritos: JSON.parse(c.Distritos),
                                                                fecha_inicio: format(new Date(c.Fecha_Inicio), 'yyyy-MM-dd'),
                                                                fecha_fin: c.Fecha_Fin ? format(new Date(c.Fecha_Fin), 'yyyy-MM-dd') : ''
                                                            });
                                                            setIsEditModalOpen(true);
                                                        }}
                                                        className="p-2 bg-primary/10 text-primary rounded-cb-btn hover:bg-primary hover:text-white transition-all shadow-sm cursor-pointer"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDelete(c.Id)}
                                                        className="p-2 bg-cb-error/10 text-cb-error rounded-cb-btn hover:bg-cb-error hover:text-white transition-all shadow-sm cursor-pointer"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </SIATCTableCell>
                                        </SIATCTableRow>
                                    );
                                })}
                            </tbody>
                        </>
                    )}
                </SIATCTable>

                {/* Footer Stats: SIATC Standard */}
                <SIATCTableFooter 
                    totalRecords={filteredConfigs.length} 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />
            </div>

            {/* Edit / Create Modal */}
            {isEditModalOpen && editingConfig && (
                <Modal 
                    isOpen={isEditModalOpen} 
                    onClose={() => setIsEditModalOpen(false)} 
                    title={editingConfig.Id ? "Editar Regla Zonal" : "Nueva Regla Zonal"}
                    size="xl"
                >
                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* CAS MultiSelect */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Seleccionar CAS</label>
                                <MultiSelect
                                    options={casList.map(cas => ({ value: cas.ID_CAS, label: cas.Nombre_CAS, badge: cas.Abrev_nombre_colaboradores }))}
                                    selected={editingConfig.cas_ids ?? []}
                                    onChange={(vals) => setEditingConfig({...editingConfig, cas_ids: vals})}
                                    placeholder="Buscar CAS..."
                                />
                            </div>

                            {/* Ciudad y Distrito MultiSelect */}
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Filtrar por Ciudad</label>
                                    <select 
                                        className={cn(SIATC_THEME.COMPONENTS.INPUT, "h-11 appearance-none cursor-pointer")}
                                        value={selectedCity}
                                        onChange={(e) => setSelectedCity(e.target.value)}
                                    >
                                        <option value="">Todas las ciudades</option>
                                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Seleccionar Distritos ({selectedCity || 'Todos'})</label>
                                    <MultiSelect
                                        options={availableDistrictsForCity.map(d => ({ value: d, label: d }))}
                                        selected={editingConfig.distritos ?? []}
                                        onChange={(vals) => setEditingConfig({...editingConfig, distritos: vals})}
                                        placeholder="Buscar distritos..."
                                    />
                                </div>
                            </div>

                            {/* Importe y Fechas */}
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Importe Adicional (S/.)</label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500 animate-in fade-in" />
                                        <input 
                                            type="number" 
                                            step="0.10"
                                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "h-11 pl-11 font-bold")}
                                            value={editingConfig.importe}
                                            onChange={(e) => setEditingConfig({...editingConfig, importe: parseFloat(e.target.value)})}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Estado</label>
                                    <div className="flex p-1 bg-cb-bg/50 rounded-cb-card border border-cb-border">
                                        <button 
                                            type="button"
                                            onClick={() => setEditingConfig({...editingConfig, activo: true})}
                                            className={cn(
                                                "flex-1 py-2 text-xs font-bold rounded-cb-btn transition-all cursor-pointer",
                                                editingConfig.activo ? "bg-card text-cb-success shadow-cb-level-1 border border-cb-border" : "text-cb-neutral opacity-50"
                                            )}
                                        >
                                            REGLA ACTIVA
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setEditingConfig({...editingConfig, activo: false})}
                                            className={cn(
                                                "flex-1 py-2 text-xs font-bold rounded-cb-btn transition-all cursor-pointer",
                                                !editingConfig.activo ? "bg-card text-cb-error shadow-cb-level-1 border border-cb-border" : "text-cb-neutral opacity-50"
                                            )}
                                        >
                                            DESACTIVADA
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Fecha Inicio</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-50" />
                                        <input 
                                            type="date" 
                                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "h-11 pl-11 font-bold")}
                                            value={editingConfig.fecha_inicio}
                                            onChange={(e) => setEditingConfig({...editingConfig, fecha_inicio: e.target.value})}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Fecha Fin (Opcional)</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-50" />
                                        <input 
                                            type="date" 
                                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "h-11 pl-11 font-bold")}
                                            value={editingConfig.fecha_fin}
                                            onChange={(e) => setEditingConfig({...editingConfig, fecha_fin: e.target.value})}
                                        />
                                    </div>
                                    <p className="text-[9px] font-bold text-cb-neutral ml-1 italic opacity-60">Deje en blanco para vigencia indefinida.</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 flex gap-4">
                            <button 
                                type="button"
                                onClick={() => setIsEditModalOpen(false)}
                                className={cn(SIATC_THEME.COMPONENTS.BUTTON_SECONDARY, "flex-1 h-12")}
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit"
                                className={cn(SIATC_THEME.COMPONENTS.BUTTON_PRIMARY, "flex-[2] h-12")}
                            >
                                {editingConfig.Id ? 'Guardar Cambios' : 'Crear Configuración Ahora'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}

// Internal MultiSelect Component
function MultiSelect({ options, selected, onChange, placeholder }: { 
    options: { value: string, label: string, badge?: string }[], 
    selected: string[], 
    onChange: (vals: string[]) => void,
    placeholder: string
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');

    const toggle = (val: string) => {
        if (selected.includes(val)) {
            onChange(selected.filter(s => s !== val));
        } else {
            onChange([...selected, val]);
        }
    };

    const filteredOptions = options.filter(o => 
        o.label.toLowerCase().includes(search.toLowerCase()) || 
        (o.badge && o.badge.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="relative">
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="min-h-[52px] w-full bg-card border border-cb-border rounded-cb-card p-2.5 flex flex-wrap gap-1.5 cursor-pointer hover:border-primary/30 transition-all"
            >
                {selected.length === 0 ? (
                    <span className="text-sm font-bold text-cb-neutral/40 ml-2 mt-1.5">{placeholder}</span>
                ) : (
                    selected.map(val => {
                        const opt = options.find(o => o.value === val);
                        return (
                            <div key={val} className={cn(SIATC_THEME.STATES.BADGE_BASE, SIATC_THEME.STATES.PRIMARY, "h-[26px] normal-case tracking-normal gap-1 px-2.5 py-1.5 cursor-default")} onClick={(e) => e.stopPropagation()}>
                                {opt?.badge || opt?.label || val}
                                <X 
                                    className="w-3 h-3 cursor-pointer opacity-60 hover:opacity-100" 
                                    onClick={(e) => { e.stopPropagation(); toggle(val); }} 
                                />
                            </div>
                        )
                    })
                )}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-cb-neutral/40">
                    <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
                </div>
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 w-full mt-2 bg-card border border-cb-border rounded-cb-card shadow-cb-level-3 z-50 flex flex-col max-h-[300px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-3 border-b border-cb-border bg-cb-bg/30">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-cb-neutral/40" />
                            <input 
                                autoFocus
                                type="text" 
                                placeholder="Filtrar..."
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-9")}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                        <div className="flex flex-col gap-0.5">
                            <div 
                                onClick={() => selected.length === options.length ? onChange([]) : onChange(options.map(o => o.value))}
                                className="px-3 py-2 hover:bg-primary/5 rounded-cb-btn cursor-pointer flex items-center justify-between group"
                            >
                                <span className="text-[10px] font-bold text-primary">MARCAR/DESMARCAR TODOS</span>
                                <div className={cn(
                                    "w-4 h-4 rounded-cb-chip border flex items-center justify-center transition-all",
                                    selected.length === options.length ? "bg-primary border-primary" : "border-cb-border bg-white"
                                )}>
                                    {selected.length === options.length && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </div>
                            <div className="h-px bg-cb-border/50 my-1 mx-2" />
                            {filteredOptions.length === 0 ? (
                                <div className="p-8 text-center opacity-20 flex flex-col items-center">
                                    <Search className="w-8 h-8 mb-2" />
                                    <span className="text-[10px] font-bold text-cb-neutral">SIN RESULTADOS</span>
                                </div>
                            ) : filteredOptions.map(opt => (
                                <div 
                                    key={opt.value}
                                    onClick={() => toggle(opt.value)}
                                    className={cn(
                                        "px-4 py-2.5 rounded-cb-btn cursor-pointer flex items-center justify-between transition-colors",
                                        selected.includes(opt.value) ? "bg-primary/5" : "hover:bg-cb-bg"
                                    )}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-cb-text-primary">{opt.label}</span>
                                        {opt.badge && <span className="text-[9px] font-bold text-primary opacity-60 leading-none">{opt.badge}</span>}
                                    </div>
                                    <div className={cn(
                                        "w-5 h-5 rounded-cb-chip border flex items-center justify-center transition-all",
                                        selected.includes(opt.value) ? "bg-primary border-primary shadow-cb-level-1" : "border-cb-border bg-white"
                                    )}>
                                        {selected.includes(opt.value) && <Check className="w-3.5 h-3.5 text-white" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {selected.length > 0 && (
                        <div className="p-3 border-t border-cb-border bg-cb-bg/30 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-cb-text-secondary">{selected.length} SELECCIONADOS</span>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                                className={SIATC_THEME.COMPONENTS.BUTTON_SECONDARY}
                            >
                                LISTO
                            </button>
                        </div>
                    )}
                </div>
            )}
            {isOpen && <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />}
        </div>
    );
}
