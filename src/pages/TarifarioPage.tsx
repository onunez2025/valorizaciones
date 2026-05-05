import { useState, useEffect, useRef } from 'react';
import { 
    Search, Plus, Save, Trash2, History, DollarSign, Building2, 
    ChevronDown, Check, Target, AlertCircle, FileText, Activity
} from 'lucide-react';
import { ApiClient } from '../services/apiClient';
import { cn } from '../utils/cn';
import { toTitleCase } from '../utils/formatters';
import { useDialog } from '../context/DialogContext';
import TarifarioExceptionsModal from '../components/tarifario/TarifarioExceptionsModal';

interface CAS {
    ID_CAS: number;
    Nombre_CAS: string;
    RUC: string;
}

interface Rate {
    ID_TARIFARIO?: string;
    Id?: string; // Compatible con el backend
    Empresa: number;
    Categoria: string;
    Servicio: string;
    ServicioCode?: string;
    ServicioNombre?: string;
    Importe: number | string;
    Fecha_inicio?: string;
    Fecha_fin?: string;
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
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

    const [isExceptionsModalOpen, setIsExceptionsModalOpen] = useState(false);

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

    const toggleCategory = (category: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(category)) {
            newExpanded.delete(category);
        } else {
            newExpanded.add(category);
        }
        setExpandedCategories(newExpanded);
    };

    const fetchRates = async (cas: CAS) => {
        setLoading(true);
        try {
            // RUTA PLURALIZADA CORRECTA
            const data = await ApiClient.request(`/tarifarios/${cas.ID_CAS}`); 
            // Mapeamos para que 'Servicio' contenga el código y ID_TARIFARIO el id correcto
            const mappedData = data.map((r: any) => ({
                ...r,
                Servicio: r.ServicioCode || r.Servicio,
                ID_TARIFARIO: r.Id // Backend devuelve Id en la query
            }));
            setRates(mappedData);
            setEditRates(mappedData);
            
            // Expandir todas al cargar por defecto si el usuario lo prefiere, o dejarlas contraídas.
            // Por el requerimiento "ver todas las categorías primero", las dejaremos contraídas.
        } catch (err: any) {
            if (err.message === 'AUTH_EXPIRED') return;
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
            const ratesToSave = editRates.map(r => ({
                ...r,
                Importe: Number(r.Importe) || 0
            }));

            await ApiClient.request('/tarifarios/batch', {
                method: 'POST',
                body: JSON.stringify({
                    casId: selectedCas.ID_CAS,
                    rates: ratesToSave
                })
            });
            alert({ title: "¡Tarifario Guardado!", message: "Los precios se han actualizado correctamente.", type: 'success' });
            setIsEditing(false);
            fetchRates(selectedCas);
        } catch (err: any) {
            if (err.message === 'AUTH_EXPIRED') return;
            console.error("Error saving rates:", err);
            alert({ message: "Hubo un error al guardar los cambios en el servidor." });
        } finally {
            setSaving(false);
        }
    };

    // Agrupar por categoría
    const groupedRates = editRates.reduce((acc, rate) => {
        const cat = rate.Categoria || 'SIN CATEGORÍA';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(rate);
        return acc;
    }, {} as Record<string, Rate[]>);

    const categories = Object.keys(groupedRates).sort();

    const filteredCasList = casList.filter(cas => 
        cas.Nombre_CAS.toLowerCase().includes(searchQuery.toLowerCase()) || 
        cas.RUC.includes(searchQuery)
    );

    return (
        <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500 p-1">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Tarifario de Servicios</h1>
                    <p className="text-muted-foreground text-[11px] font-medium opacity-60">Configuración dinámica de precios por centro de atención.</p>
                </div>
            </div>

            <div className="relative" ref={dropdownRef}>
                <div 
                    className={cn(
                        "bg-card rounded-xl border border-border p-0.5 shadow-sm flex items-center gap-2 transition-all group hover:border-primary/40",
                        isDropdownOpen && "ring-2 ring-primary/5 border-primary/40"
                    )}
                >
                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary transition-transform group-hover:scale-105">
                        <Building2 className="w-5 h-5" />
                    </div>
                    
                    <button 
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex-1 text-left px-3 py-1"
                    >
                        <p className="text-[9px] font-bold text-muted-foreground/60 mb-0">Empresa en configuración</p>
                        <p className={cn(
                            "text-base font-bold tracking-tight flex items-center gap-2",
                            !selectedCas && "text-muted-foreground/30 italic"
                        )}>
                            {selectedCas ? toTitleCase(selectedCas.Nombre_CAS) : "-- Seleccione un CAS para editar precios --"}
                            {selectedCas && <span className="text-[11px] font-bold text-muted-foreground opacity-40">(RUC: {selectedCas.RUC})</span>}
                        </p>
                    </button>

                    <div className="p-3">
                        <ChevronDown className={cn("w-5 h-5 text-muted-foreground/20 transition-transform duration-500", isDropdownOpen && "rotate-180 text-primary")} />
                    </div>
                </div>

                {isDropdownOpen && (
                    <div className="absolute top-full left-0 mt-3 w-full bg-card border border-border rounded-xl shadow-xl z-[100] animate-in fade-in slide-in-from-top-4 duration-300 overflow-hidden">
                        <div className="p-4 border-b border-border/40">
                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <input 
                                    autoFocus
                                    type="text" 
                                    placeholder="Buscar por sede o identificador..."
                                    className="w-full bg-muted/30 border border-transparent rounded-lg pl-11 pr-5 py-3 text-sm font-bold focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-all"
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
                                        "w-full flex items-center justify-between px-5 py-3.5 rounded-lg transition-all group",
                                        selectedCas?.RUC === cas.RUC 
                                            ? "bg-primary text-white shadow-lg" 
                                            : "hover:bg-primary/5 text-foreground/80 hover:translate-x-1"
                                    )}
                                >
                                    <div className="flex items-center gap-4 text-left">
                                        <div className={cn("p-2 rounded-lg transition-colors", selectedCas?.RUC === cas.RUC ? "bg-white/10" : "bg-muted/50")}>
                                            <Target className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[13px] font-bold tracking-tight">{toTitleCase(cas.Nombre_CAS)}</span>
                                            <span className={cn("text-[9px] font-bold opacity-60", selectedCas?.RUC === cas.RUC ? "text-white" : "text-muted-foreground")}>RUC: {cas.RUC}</span>
                                        </div>
                                    </div>
                                    {selectedCas?.RUC === cas.RUC && (
                                        <Check className="w-3.5 h-3.5" />
                                    )}
                                </button>
                            ))}
                            {filteredCasList.length === 0 && (
                                <div className="py-16 text-center">
                                    <div className="w-20 h-20 bg-muted/30 rounded-full flex items-center justify-center mx-auto mb-5 border-2 border-dashed border-border/50">
                                        <Search className="w-10 h-10 text-muted-foreground opacity-10" />
                                    </div>
                                    <p className="text-xs font-black text-muted-foreground opacity-30">Sin coincidencias</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 min-h-0 bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col relative">
                {!selectedCas ? (
                    <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                        <div className="w-32 h-32 bg-primary/[0.03] rounded-full flex items-center justify-center mb-10 border border-primary/5 relative">
                            <History className="w-14 h-14 text-primary opacity-20" />
                            <div className="absolute inset-0 bg-primary/10 rounded-full animate-pulse blur-2xl opacity-20" />
                        </div>
                        <h3 className="text-3xl font-black tracking-tight mb-4">Gestión de Tarifas CAS</h3>
                        <p className="text-muted-foreground max-w-sm font-bold opacity-50 leading-relaxed text-[11px]">Personalización de precios según la sede para facturación automática.</p>
                    </div>
                ) : (
                    <>
                        <div className="p-6 border-b border-border/40 flex items-center justify-between bg-muted/5">
                            <div className="flex items-center gap-5">
                                <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-600 border border-emerald-500/10">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-[9px] font-bold text-muted-foreground/60 mb-0.5">Precios configurados</h3>
                                    <p className="text-xl font-bold tracking-tight">{rates.length} Items en lista</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {isEditing ? (
                                    <div className="flex items-center gap-3 animate-in zoom-in-95">
                                        <button 
                                            onClick={() => { setIsEditing(false); setEditRates(rates); }}
                                            className="px-5 py-2.5 bg-muted rounded-lg font-bold text-[10px] text-muted-foreground hover:bg-muted/80 transition-all"
                                        >
                                            Descartar
                                        </button>
                                        <button 
                                            onClick={handleSave}
                                            disabled={saving}
                                            className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-[10px] shadow-lg flex items-center gap-2"
                                        >
                                            {saving ? "Guardando..." : <><Save className="w-4 h-4" /> Guardar tarifario</>}
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={handleAddRow}
                                        className="h-10 px-6 bg-foreground text-background rounded-lg font-bold text-[10px] shadow-lg flex items-center gap-2 transition-all hover:opacity-90 active:scale-95"
                                    >
                                        <Plus className="w-3.5 h-3.5" /> Agregar tarifa
                                    </button>
                                )}
                                <button 
                                    onClick={() => setIsExceptionsModalOpen(true)}
                                    className="h-10 px-6 border border-amber-500/20 bg-amber-500/5 text-amber-600 rounded-lg font-bold text-[10px] shadow-sm flex items-center gap-2 transition-all hover:bg-amber-500/10 active:scale-95"
                                >
                                    <AlertCircle className="w-3.5 h-3.5" /> Casos Especiales
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
                            {loading ? (
                                <div className="h-full flex items-center justify-center py-20">
                                    <Activity className="w-10 h-10 text-primary animate-spin opacity-20" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                     {categories.map(category => {
                                         const isExpanded = expandedCategories.has(category);
                                         return (
                                             <div key={category} className="bg-muted/5 rounded-xl border border-border/40 overflow-hidden transition-all duration-300">
                                                 <button 
                                                     onClick={() => toggleCategory(category)}
                                                     className={cn(
                                                         "w-full px-6 py-4 flex items-center justify-between transition-colors",
                                                         isExpanded ? "bg-muted/20 border-b border-border/40" : "hover:bg-muted/10"
                                                     )}
                                                 >
                                                     <div className="flex items-center gap-4">
                                                         <div className={cn(
                                                             "w-2 h-2 rounded-full transition-all duration-500",
                                                             isExpanded ? "bg-primary scale-125" : "bg-muted-foreground/30"
                                                         )} />
                                                         <h4 className="text-[12px] font-black uppercase tracking-[0.2em] text-foreground/80">{category}</h4>
                                                     </div>
                                                     <div className="flex items-center gap-6">
                                                         <span className="text-[10px] font-bold text-muted-foreground opacity-40 uppercase tracking-widest">{groupedRates[category].length} Servicios</span>
                                                         <ChevronDown className={cn("w-4 h-4 text-muted-foreground/30 transition-transform duration-500", isExpanded && "rotate-180 text-primary")} />
                                                     </div>
                                                 </button>

                                                 {isExpanded && (
                                                     <div className="animate-in slide-in-from-top-2 duration-300">
                                                          <table className="w-full text-left">
                                                             <thead>
                                                                 <tr className="border-b border-border/20">
                                                                     <th className="px-6 py-3 font-bold text-[9px] uppercase tracking-widest text-muted-foreground/60 w-1/3">Servicio / Descripción</th>
                                                                     <th className="px-6 py-3 font-bold text-[9px] uppercase tracking-widest text-muted-foreground/60 text-center">Vigencia (Inicio - Fin)</th>
                                                                     <th className="px-6 py-3 font-bold text-[9px] uppercase tracking-widest text-muted-foreground/60 text-right">Importe Unitario</th>
                                                                     <th className="px-6 py-3 text-right"></th>
                                                                 </tr>
                                                             </thead>
                                                             <tbody className="divide-y divide-border/20">
                                                                 {groupedRates[category].map((rate, idx) => {
                                                                     const globalIdx = editRates.findIndex(r => r === rate);
                                                                     return (
                                                                         <tr key={`${category}-${idx}`} className="group hover:bg-primary/[0.02] transition-colors">
                                                                             <td className="px-6 py-4">
                                                                                 <div className="flex flex-col gap-1.5">
                                                                                     <div className="flex items-center gap-3">
                                                                                         <input 
                                                                                             type="text"
                                                                                             value={rate.Servicio}
                                                                                             onChange={(e) => {
                                                                                                 const newRates = [...editRates];
                                                                                                 newRates[globalIdx] = { ...newRates[globalIdx], Servicio: e.target.value.toUpperCase() };
                                                                                                 setEditRates(newRates);
                                                                                                 setIsEditing(true);
                                                                                             }}
                                                                                             placeholder="CÓDIGO"
                                                                                             className="bg-transparent border-none outline-none font-bold text-[13px] tracking-tight uppercase placeholder:opacity-20 w-24 shrink-0 focus:ring-1 focus:ring-primary/20 rounded"
                                                                                         />
                                                                                         <div className="h-4 w-[1px] bg-border/40" />
                                                                                         <span className="text-[11px] font-bold text-foreground/80 truncate">
                                                                                             {rate.ServicioNombre || (rate.Servicio ? "DESCRIPCIÓN NO DISPONIBLE" : "NUEVO SERVICIO")}
                                                                                         </span>
                                                                                     </div>
                                                                                     <div className="flex items-center gap-2">
                                                                                         <span className="text-[8px] font-black uppercase text-muted-foreground/30 tracking-widest">Cat:</span>
                                                                                         <input 
                                                                                             type="text"
                                                                                             value={rate.Categoria}
                                                                                             onChange={(e) => {
                                                                                                 const newRates = [...editRates];
                                                                                                 newRates[globalIdx] = { ...newRates[globalIdx], Categoria: e.target.value.toUpperCase() };
                                                                                                 setEditRates(newRates);
                                                                                                 setIsEditing(true);
                                                                                             }}
                                                                                             className="text-[9px] bg-muted/30 px-2 py-0.5 rounded border border-transparent focus:border-primary/20 outline-none w-auto font-black uppercase text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                                         />
                                                                                     </div>
                                                                                 </div>
                                                                             </td>
                                                                             <td className="px-6 py-4">
                                                                                 <div className="flex items-center justify-center gap-2">
                                                                                     <input 
                                                                                         type="date"
                                                                                         value={rate.Fecha_inicio ? rate.Fecha_inicio.split('T')[0] : ''}
                                                                                         onChange={(e) => {
                                                                                             const newRates = [...editRates];
                                                                                             newRates[globalIdx] = { ...newRates[globalIdx], Fecha_inicio: e.target.value };
                                                                                             setEditRates(newRates);
                                                                                             setIsEditing(true);
                                                                                         }}
                                                                                         className="bg-muted/30 px-2 py-1.5 rounded border border-transparent focus:border-primary/20 text-[10px] font-bold outline-none"
                                                                                     />
                                                                                     <span className="text-muted-foreground/30 text-[10px]">—</span>
                                                                                     <input 
                                                                                         type="date"
                                                                                         value={rate.Fecha_fin ? rate.Fecha_fin.split('T')[0] : ''}
                                                                                         onChange={(e) => {
                                                                                             const newRates = [...editRates];
                                                                                             newRates[globalIdx] = { ...newRates[globalIdx], Fecha_fin: e.target.value };
                                                                                             setEditRates(newRates);
                                                                                             setIsEditing(true);
                                                                                         }}
                                                                                         className="bg-muted/30 px-2 py-1.5 rounded border border-transparent focus:border-primary/20 text-[10px] font-bold outline-none"
                                                                                     />
                                                                                 </div>
                                                                             </td>
                                                                             <td className="px-6 py-4 text-right">
                                                                                 <div className="flex items-center justify-end gap-2">
                                                                                     <span className="text-[11px] font-bold text-primary/40">S/ </span>
                                                                                     <input 
                                                                                         type="number"
                                                                                         value={rate.Importe}
                                                                                         onChange={(e) => {
                                                                                             const newRates = [...editRates];
                                                                                             newRates[globalIdx] = { ...newRates[globalIdx], Importe: e.target.value };
                                                                                             setEditRates(newRates);
                                                                                             setIsEditing(true);
                                                                                         }}
                                                                                         className="bg-primary/5 px-3 py-1.5 rounded-lg border border-transparent focus:border-primary/20 text-right font-bold text-[13px] tracking-tight w-24 outline-none transition-all group-hover:bg-primary/10"
                                                                                     />
                                                                                 </div>
                                                                             </td>
                                                                             <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-all">
                                                                                 <button 
                                                                                     onClick={() => {
                                                                                         const newRates = editRates.filter((_, i) => i !== globalIdx);
                                                                                         setEditRates(newRates);
                                                                                         setIsEditing(true);
                                                                                     }}
                                                                                     className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all"
                                                                                 >
                                                                                     <Trash2 className="w-4 h-4" />
                                                                                 </button>
                                                                             </td>
                                                                         </tr>
                                                                     );
                                                                 })}
                                                             </tbody>
                                                         </table>
                                                     </div>
                                                 )}
                                             </div>
                                         );
                                     })}

                                    {editRates.length === 0 && (
                                        <div className="py-20 text-center">
                                            <div className="p-8 bg-amber-500/5 rounded-lg border border-dashed border-amber-200/30 inline-block max-w-sm">
                                                <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-4 opacity-40" />
                                                <p className="text-xs font-black uppercase tracking-widest text-amber-900/60 leading-relaxed">Este CAS no tiene tarifas configuradas.</p>
                                                <button onClick={handleAddRow} className="mt-4 text-[10px] font-black text-primary underline">Agregar Primera Tarifa</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        {!isEditing && (
                            <div className="p-8 border-t border-border/40 bg-muted/5 flex items-center justify-between">
                                <span className="text-[10px] font-black text-muted-foreground opacity-30 flex items-center gap-2">
                                    <FileText className="w-4 h-4" /> Auditoría de precios activa
                                </span>
                                <div className="text-right">
                                    <p className="text-[9px] font-black text-muted-foreground opacity-40 mb-1">Última actualización</p>
                                    <p className="text-xs font-bold">{new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric'})}</p>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {selectedCas && (
                <TarifarioExceptionsModal 
                    cas={selectedCas}
                    isOpen={isExceptionsModalOpen}
                    onClose={() => setIsExceptionsModalOpen(false)}
                />
            )}
        </div>
    );
}

