import { useState, useEffect } from 'react';
import { 
    X, Plus, Trash2, MapPin, Tag, DollarSign, AlertCircle, 
    ChevronDown, Save, Map, Globe, Search
} from 'lucide-react';
import { ApiClient } from '../../services/apiClient';
import { cn } from '../../utils/cn';
import { useDialog } from '../../context/DialogContext';

interface Exception {
    IdExcepcion?: string;
    Empresa: string;
    Nombre: string;
    Zonas_Incluidas: string[] | null;
    Zonas_Excluidas: string[] | null;
    Categorias: string[] | null;
    Servicios: string[] | null;
    Importe: number;
    Prioridad: number;
    Estado: string;
}

interface Props {
    cas: { ID_CAS: number; Nombre_CAS: string; RUC: string };
    isOpen: boolean;
    onClose: () => void;
}

export default function TarifarioExceptionsModal({ cas, isOpen, onClose }: Props) {
    const { alert } = useDialog();
    const [exceptions, setExceptions] = useState<Exception[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [availableCategories, setAvailableCategories] = useState<string[]>([]);
    const [availableDistritos, setAvailableDistritos] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetchExceptions();
            fetchCategories();
            fetchDistritos();
        }
    }, [isOpen, cas.ID_CAS]);

    const fetchExceptions = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.request(`/tarifarios/exceptions/${cas.ID_CAS}`);
            setExceptions(data.map((ex: any) => ({
                ...ex,
                Zonas_Incluidas: typeof ex.Zonas_Incluidas === 'string' ? JSON.parse(ex.Zonas_Incluidas) : ex.Zonas_Incluidas,
                Zonas_Excluidas: typeof ex.Zonas_Excluidas === 'string' ? JSON.parse(ex.Zonas_Excluidas) : ex.Zonas_Excluidas,
                Categorias: typeof ex.Categorias === 'string' ? JSON.parse(ex.Categorias) : ex.Categorias,
                Servicios: typeof ex.Servicios === 'string' ? JSON.parse(ex.Servicios) : ex.Servicios,
            })));
        } catch (err) {
            console.error("Error fetching exceptions:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchCategories = async () => {
        try {
            const data = await ApiClient.request('/materials/categories');
            setAvailableCategories(data);
        } catch (err) {
            console.error("Error fetching categories:", err);
        }
    };

    const fetchDistritos = async () => {
        try {
            const data = await ApiClient.request('/distritos');
            // Data is [{Ciudad: '...', Distrito: '...'}, ...]
            const zones = Array.from(new Set(data.flatMap((d: any) => [d.Ciudad, d.Distrito]))).sort() as string[];
            setAvailableDistritos(zones);
        } catch (err) {
            console.error("Error fetching distritos:", err);
        }
    };

    const handleAdd = () => {
        const newEx: Exception = {
            Empresa: cas.ID_CAS.toString(),
            Nombre: 'Nuevo Caso Especial',
            Zonas_Incluidas: [],
            Zonas_Excluidas: [],
            Categorias: [],
            Servicios: [],
            Importe: 0,
            Prioridad: 1,
            Estado: 'A'
        };
        setExceptions([newEx, ...exceptions]);
    };

    const handleSave = async (ex: Exception) => {
        setSaving(true);
        try {
            await ApiClient.request('/tarifarios/exceptions/save', {
                method: 'POST',
                body: JSON.stringify({
                    id: ex.IdExcepcion,
                    empresa: cas.ID_CAS,
                    nombre: ex.Nombre,
                    zonasIncluidas: ex.Zonas_Incluidas,
                    zonasExcluidas: ex.Zonas_Excluidas,
                    categorias: ex.Categorias,
                    servicios: ex.Servicios,
                    importe: ex.Importe,
                    prioridad: ex.Prioridad,
                    estado: ex.Estado
                })
            });
            alert({ title: "Guardado", message: "Regla actualizada correctamente.", type: 'success' });
            fetchExceptions();
        } catch (err) {
            alert({ message: "Error al guardar la regla." });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id?: string) => {
        if (!id) {
            setExceptions(exceptions.filter(e => e.IdExcepcion));
            return;
        }
        if (!confirm("¿Está seguro de eliminar esta regla?")) return;
        try {
            await ApiClient.request(`/tarifarios/exceptions/${id}`, { method: 'DELETE' });
            fetchExceptions();
        } catch (err) {
            alert({ message: "Error al eliminar la regla." });
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-card w-full max-w-5xl max-h-[90vh] rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-border/40 flex items-center justify-between bg-muted/5">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-amber-500/10 rounded-xl text-amber-600 border border-amber-500/10">
                            <AlertCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black tracking-tight">Casos Especiales / Excepciones</h2>
                            <p className="text-[10px] font-bold text-muted-foreground opacity-60 uppercase tracking-widest">{cas.Nombre_CAS}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handleAdd}
                            className="px-4 py-2 bg-foreground text-background rounded-lg font-bold text-[11px] flex items-center gap-2 transition-all hover:opacity-90 shadow-lg"
                        >
                            <Plus className="w-4 h-4" /> Agregar Regla
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-6">
                    {loading ? (
                        <div className="py-20 flex items-center justify-center">
                            <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                        </div>
                    ) : exceptions.length === 0 ? (
                        <div className="py-20 text-center flex flex-col items-center justify-center grayscale opacity-50">
                            <Map className="w-16 h-16 mb-4 text-muted-foreground" />
                            <p className="text-sm font-bold text-muted-foreground">No hay casos especiales configurados.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {exceptions.map((ex, idx) => (
                                <div key={ex.IdExcepcion || idx} className="bg-muted/10 rounded-xl border border-border/40 p-6 space-y-4 relative group">
                                    <div className="flex items-start justify-between gap-6">
                                        <div className="flex-1 space-y-4">
                                            <div className="flex items-center gap-4">
                                                <input 
                                                    type="text" 
                                                    value={ex.Nombre}
                                                    onChange={e => {
                                                        const newEx = [...exceptions];
                                                        newEx[idx].Nombre = e.target.value;
                                                        setExceptions(newEx);
                                                    }}
                                                    className="flex-1 bg-background border border-border/40 rounded-lg px-4 py-2 text-sm font-black outline-none focus:ring-2 ring-primary/20"
                                                    placeholder="Nombre de la regla..."
                                                />
                                                <div className="flex items-center gap-2 bg-background border border-border/40 rounded-lg px-3 py-2">
                                                    <DollarSign className="w-4 h-4 text-emerald-500" />
                                                    <input 
                                                        type="number" 
                                                        value={ex.Importe}
                                                        onChange={e => {
                                                            const newEx = [...exceptions];
                                                            newEx[idx].Importe = Number(e.target.value);
                                                            setExceptions(newEx);
                                                        }}
                                                        className="w-20 bg-transparent border-none outline-none font-bold text-sm text-right"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <ZoneSelector 
                                                    label="Zonas Excluidas (Ej: PIURA, LAMBAYEQUE)"
                                                    icon={Globe}
                                                    selected={ex.Zonas_Excluidas || []}
                                                    options={availableDistritos}
                                                    onChange={val => {
                                                        const newEx = [...exceptions];
                                                        newEx[idx].Zonas_Excluidas = val;
                                                        setExceptions(newEx);
                                                    }}
                                                />
                                                <ZoneSelector 
                                                    label="Zonas Incluidas (Ej: JAEN)"
                                                    icon={MapPin}
                                                    selected={ex.Zonas_Incluidas || []}
                                                    options={availableDistritos}
                                                    onChange={val => {
                                                        const newEx = [...exceptions];
                                                        newEx[idx].Zonas_Incluidas = val;
                                                        setExceptions(newEx);
                                                    }}
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest flex items-center gap-2">
                                                    <Tag className="w-3 h-3" /> Categorías de Producto
                                                </label>
                                                <div className="flex flex-wrap gap-2">
                                                    {availableCategories.map(cat => (
                                                        <button 
                                                            key={cat}
                                                            onClick={() => {
                                                                const newEx = [...exceptions];
                                                                const current = newEx[idx].Categorias || [];
                                                                if (current.includes(cat)) {
                                                                    newEx[idx].Categorias = current.filter(c => c !== cat);
                                                                } else {
                                                                    newEx[idx].Categorias = [...current, cat];
                                                                }
                                                                setExceptions(newEx);
                                                            }}
                                                            className={cn(
                                                                "px-3 py-1 rounded-full text-[9px] font-black uppercase transition-all border",
                                                                ex.Categorias?.includes(cat) 
                                                                    ? "bg-primary border-primary text-white" 
                                                                    : "bg-background border-border/40 text-muted-foreground hover:border-primary/40"
                                                            )}
                                                        >
                                                            {cat}
                                                        </button>
                                                    ))}
                                                    <button 
                                                        onClick={() => {
                                                            const newEx = [...exceptions];
                                                            newEx[idx].Categorias = [];
                                                            setExceptions(newEx);
                                                        }}
                                                        className="px-3 py-1 rounded-full text-[9px] font-black uppercase border border-dashed border-border/60 text-muted-foreground/60"
                                                    >
                                                        Limpiar / Todas
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-2 pt-1">
                                            <button 
                                                onClick={() => handleSave(ex)}
                                                disabled={saving}
                                                className="p-3 bg-emerald-600 text-white rounded-xl shadow-lg hover:bg-emerald-700 transition-colors"
                                                title="Guardar Regla"
                                            >
                                                <Save className="w-5 h-5" />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(ex.IdExcepcion)}
                                                className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                                                title="Eliminar Regla"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                            <div className="mt-4 flex flex-col items-center">
                                                <span className="text-[8px] font-black text-muted-foreground/40 uppercase mb-1">Prio</span>
                                                <input 
                                                    type="number" 
                                                    value={ex.Prioridad}
                                                    onChange={e => {
                                                        const newEx = [...exceptions];
                                                        newEx[idx].Prioridad = Number(e.target.value);
                                                        setExceptions(newEx);
                                                    }}
                                                    className="w-10 bg-muted rounded py-1 text-center font-bold text-xs outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-border/40 bg-muted/5 flex items-center justify-between">
                    <p className="text-[11px] font-bold text-muted-foreground/60 italic max-w-md">
                        * Las reglas de exclusión tienen prioridad sobre las de inclusión. Si no se define zona, aplica a todo el país.
                    </p>
                    <button 
                        onClick={onClose}
                        className="px-8 py-3 bg-muted rounded-xl font-black text-[12px] uppercase tracking-widest hover:bg-muted/80 transition-all"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

function ZoneSelector({ 
    label, 
    icon: Icon, 
    selected, 
    options, 
    onChange 
}: { 
    label: string, 
    icon: any, 
    selected: string[], 
    options: string[], 
    onChange: (val: string[]) => void 
}) {
    const [search, setSearch] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useState<HTMLDivElement | null>(null);

    const filtered = options.filter(opt => 
        opt.toLowerCase().includes(search.toLowerCase()) && !selected.includes(opt)
    ).slice(0, 15);

    return (
        <div className="space-y-2 relative group/selector">
            <label className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-widest flex items-center gap-2">
                <Icon className="w-3 h-3" /> {label}
            </label>
            <div className="flex flex-wrap gap-1.5 p-2 bg-background border border-border/40 rounded-lg min-h-[42px] focus-within:ring-2 ring-primary/10 transition-all">
                {selected.map(s => (
                    <span key={s} className="pl-2 pr-1 py-0.5 bg-primary/10 text-primary rounded-md text-[10px] font-black flex items-center gap-1 border border-primary/20 animate-in zoom-in-95">
                        {s}
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange(selected.filter(x => x !== s));
                            }}
                            className="p-0.5 hover:bg-primary/20 rounded-sm transition-colors"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </span>
                ))}
                <input 
                    type="text"
                    value={search}
                    onFocus={() => setIsOpen(true)}
                    onBlur={() => setTimeout(() => setIsOpen(false), 200)}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={selected.length === 0 ? "Seleccionar zona..." : "Agregar..."}
                    className="flex-1 min-w-[120px] bg-transparent outline-none text-[11px] font-bold placeholder:text-muted-foreground/40"
                />
            </div>
            
            {isOpen && (search || search === '') && (
                <div className="absolute z-[100] w-full mt-1 bg-card border border-border shadow-2xl rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
                        {filtered.length === 0 ? (
                            <div className="p-4 text-center">
                                <Search className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
                                <p className="text-[10px] font-bold text-muted-foreground italic">No se encontraron resultados</p>
                            </div>
                        ) : (
                            filtered.map(opt => (
                                <button
                                    key={opt}
                                    onMouseDown={(e) => {
                                        e.preventDefault(); // Evita el blur del input
                                        onChange([...selected, opt]);
                                        setSearch('');
                                    }}
                                    className="w-full text-left px-3 py-2 text-[11px] font-black hover:bg-primary/5 hover:text-primary rounded-lg transition-all flex items-center justify-between group/item"
                                >
                                    {opt}
                                    <Plus className="w-3 h-3 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
