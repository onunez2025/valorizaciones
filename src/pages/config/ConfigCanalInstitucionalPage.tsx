import { useState, useEffect } from 'react';
import { ApiClient } from '../../services/apiClient';
import { 
    Users, Plus, Edit2, Trash2, Search, 
    Calendar, DollarSign, Activity,
    Briefcase, Tag, AlertCircle, Hash
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { useDialog } from '../../context/DialogContext';
import { cn } from '../../utils/cn';
import { format } from 'date-fns';

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

export default function ConfigCanalInstitucionalPage() {
    const [configs, setConfigs] = useState<ConfigInstitucional[]>([]);
    const [creators, setCreators] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingConfig, setEditingConfig] = useState<any>(null);
    const { alert, confirm } = useDialog();

    useEffect(() => {
        fetchData();
        fetchCreators();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.request('/config-canal-institucional');
            setConfigs(data);
        } catch (error: any) {
            alert({ message: "Error al cargar la configuración institucional." });
        } finally {
            setLoading(false);
        }
    };

    const fetchCreators = async () => {
        try {
            const data = await ApiClient.request('/c4c-creators');
            setCreators(data);
        } catch (error) {
            console.error("No se pudieron cargar los creadores.");
        }
    };

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
            } catch (error: any) {
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
        } catch (error: any) {
            alert({ message: "Error al guardar la configuración." });
        }
    };

    const filteredConfigs = configs.filter(c => 
        c.Usuario_Creador.toLowerCase().includes(search.toLowerCase()) || 
        (c.Keywords && c.Keywords.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="flex flex-col h-full gap-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-3">
                        <Briefcase className="w-8 h-8 text-primary" />
                        Canal Institucional (OData)
                    </h1>
                    <p className="text-muted-foreground text-sm font-bold opacity-60 italic">
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
                    className="bg-primary text-white h-11 px-6 rounded-2xl font-black text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Nueva Regla
                </button>
            </div>

            {/* Content Table */}
            <div className="flex-1 bg-card border border-border rounded-3xl overflow-hidden shadow-sm flex flex-col min-h-0 bg-white">
                <div className="p-4 border-b border-border bg-slate-50/50 flex items-center gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input 
                            type="text" 
                            placeholder="Buscar por usuario o palabras clave..." 
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
                            <p className="text-sm font-black italic">Consultando reglas institucionales...</p>
                        </div>
                    ) : filteredConfigs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-30">
                            <AlertCircle className="w-16 h-16 mb-6" />
                            <h3 className="text-lg font-black">No hay reglas configuradas</h3>
                            <p className="text-xs font-bold mt-2 max-w-xs">Configura un usuario de C4C para aplicar tarifas institucionales.</p>
                        </div>
                    ) : (
                        <table className="w-full border-separate border-spacing-0">
                            <thead className="bg-slate-50 sticky top-0 z-10">
                                <tr className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">
                                    <th className="px-6 py-4 text-left">Usuario Creador (C4C)</th>
                                    <th className="px-6 py-4 text-left">Criterios de Texto</th>
                                    <th className="px-6 py-4 text-center">Importe Único</th>
                                    <th className="px-6 py-4 text-center">Vigencia</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {filteredConfigs.map(c => (
                                    <tr key={c.Id} className="hover:bg-primary/[0.01] transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                    <Users className="w-4 h-4" />
                                                </div>
                                                <span className="text-sm font-black text-foreground">{c.Usuario_Creador}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "px-2 py-0.5 rounded text-[9px] font-black tracking-tighter",
                                                        c.Validacion_Tipo === 'CONTIENE' ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"
                                                    )}>
                                                        {c.Validacion_Tipo}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-muted-foreground truncate max-w-[200px]">
                                                        {c.Keywords || 'Cualquier asunto'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="text-sm font-black text-emerald-600">S/. {c.Importe.toFixed(2)}</span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="text-[10px] font-black whitespace-nowrap">
                                                {format(new Date(c.Fecha_Inicio), 'dd/MM/yy')} - {format(new Date(c.Fecha_Fin), 'dd/MM/yy')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                <button 
                                                    onClick={() => {
                                                        setEditingConfig({
                                                            ...c,
                                                            fecha_inicio: format(new Date(c.Fecha_Inicio), 'yyyy-MM-dd'),
                                                            fecha_fin: format(new Date(c.Fecha_Fin), 'yyyy-MM-dd')
                                                        });
                                                        setIsModalOpen(true);
                                                    }}
                                                    className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(c.Id)}
                                                    className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all"
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
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Usuario Creador del Ticket (Nombre exacto en C4C)</label>
                            <div className="relative">
                                <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-50" />
                                <input 
                                    type="text" 
                                    list="creators-list"
                                    className="w-full bg-slate-50 border border-border rounded-2xl pl-11 pr-4 py-3 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
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
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Fecha Inicio</label>
                            <input 
                                type="date" 
                                className="w-full bg-slate-50 border border-border rounded-2xl px-4 py-3 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                value={editingConfig?.fecha_inicio || ''}
                                onChange={(e) => setEditingConfig({...editingConfig, fecha_inicio: e.target.value})}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Fecha Fin</label>
                            <input 
                                type="date" 
                                className="w-full bg-slate-50 border border-border rounded-2xl px-4 py-3 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                value={editingConfig?.fecha_fin || ''}
                                onChange={(e) => setEditingConfig({...editingConfig, fecha_fin: e.target.value})}
                                required
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Importe Institucional (S/.)</label>
                            <div className="relative">
                                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                                <input 
                                    type="number" 
                                    step="0.01"
                                    className="w-full bg-slate-50 border border-border rounded-2xl pl-11 pr-4 py-3 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                    value={editingConfig?.importe || 0}
                                    onChange={(e) => setEditingConfig({...editingConfig, importe: parseFloat(e.target.value)})}
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Tipo de Validación</label>
                            <select 
                                className="w-full bg-slate-50 border border-border rounded-2xl px-4 py-3 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                value={editingConfig?.validacion_tipo || 'CONTIENE'}
                                onChange={(e) => setEditingConfig({...editingConfig, validacion_tipo: e.target.value})}
                            >
                                <option value="CONTIENE">Asunto CONTIENE palabras clave</option>
                                <option value="NO_CONTIENE">Asunto NO CONTIENE palabras clave</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-2 md:col-span-2">
                            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Palabras Clave (Separadas por comas)</label>
                            <div className="relative">
                                <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary opacity-50" />
                                <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-border rounded-2xl pl-11 pr-4 py-3 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                    placeholder="Ej: Lider, Sodimac, Proyecto..."
                                    value={editingConfig?.keywords || ''}
                                    onChange={(e) => setEditingConfig({...editingConfig, keywords: e.target.value})}
                                />
                            </div>
                            <p className="text-[9px] font-bold text-muted-foreground italic ml-1">* El sistema buscará estas palabras en el asunto del ticket en C4C.</p>
                        </div>
                    </div>

                    <div className="pt-6 flex gap-4">
                        <button 
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1 py-4 text-sm font-bold text-muted-foreground hover:bg-slate-50 rounded-2xl transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            className="flex-[2] py-4 bg-primary text-white text-sm font-black rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.01] transition-all"
                        >
                            Confirmar Configuración
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
