import { useState, useEffect, useRef } from 'react';
import { 
    Search, Plus, Save, Trash2, History, DollarSign, Building2, 
    ChevronDown, Check, Target, AlertCircle, FileText, Activity
} from 'lucide-react';
import { ApiClient } from '../services/apiClient';
import { cn } from '../utils/cn';
import { useDialog } from '../context/DialogContext';

interface CAS {
    ID_CAS: number;
    Nombre_CAS: string;
    RUC: string;
}

interface Rate {
    ID_TARIFARIO?: string;
    Empresa: number;
    Categoria: string;
    Servicio: string;
    Importe: number;
    Nombre_CAS?: string;
    RUC?: string;
}

export default function TarifarioPage() {
    const { alert } = useDialog();
    const [casList, setCasList] = useState<CAS[]>([]);
    const [selectedCas, setSelectedCas] = useState<CAS | null>(null);
    const [rates, setRates] = useState<Rate[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [isEditing, setIsEditing] = useState(false);
    const [editRates, setEditRates] = useState<Rate[]>([]);

    useEffect(() => {
        const fetchCas = async () => {
            try {
                const data = await ApiClient.request('/cas');
                setCasList(data);
            } catch (err) {
                console.error("Error fetching CAS:", err);
            }
        };
        fetchCas();

        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchRates = async (cas: CAS) => {
        setLoading(true);
        try {
            // RUTA PLURALIZADA CORRECTA
            const data = await ApiClient.request(`/tarifarios/${cas.ID_CAS}`); 
            setRates(data);
            setEditRates(data);
        } catch (err) {
            console.error("Error fetching rates:", err);
            alert({ message: "No se pudieron cargar las tarifas del CAS seleccionado. Verifique la conexión." });
        } finally {
            setLoading(false);
        }
    };

    const handleSelectCas = (cas: CAS) => {
        setSelectedCas(cas);
        setIsDropdownOpen(false);
        setSearchQuery('');
        fetchRates(cas);
    };

    const handleAddRow = () => {
        if (!selectedCas) return;
        const newRate: Rate = {
            Empresa: selectedCas.ID_CAS,
            Categoria: '',
            Servicio: '',
            Importe: 0
        };
        setEditRates([newRate, ...editRates]);
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (!selectedCas) return;
        setSaving(true);
        try {
            await ApiClient.request('/tarifarios/batch', {
                method: 'POST',
                body: JSON.stringify({
                    casId: selectedCas.ID_CAS,
                    rates: editRates
                })
            });
            alert({ title: "¡Tarifario Guardado!", message: "Los precios se han actualizado correctamente.", type: 'success' });
            setIsEditing(false);
            fetchRates(selectedCas);
        } catch (err) {
            console.error("Error saving rates:", err);
            alert({ message: "Hubo un error al guardar los cambios en el servidor." });
        } finally {
            setSaving(false);
        }
    };

    const filteredCasList = casList.filter(cas => 
        cas.Nombre_CAS.toLowerCase().includes(searchQuery.toLowerCase()) || 
        cas.RUC.includes(searchQuery)
    );

    return (
        <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500 p-2">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter">Tarifario de Servicios</h1>
                    <p className="text-muted-foreground mt-1 text-sm font-bold uppercase tracking-widest opacity-50">Configuración dinámica de precios por centro de atención.</p>
                </div>
            </div>

            <div className="relative" ref={dropdownRef}>
                <div 
                    className={cn(
                        "bg-card rounded-[2.5rem] border border-border/80 p-2.5 shadow-2xl shadow-black/5 flex items-center gap-3 transition-all group hover:border-primary/40",
                        isDropdownOpen && "ring-4 ring-primary/5 border-primary/40"
                    )}
                >
                    <div className="p-4 bg-primary/10 rounded-3xl text-primary transition-transform group-hover:scale-105 shadow-inner">
                        <Building2 className="w-6 h-6" />
                    </div>
                    
                    <button 
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex-1 text-left px-3 py-2"
                    >
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 mb-1">Empresa en Configuración</p>
                        <p className={cn(
                            "text-xl font-black tracking-tight flex items-center gap-2",
                            !selectedCas && "text-muted-foreground/20 italic"
                        )}>
                            {selectedCas ? selectedCas.Nombre_CAS : "-- Seleccione un CAS para editar precios --"}
                            {selectedCas && <span className="text-xs font-bold text-muted-foreground/50 border-l border-border pl-3 ml-1">RUC {selectedCas.RUC}</span>}
                        </p>
                    </button>

                    <div className="p-4">
                        <ChevronDown className={cn("w-5 h-5 text-muted-foreground/30 transition-transform duration-500", isDropdownOpen && "rotate-180 text-primary")} />
                    </div>
                </div>

                {isDropdownOpen && (
                    <div className="absolute top-full left-0 mt-3 w-full bg-card/90 border border-border/50 rounded-[3rem] shadow-2xl shadow-black/30 z-[100] animate-in fade-in slide-in-from-top-4 duration-300 overflow-hidden backdrop-blur-3xl">
                        <div className="p-6 border-b border-border/40 bg-muted/20">
                            <div className="relative group">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground opacity-50 group-focus-within:text-primary transition-all group-focus-within:opacity-100" />
                                <input 
                                    autoFocus
                                    type="text" 
                                    placeholder="Buscar por sede o identificador..."
                                    className="w-full bg-background/50 border border-transparent rounded-[1.5rem] pl-14 pr-6 py-4 text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-all placeholder:opacity-40 tracking-tight"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="max-h-[380px] overflow-y-auto p-4 custom-scrollbar space-y-1.5 bg-muted/5">
                            {filteredCasList.map(cas => (
                                <button 
                                    key={cas.RUC}
                                    onClick={() => handleSelectCas(cas)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-7 py-4.5 rounded-[1.8rem] transition-all group",
                                        selectedCas?.RUC === cas.RUC 
                                            ? "bg-primary text-white shadow-xl shadow-primary/30 scale-[1.02]" 
                                            : "hover:bg-primary/5 text-foreground/80 hover:translate-x-2"
                                    )}
                                >
                                    <div className="flex items-center gap-5 text-left">
                                        <div className={cn("p-2.5 rounded-xl transition-colors", selectedCas?.RUC === cas.RUC ? "bg-white/10" : "bg-muted/50")}>
                                            <Target className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-base font-black tracking-tighter uppercase">{cas.Nombre_CAS}</span>
                                            <span className={cn("text-[9px] font-black tracking-[0.1em] opacity-60", selectedCas?.RUC === cas.RUC ? "text-white" : "text-muted-foreground text-primary/60")}>ID: {cas.ID_CAS} • RUC: {cas.RUC}</span>
                                        </div>
                                    </div>
                                    {selectedCas?.RUC === cas.RUC && (
                                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                            <Check className="w-4 h-4" />
                                        </div>
                                    )}
                                </button>
                            ))}
                            {filteredCasList.length === 0 && (
                                <div className="py-16 text-center">
                                    <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-5 border-2 border-dashed border-border/50">
                                        <Search className="w-10 h-10 text-muted-foreground opacity-10" />
                                    </div>
                                    <p className="text-xs font-black text-muted-foreground opacity-30 uppercase tracking-[0.3em]">Sin coincidencias</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 min-h-0 bg-card rounded-[3.5rem] border border-border/60 shadow-sm overflow-hidden flex flex-col relative">
                {!selectedCas ? (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                        <div className="w-32 h-32 bg-primary/[0.03] rounded-full flex items-center justify-center mb-10 border border-primary/5 relative">
                            <History className="w-14 h-14 text-primary opacity-20" />
                            <div className="absolute inset-0 bg-primary/10 rounded-full animate-pulse blur-2xl opacity-20" />
                        </div>
                        <h3 className="text-3xl font-black tracking-tight mb-4">Gestión de Tarifas CAS</h3>
                        <p className="text-muted-foreground max-w-sm font-bold opacity-50 leading-relaxed uppercase tracking-widest text-[11px]">Personalización de precios según la sede para facturación automática.</p>
                    </div>
                ) : (
                    <>
                        <div className="p-8 border-b border-border/40 flex items-center justify-between bg-muted/5">
                            <div className="flex items-center gap-6">
                                <div className="p-4 bg-emerald-500/10 rounded-3xl text-emerald-600 border border-emerald-500/10">
                                    <DollarSign className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">Precios Configurados</h3>
                                    <p className="text-2xl font-black tracking-tight">{rates.length} Items en lista</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {isEditing ? (
                                    <div className="flex items-center gap-3 animate-in zoom-in-95">
                                        <button 
                                            onClick={() => { setIsEditing(false); setEditRates(rates); }}
                                            className="px-6 py-3.5 bg-muted rounded-2xl font-black text-[10px] uppercase tracking-widest text-muted-foreground hover:bg-muted/80 transition-all"
                                        >
                                            Descartar
                                        </button>
                                        <button 
                                            onClick={handleSave}
                                            disabled={saving}
                                            className="px-8 py-3.5 bg-emerald-600 text-white rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-600/20 flex items-center gap-2"
                                        >
                                            {saving ? "Guardando..." : <><Save className="w-4 h-4" /> Guardar Tarifario</>}
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={handleAddRow}
                                        className="px-8 py-3.5 bg-foreground text-background rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest shadow-xl shadow-black/10 flex items-center gap-2 hover:translate-y-[-2px] transition-all"
                                    >
                                        <Plus className="w-4 h-4" /> Agregar Tarifa
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
                            {loading ? (
                                <div className="h-full flex items-center justify-center py-20">
                                    <Activity className="w-10 h-10 text-primary animate-spin opacity-20" />
                                </div>
                            ) : (
                                <table className="w-full text-left">
                                    <thead className="sticky top-0 bg-card z-10">
                                        <tr>
                                            <th className="px-6 py-4 bg-muted/30 rounded-l-2xl font-black text-[10px] uppercase tracking-widest text-muted-foreground">Categoría</th>
                                            <th className="px-6 py-4 bg-muted/30 font-black text-[10px] uppercase tracking-widest text-muted-foreground">Cód. Servicio</th>
                                            <th className="px-6 py-4 bg-muted/30 font-black text-[10px] uppercase tracking-widest text-muted-foreground text-right">Importe Unitario</th>
                                            <th className="px-6 py-4 bg-muted/30 rounded-r-2xl text-right"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/30">
                                        {editRates.map((rate, idx) => (
                                            <tr key={idx} className="group hover:bg-muted/10 transition-all border-transparent border-l-4 hover:border-primary">
                                                <td className="px-6 py-6">
                                                    <input 
                                                        type="text"
                                                        value={rate.Categoria}
                                                        onChange={(e) => {
                                                            const newRates = [...editRates];
                                                            newRates[idx].Categoria = e.target.value.toUpperCase();
                                                            setEditRates(newRates);
                                                            setIsEditing(true);
                                                        }}
                                                        placeholder="LAVADORA, TV, ETC..."
                                                        className="bg-transparent border-none outline-none font-black text-sm tracking-tight w-full placeholder:opacity-20"
                                                    />
                                                </td>
                                                <td className="px-6 py-6 font-black text-xs text-primary">
                                                    <input 
                                                        type="text"
                                                        value={rate.Servicio}
                                                        onChange={(e) => {
                                                            const newRates = [...editRates];
                                                            newRates[idx].Servicio = e.target.value.toUpperCase();
                                                            setEditRates(newRates);
                                                            setIsEditing(true);
                                                        }}
                                                        className="bg-transparent border-none outline-none w-full font-bold uppercase"
                                                    />
                                                </td>
                                                <td className="px-6 py-6 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <span className="text-xs font-black text-muted-foreground opacity-40">S/ </span>
                                                        <input 
                                                            type="number"
                                                            value={rate.Importe}
                                                            onChange={(e) => {
                                                                const newRates = [...editRates];
                                                                newRates[idx].Importe = parseFloat(e.target.value) || 0;
                                                                setEditRates(newRates);
                                                                setIsEditing(true);
                                                            }}
                                                            className="bg-muted/30 px-4 py-2 rounded-xl border border-transparent focus:border-emerald-500/30 text-right font-black text-base tracking-tighter w-32 outline-none transition-all"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-6 py-6 text-right opacity-0 group-hover:opacity-100 transition-all">
                                                    <button 
                                                        onClick={() => {
                                                            const newRates = editRates.filter((_, i) => i !== idx);
                                                            setEditRates(newRates);
                                                            setIsEditing(true);
                                                        }}
                                                        className="p-3 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-2xl transition-all"
                                                    >
                                                        <Trash2 className="w-5 h-5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {editRates.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="py-20 text-center">
                                                    <div className="p-8 bg-amber-500/5 rounded-3xl border border-dashed border-amber-200/30 inline-block max-w-sm">
                                                        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-4 opacity-40" />
                                                        <p className="text-xs font-black uppercase tracking-widest text-amber-900/60 leading-relaxed">Este CAS no tiene tarifas configuradas.</p>
                                                        <button onClick={handleAddRow} className="mt-4 text-[10px] font-black text-primary underline">Agregar Primera Tarifa</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        
                        {!isEditing && (
                            <div className="p-8 border-t border-border/40 bg-muted/5 flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase text-muted-foreground opacity-30 flex items-center gap-2 tracking-[0.2em]">
                                    <FileText className="w-4 h-4" /> Auditoría de precios activa
                                </span>
                                <div className="text-right">
                                    <p className="text-[9px] font-black uppercase text-muted-foreground opacity-40 mb-1">Última actualización</p>
                                    <p className="text-xs font-bold">{new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric'})}</p>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
