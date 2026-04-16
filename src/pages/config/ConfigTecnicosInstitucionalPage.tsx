import { useState, useEffect } from 'react';
import { ApiClient } from '../../services/apiClient';
import { 
    User, Plus, Edit2, Trash2, Search, 
    Filter, Calendar, DollarSign, Check, 
    ChevronDown, X, Activity,
    Briefcase
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { useDialog } from '../../context/DialogContext';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';

interface Tecnico {
    CodigoTecnico: string;
    NombreCompleto: string;
}

interface ConfigTecnicoInstitucional {
    Id: number;
    Tecnico_Id: string;
    Nombre_Tecnico: string;
    Fecha_Inicio: string;
    Fecha_Fin: string;
    Importe: number;
    Activo: boolean;
    Creado_Por: string;
    Creado_El: string;
}

export default function ConfigTecnicosInstitucionalPage() {
    const [configs, setConfigs] = useState<ConfigTecnicoInstitucional[]>([]);
    const [tecnicosList, setTecnicosList] = useState<Tecnico[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<any>(null);
    const { alert, confirm } = useDialog();

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [configsData, tecnicosData] = await Promise.all([
                ApiClient.request('/config-tecnicos-institucional'),
                ApiClient.request('/tecnicos-list')
            ]);
            setConfigs(configsData);
            setTecnicosList(tecnicosData);
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
                await ApiClient.request(`/config-tecnicos-institucional/${id}`, { method: 'DELETE' });
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
            const tecnico = tecnicosList.find(t => t.CodigoTecnico === editingConfig.tecnico_id);
            await ApiClient.request('/config-tecnicos-institucional', {
                method: 'POST',
                body: JSON.stringify({
                    id: editingConfig.Id,
                    tecnico_id: editingConfig.tecnico_id,
                    nombre_tecnico: tecnico?.NombreCompleto || editingConfig.nombre_tecnico,
                    importe: editingConfig.importe,
                    fecha_inicio: editingConfig.fecha_inicio,
                    fecha_fin: editingConfig.fecha_fin,
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

    const filteredConfigs = configs.filter(c => 
        c.Nombre_Tecnico.toLowerCase().includes(search.toLowerCase()) || 
        c.Tecnico_Id.includes(search)
    );

    return (
        <div className="flex flex-col h-full gap-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-3">
                        <Briefcase className="w-8 h-8 text-primary" />
                        Canal Institucional
                    </h1>
                    <p className="text-muted-foreground text-sm font-bold opacity-60 italic">Tarifas planas para técnicos asignados al canal institucional.</p>
                </div>
                <button 
                    onClick={() => {
                        setEditingConfig({
                            tecnico_id: '',
                            nombre_tecnico: '',
                            importe: 0,
                            fecha_inicio: format(new Date(), 'yyyy-MM-dd'),
                            fecha_fin: format(new Date(), 'yyyy-MM-dd'),
                            activo: true
                        });
                        setIsEditModalOpen(true);
                    }}
                    className="bg-primary text-white h-11 px-6 rounded-2xl font-black text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Asignar Técnico
                </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-3xl border border-border shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                        <Activity className="w-6 h-6 leading-none" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">Técnicos Configurados</p>
                        <p className="text-2xl font-black text-foreground leading-none">{configs.length}</p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-3xl border border-border shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <User className="w-6 h-6 leading-none" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">Reglas Activas</p>
                        <p className="text-2xl font-black text-foreground leading-none">
                            {configs.filter(c => c.Activo).length}
                        </p>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-3xl border border-border shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
                        <DollarSign className="w-6 h-6 leading-none" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">Importe Promedio</p>
                        <p className="text-2xl font-black text-foreground leading-none">
                            S/. {(configs.reduce((acc, c) => acc + c.Importe, 0) / (configs.length || 1)).toFixed(2)}
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
                            placeholder="Buscar por técnico o código..." 
                            className="w-full bg-white border border-border/50 rounded-xl pl-11 pr-4 py-2.5 text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
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
                            <User className="w-16 h-16 mb-6" />
                            <h3 className="text-lg font-black">No hay técnicos configurados</h3>
                            <p className="text-xs font-bold mt-2 max-w-xs">Asigne un técnico al canal institucional para empezar.</p>
                        </div>
                    ) : (
                        <table className="w-full border-separate border-spacing-0">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">
                                    <th className="px-6 py-4 text-left">Técnico</th>
                                    <th className="px-6 py-4 text-center">Importe Fijo</th>
                                    <th className="px-6 py-4 text-center">Vigencia</th>
                                    <th className="px-6 py-4 text-center">Estado</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filteredConfigs.map(c => (
                                    <tr key={c.Id} className="hover:bg-primary/[0.01] transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-foreground">{c.Nombre_Tecnico}</span>
                                                <span className="text-[10px] font-bold text-muted-foreground">ID: {c.Tecnico_Id}</span>
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
                                                    {format(new Date(c.Fecha_Fin), 'dd/MM/yy')}
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
                                                            tecnico_id: c.Tecnico_Id,
                                                            nombre_tecnico: c.Nombre_Tecnico,
                                                            fecha_inicio: format(new Date(c.Fecha_Inicio), 'yyyy-MM-dd'),
                                                            fecha_fin: format(new Date(c.Fecha_Fin), 'yyyy-MM-dd')
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
                                ))}
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
                    title={editingConfig.Id ? "Editar Asignación" : "Nueva Asignación Institucional"}
                    size="lg"
                >
                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="grid grid-cols-1 gap-6">
                            {/* Técnico Selection */}
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Seleccionar Técnico</label>
                                <select 
                                    className="w-full bg-slate-50 border border-border rounded-xl px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                    value={editingConfig.tecnico_id}
                                    onChange={(e) => setEditingConfig({...editingConfig, tecnico_id: e.target.value})}
                                    required
                                >
                                    <option value="">Seleccione un técnico...</option>
                                    {tecnicosList.map(t => (
                                        <option key={t.CodigoTecnico} value={t.CodigoTecnico}>{t.NombreCompleto} ({t.CodigoTecnico})</option>
                                    ))}
                                </select>
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
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Fecha Fin</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-50" />
                                        <input 
                                            type="date" 
                                            className="w-full bg-slate-50 border border-border rounded-2xl pl-11 pr-4 py-3 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                            value={editingConfig.fecha_fin}
                                            onChange={(e) => setEditingConfig({...editingConfig, fecha_fin: e.target.value})}
                                            required
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Importe Institucional (S/.)</label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                                        <input 
                                            type="number" 
                                            step="0.01"
                                            className="w-full bg-slate-50 border border-border rounded-2xl pl-11 pr-4 py-3 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                            value={editingConfig.importe}
                                            onChange={(e) => setEditingConfig({...editingConfig, importe: parseFloat(e.target.value)})}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Estado de Regla</label>
                                    <div className="flex p-1 bg-slate-100 rounded-2xl border border-border h-[52px]">
                                        <button 
                                            type="button"
                                            onClick={() => setEditingConfig({...editingConfig, activo: true})}
                                            className={cn(
                                                "flex-1 text-xs font-black rounded-xl transition-all",
                                                editingConfig.activo ? "bg-white text-emerald-600 shadow-sm border border-border" : "text-muted-foreground opacity-50"
                                            )}
                                        >
                                            ACTIVA
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setEditingConfig({...editingConfig, activo: false})}
                                            className={cn(
                                                "flex-1 text-xs font-black rounded-xl transition-all",
                                                !editingConfig.activo ? "bg-white text-red-600 shadow-sm border border-border" : "text-muted-foreground opacity-50"
                                            )}
                                        >
                                            INACTIVA
                                        </button>
                                    </div>
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
                                {editingConfig.Id ? 'Actualizar Regla' : 'Confirmar Asignación'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
