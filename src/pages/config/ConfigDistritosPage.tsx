import { useState, useEffect } from 'react';
import { ApiClient } from '../../services/apiClient';
import { 
    MapPin, Plus, Edit2, Trash2, Search, 
    Filter, Calendar, DollarSign, Check, 
    ChevronDown, X, Building2, Activity,
    AlertCircle, CheckCircle2, Clock
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { useDialog } from '../../context/DialogContext';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';

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
    const [editingConfig, setEditingConfig] = useState<any>(null);
    const { alert, confirm } = useDialog();

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
        } catch (error: any) {
            console.error("Error fetching data:", error);
            alert({ message: "No se pudo cargar la configuración." });
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (await confirm({ 
            title: "¿Eliminar configuración?", 
            message: "Esta acción no se puede deshacer y afectará los cálculos futuros.",
            confirmText: "Si, eliminar",
            type: 'danger'
        })) {
            try {
                await ApiClient.request(`/config-distritos/${id}`, { method: 'DELETE' });
                alert({ title: "Eliminado", message: "La regla ha sido eliminada.", type: 'success' });
                fetchData();
            } catch (error: any) {
                alert({ message: "Error al eliminar." });
            }
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
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
        } catch (error: any) {
            alert({ message: "No se pudo guardar la configuración." });
        }
    };

    const filteredConfigs = configs.filter(c => {
        const districts = JSON.parse(c.Distritos).join(', ');
        return districts.toLowerCase().includes(search.toLowerCase());
    });

    return (
        <div className="flex flex-col h-full gap-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-3">
                        <MapPin className="w-8 h-8 text-primary" />
                        Adicionales por Distrito
                    </h1>
                    <p className="text-muted-foreground text-sm font-bold opacity-60 italic">Zonificación de incentivos y recargos por CAS/Distrito.</p>
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
                    className="bg-primary text-white h-11 px-6 rounded-2xl font-black text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Crear Configuración
                </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-3xl border border-border shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <Activity className="w-6 h-6 leading-none" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">Reglas Activas</p>
                        <p className="text-2xl font-black text-foreground leading-none">{configs.filter(c => c.Activo).length}</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-3xl border border-border shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <MapPin className="w-6 h-6 leading-none" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">Distritos Cubiertos</p>
                        <p className="text-2xl font-black text-foreground leading-none">
                            {new Set(configs.flatMap(c => JSON.parse(c.Distritos))).size}
                        </p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-3xl border border-border shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                        <Building2 className="w-6 h-6 leading-none" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">CAS Participantes</p>
                        <p className="text-2xl font-black text-foreground leading-none">
                            {new Set(configs.flatMap(c => JSON.parse(c.CAS_Ids))).size}
                        </p>
                    </div>
                </div>
            </div>

            {/* Content Table */}
            <div className="flex-1 bg-card border border-border rounded-3xl overflow-hidden shadow-sm flex flex-col min-h-0 bg-white">
                <div className="p-4 border-b border-border bg-slate-50/50 flex items-center gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input 
                            type="text" 
                            placeholder="Buscar por distrito..." 
                            className="w-full bg-white border border-border/50 rounded-xl pl-11 pr-4 py-2.5 text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 bg-white border border-border/50 rounded-xl text-[10px] font-black text-muted-foreground">
                        <Filter className="w-3.5 h-3.5" />
                        FILTROS ACTIVOS
                    </div>
                </div>

                <div className="flex-1 overflow-auto custom-scrollbar">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4 opacity-40">
                            <Activity className="w-10 h-10 animate-spin text-primary" />
                            <p className="text-sm font-black italic">Sincronizando configuraciones...</p>
                        </div>
                    ) : filteredConfigs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-30">
                            <MapPin className="w-16 h-16 mb-6" />
                            <h3 className="text-lg font-black">No hay reglas configuradas</h3>
                            <p className="text-xs font-bold mt-2 max-w-xs">Cree una nueva regla para empezar a aplicar adicionales por zona.</p>
                        </div>
                    ) : (
                        <table className="w-full border-separate border-spacing-0">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">
                                    <th className="px-6 py-4 text-left">Distritos</th>
                                    <th className="px-6 py-4 text-left">CAS</th>
                                    <th className="px-6 py-4 text-center">Importe</th>
                                    <th className="px-6 py-4 text-center">Vigencia</th>
                                    <th className="px-6 py-4 text-center">Estado</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filteredConfigs.map(c => {
                                    const cCAS = JSON.parse(c.CAS_Ids);
                                    const cDist = JSON.parse(c.Distritos);
                                    return (
                                        <tr key={c.Id} className="hover:bg-primary/[0.01] transition-colors group">
                                            <td className="px-6 py-4 max-w-[300px]">
                                                <div className="flex flex-wrap gap-1">
                                                    {cDist.map((d: any) => (
                                                        <span key={d} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[9px] font-black border border-slate-200">
                                                            {d}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 max-w-[200px]">
                                                <div className="text-xs font-bold text-muted-foreground group">
                                                    {cCAS.length} {cCAS.length === 1 ? 'CAS Seleccionado' : 'CAS Seleccionados'}
                                                    <div className="hidden group-hover:flex flex-wrap gap-1 mt-2">
                                                        {cCAS.map((id: string) => {
                                                            const casItem = casList.find(item => item.ID_CAS === id);
                                                            return (
                                                                <span key={id} className="px-2 py-0.5 bg-primary/5 text-primary rounded-md text-[9px] font-black border border-primary/10">
                                                                    {casItem?.Abrev_nombre_colaboradores || id}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full font-black text-sm border border-emerald-100">
                                                    <DollarSign className="w-3.5 h-3.5" />
                                                    {c.Importe.toFixed(2)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className="flex items-center gap-2 text-[10px] font-black text-foreground">
                                                        <Calendar className="w-3 h-3 text-primary opacity-50" />
                                                        {format(new Date(c.Fecha_Inicio), 'dd/MM/yy')}
                                                        <span className="text-muted-foreground font-black">→</span>
                                                        {c.Fecha_Fin ? format(new Date(c.Fecha_Fin), 'dd/MM/yy') : <span className="text-emerald-500 italic">Indefinido</span>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={cn(
                                                    "px-3 py-1 rounded-full text-[10px] font-black border",
                                                    c.Activo 
                                                        ? "bg-emerald-50 text-emerald-600 border-emerald-100" 
                                                        : "bg-slate-100 text-slate-400 border-slate-200"
                                                )}>
                                                    {c.Activo ? 'ACTIVO' : 'INACTIVO'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
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
                                                        className="p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary hover:text-white transition-all shadow-sm"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDelete(c.Id)}
                                                        className="p-2 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
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
                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Seleccionar CAS</label>
                                <MultiSelect 
                                    options={casList.map(cas => ({ value: cas.ID_CAS, label: cas.Nombre_CAS, badge: cas.Abrev_nombre_colaboradores }))}
                                    selected={editingConfig.cas_ids}
                                    onChange={(vals) => setEditingConfig({...editingConfig, cas_ids: vals})}
                                    placeholder="Buscar CAS..."
                                />
                            </div>

                            {/* Ciudad y Distrito MultiSelect */}
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Filtrar por Ciudad</label>
                                    <select 
                                        className="w-full bg-slate-50 border border-border rounded-xl px-4 py-2.5 text-xs font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                        value={selectedCity}
                                        onChange={(e) => setSelectedCity(e.target.value)}
                                    >
                                        <option value="">Todas las ciudades</option>
                                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Seleccionar Distritos ({selectedCity || 'Todos'})</label>
                                    <MultiSelect 
                                        options={availableDistrictsForCity.map(d => ({ value: d, label: d }))}
                                        selected={editingConfig.distritos}
                                        onChange={(vals) => setEditingConfig({...editingConfig, distritos: vals})}
                                        placeholder="Buscar distritos..."
                                    />
                                </div>
                            </div>

                            {/* Importe y Fechas */}
                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Importe Adicional (S/.)</label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                                        <input 
                                            type="number" 
                                            step="0.10"
                                            className="w-full bg-slate-50 border border-border rounded-2xl pl-11 pr-4 py-3 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                            value={editingConfig.importe}
                                            onChange={(e) => setEditingConfig({...editingConfig, importe: parseFloat(e.target.value)})}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Estado</label>
                                    <div className="flex p-1 bg-slate-100 rounded-2xl border border-border">
                                        <button 
                                            type="button"
                                            onClick={() => setEditingConfig({...editingConfig, activo: true})}
                                            className={cn(
                                                "flex-1 py-2 text-xs font-black rounded-xl transition-all",
                                                editingConfig.activo ? "bg-white text-emerald-600 shadow-sm border border-border" : "text-muted-foreground opacity-50"
                                            )}
                                        >
                                            REGLA ACTIVA
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setEditingConfig({...editingConfig, activo: false})}
                                            className={cn(
                                                "flex-1 py-2 text-xs font-black rounded-xl transition-all",
                                                !editingConfig.activo ? "bg-white text-red-600 shadow-sm border border-border" : "text-muted-foreground opacity-50"
                                            )}
                                        >
                                            DESACTIVADA
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Fecha Inicio</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-50" />
                                        <input 
                                            type="date" 
                                            className="w-full bg-slate-50 border border-border rounded-2xl pl-11 pr-4 py-3 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                            value={editingConfig.fecha_inicio}
                                            onChange={(e) => setEditingConfig({...editingConfig, fecha_inicio: e.target.value})}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Fecha Fin (Opcional)</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-50" />
                                        <input 
                                            type="date" 
                                            className="w-full bg-slate-50 border border-border rounded-2xl pl-11 pr-4 py-3 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                            value={editingConfig.fecha_fin}
                                            onChange={(e) => setEditingConfig({...editingConfig, fecha_fin: e.target.value})}
                                        />
                                    </div>
                                    <p className="text-[9px] font-bold text-muted-foreground ml-1 italic opacity-60">Deje en blanco para vigencia indefinida.</p>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 flex gap-4">
                            <button 
                                type="button"
                                onClick={() => setIsEditModalOpen(false)}
                                className="flex-1 py-4 text-sm font-bold text-muted-foreground hover:bg-slate-50 rounded-2xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit"
                                className="flex-[2] py-4 bg-primary text-white text-sm font-black rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.01] transition-all"
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

    const selectAll = () => {
        const newVals = Array.from(new Set([...selected, ...options.map(o => o.value)]));
        onChange(newVals);
    };

    const clearAllInView = () => {
        const optionValues = options.map(o => o.value);
        onChange(selected.filter(s => !optionValues.includes(s)));
    };


    const filteredOptions = options.filter(o => 
        o.label.toLowerCase().includes(search.toLowerCase()) || 
        (o.badge && o.badge.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="relative">
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className="min-h-[52px] w-full bg-slate-50 border border-border rounded-2xl p-2.5 flex flex-wrap gap-1.5 cursor-pointer hover:border-primary/30 transition-all"
            >
                {selected.length === 0 ? (
                    <span className="text-sm font-bold text-muted-foreground ml-2 mt-1.5 opacity-40">{placeholder}</span>
                ) : (
                    selected.map(val => {
                        const opt = options.find(o => o.value === val);
                        return (
                            <div key={val} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary text-white rounded-xl text-[10px] font-black shadow-sm group">
                                {opt?.badge || opt?.label || val}
                                <X 
                                    className="w-3 h-3 cursor-pointer opacity-60 hover:opacity-100" 
                                    onClick={(e) => { e.stopPropagation(); toggle(val); }} 
                                />
                            </div>
                        )
                    })
                )}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground opacity-30">
                    <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
                </div>
            </div>

            {isOpen && (
                <div className="absolute top-full left-0 w-full mt-2 bg-white border border-border rounded-2xl shadow-2xl z-50 flex flex-col max-h-[300px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-3 border-b border-border bg-slate-50/50">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground opacity-40" />
                            <input 
                                autoFocus
                                type="text" 
                                placeholder="Filtrar..."
                                className="w-full bg-white border border-border rounded-xl pl-9 pr-4 py-2 text-xs font-bold outline-none focus:border-primary"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                        <div className="flex flex-col gap-0.5">
                            <div 
                                onClick={() => selected.length === options.length ? onChange([]) : onChange(options.map(o => o.value))}
                                className="px-3 py-2 hover:bg-primary/5 rounded-xl cursor-pointer flex items-center justify-between group"
                            >
                                <span className="text-[10px] font-black text-primary">MARCAR/DESMARCAR TODOS</span>
                                <div className={cn(
                                    "w-4 h-4 rounded-md border flex items-center justify-center transition-all",
                                    selected.length === options.length ? "bg-primary border-primary" : "border-border bg-white"
                                )}>
                                    {selected.length === options.length && <Check className="w-3 h-3 text-white" />}
                                </div>
                            </div>
                            <div className="h-px bg-border/50 my-1 mx-2" />
                            {filteredOptions.length === 0 ? (
                                <div className="p-8 text-center opacity-20 flex flex-col items-center">
                                    <Search className="w-8 h-8 mb-2" />
                                    <span className="text-[10px] font-black">SIN RESULTADOS</span>
                                </div>
                            ) : filteredOptions.map(opt => (
                                <div 
                                    key={opt.value}
                                    onClick={() => toggle(opt.value)}
                                    className={cn(
                                        "px-4 py-2.5 rounded-xl cursor-pointer flex items-center justify-between transition-colors",
                                        selected.includes(opt.value) ? "bg-primary/5" : "hover:bg-slate-50"
                                    )}
                                >
                                    <div className="flex flex-col">
                                        <span className="text-xs font-bold text-foreground">{opt.label}</span>
                                        {opt.badge && <span className="text-[9px] font-black text-primary opacity-60 leading-none">{opt.badge}</span>}
                                    </div>
                                    <div className={cn(
                                        "w-5 h-5 rounded-lg border flex items-center justify-center transition-all",
                                        selected.includes(opt.value) ? "bg-primary border-primary shadow-lg shadow-primary/20" : "border-border bg-white"
                                    )}>
                                        {selected.includes(opt.value) && <Check className="w-3.5 h-3.5 text-white" />}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {selected.length > 0 && (
                        <div className="p-3 border-t border-border bg-slate-50/50 flex items-center justify-between">
                            <span className="text-[10px] font-black text-muted-foreground">{selected.length} SELECCIONADOS</span>
                            <button 
                                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                                className="px-3 py-1 bg-white border border-border rounded-lg text-[10px] font-black hover:bg-slate-100"
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
