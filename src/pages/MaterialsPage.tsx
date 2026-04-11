import { useState, useEffect } from 'react';
import { ApiClient } from '../services/apiClient';
import { 
    Package, Search, Filter, Plus, Edit2, 
    Trash2, ExternalLink, Box, Tag, Activity,
    ChevronRight, CheckCircle2, AlertCircle
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { useDialog } from '../context/DialogContext';
import { toTitleCase } from '../utils/formatters';
import { cn } from '../utils/cn';
import type { Material } from '../types';

export default function MaterialsPage() {
    const [materials, setMaterials] = useState<Material[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todas');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
    const [isManualCategory, setIsManualCategory] = useState(false);
    const { alert, confirm } = useDialog();

    useEffect(() => {
        fetchMaterials();
    }, []);

    const fetchMaterials = async () => {
        setLoading(true);
        try {
            const data = await ApiClient.request('/materials');
            setMaterials(data);
        } catch (error) {
            console.error("Error fetching materials:", error);
            alert({ message: "No se pudo cargar el maestro de materiales." });
        } finally {
            setLoading(false);
        }
    };

    const categories = ['Todas', ...Array.from(new Set(materials.map(m => m.Categoria))).sort()];

    const filteredMaterials = materials.filter(m => {
        const matchesSearch = 
            m.Nombre?.toLowerCase().includes(search.toLowerCase()) || 
            m.ID_Externo?.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = selectedCategory === 'Todas' || m.Categoria === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const handleSaveMaterial = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingMaterial) return;

        try {
            await ApiClient.request('/materials', {
                method: 'POST',
                body: JSON.stringify({
                    idExterno: editingMaterial.ID_Externo,
                    nombre: editingMaterial.Nombre,
                    categoria: editingMaterial.Categoria,
                    sector: editingMaterial.Sector
                })
            });
            alert({ title: "¡Éxito!", message: "Material actualizado correctamente.", type: 'success' });
            setIsEditModalOpen(false);
            fetchMaterials();
        } catch (error) {
            alert({ message: "No se pudo actualizar el material." });
        }
    };

    return (
        <div className="flex flex-col h-full gap-5 animate-in fade-in duration-500 p-1">
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-3">
                        <Box className="w-8 h-8 text-primary" />
                        Maestro de Materiales
                    </h1>
                    <p className="text-muted-foreground text-sm font-bold opacity-60">Gestión de catálogo y categorías para tarifario.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-primary/5 px-4 py-2 rounded-xl border border-primary/10 flex items-center gap-3">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-primary opacity-60 leading-tight">Total Productos</span>
                            <span className="text-xl font-black tracking-tighter text-primary">{materials.length}</span>
                        </div>
                        <Package className="w-6 h-6 text-primary opacity-40" />
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-card rounded-2xl border border-border p-3 shadow-sm flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[300px] relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input 
                        type="text" 
                        placeholder="Buscar por nombre o código externo..." 
                        className="w-full bg-muted/30 border border-transparent rounded-xl pl-11 pr-4 py-3 text-sm font-bold focus:bg-background focus:border-primary/20 outline-none transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 bg-muted/20 p-1 rounded-xl border border-border/30">
                    <Filter className="w-4 h-4 ml-3 text-muted-foreground" />
                    <select 
                        className="bg-transparent border-none text-sm font-bold px-3 py-2 outline-none cursor-pointer"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
                <button 
                    onClick={() => { 
                        setEditingMaterial({ ID_Material: '', ID_Externo: '', Nombre: '', Categoria: '', Estado: 'Activo', Sector: 'GAC' }); 
                        setIsManualCategory(false);
                        setIsEditModalOpen(true); 
                    }}
                    className="bg-primary text-white h-11 px-6 rounded-xl font-black text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> Nuevo Producto
                </button>
            </div>

            {/* Table */}
            <div className="flex-1 bg-card border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
                <div className="flex-1 overflow-auto custom-scrollbar">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center gap-4 opacity-40">
                            <Activity className="w-10 h-10 animate-spin text-primary" />
                            <p className="text-sm font-black">Cargando maestro...</p>
                        </div>
                    ) : filteredMaterials.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-30">
                            <Package className="w-16 h-16 mb-6" />
                            <h3 className="text-lg font-black">No se encontraron productos</h3>
                            <p className="text-xs font-bold mt-2">Pruebe ajustando los filtros de búsqueda.</p>
                        </div>
                    ) : (
                        <table className="w-full border-separate border-spacing-0">
                            <thead className="bg-muted/30 sticky top-0 z-10 border-b border-border">
                                <tr className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">
                                    <th className="px-6 py-4 text-left">Código Externo</th>
                                    <th className="px-6 py-4 text-left">Nombre del Producto</th>
                                    <th className="px-6 py-4 text-left">Categoría</th>
                                    <th className="px-6 py-4 text-center">Estado</th>
                                    <th className="px-6 py-4 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10">
                                {filteredMaterials.map(m => (
                                    <tr key={m.ID_Material} className="hover:bg-primary/[0.02] transition-colors group">
                                        <td className="px-6 py-4 font-black text-primary text-sm tracking-tighter">
                                            {m.ID_Externo}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-bold text-foreground text-sm block max-w-[400px] truncate" title={m.Nombre}>
                                                {toTitleCase(m.Nombre)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-3 py-1 bg-primary/5 text-primary rounded-lg text-[10px] font-black border border-primary/10">
                                                {m.Categoria || 'Sin Categoría'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className={cn(
                                                "px-2.5 py-1 rounded-lg text-[10px] font-black",
                                                m.Estado === 'Activo' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"
                                            )}>
                                                {m.Estado}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => { 
                                                        setEditingMaterial(m); 
                                                        setIsManualCategory(false);
                                                        setIsEditModalOpen(true); 
                                                    }}
                                                    className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all shadow-sm"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
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

            {/* Edit Modal */}
            {isEditModalOpen && editingMaterial && (
                <Modal 
                    isOpen={isEditModalOpen} 
                    onClose={() => setIsEditModalOpen(false)} 
                    title={editingMaterial.ID_Material ? "Editar Producto" : "Nuevo Producto"}
                >
                    <form onSubmit={handleSaveMaterial} className="space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5 col-span-2">
                                <label className="text-[10px] font-black text-muted-foreground ml-1">Descripción del Producto</label>
                                <textarea 
                                    className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all resize-none h-20"
                                    value={editingMaterial.Nombre}
                                    onChange={(e) => setEditingMaterial({...editingMaterial, Nombre: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black text-muted-foreground ml-1">Código Externo</label>
                                <input 
                                    disabled={!!editingMaterial.ID_Material}
                                    type="text" 
                                    className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all disabled:opacity-50"
                                    value={editingMaterial.ID_Externo}
                                    onChange={(e) => setEditingMaterial({...editingMaterial, ID_Externo: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5 overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-muted-foreground ml-1">Categoría</label>
                                    <button 
                                        type="button"
                                        onClick={() => setIsManualCategory(!isManualCategory)}
                                        className="text-[9px] font-black text-primary hover:underline"
                                    >
                                        {isManualCategory ? 'Ver Lista' : '+ Nueva'}
                                    </button>
                                </div>
                                {isManualCategory ? (
                                    <input 
                                        type="text" 
                                        className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                        value={editingMaterial.Categoria}
                                        onChange={(e) => setEditingMaterial({...editingMaterial, Categoria: e.target.value})}
                                        placeholder="Nueva categoría..."
                                        autoFocus
                                        required
                                    />
                                ) : (
                                    <select 
                                        className="w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all cursor-pointer appearance-none"
                                        value={editingMaterial.Categoria}
                                        onChange={(e) => {
                                            if (e.target.value === 'NEW') {
                                                setIsManualCategory(true);
                                                setEditingMaterial({...editingMaterial, Categoria: ''});
                                            } else {
                                                setEditingMaterial({...editingMaterial, Categoria: e.target.value});
                                            }
                                        }}
                                        required
                                    >
                                        <option value="" disabled>Seleccionar...</option>
                                        {categories.filter(c => c !== 'Todas' && c !== '').map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                        <option value="NEW" className="text-primary font-bold">➕ Nueva Categoría...</option>
                                    </select>
                                )}
                            </div>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button 
                                type="button"
                                onClick={() => setIsEditModalOpen(false)} 
                                className="flex-1 py-3 border border-border rounded-xl text-sm font-bold hover:bg-muted transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit"
                                className="flex-[2] py-3 bg-primary text-white rounded-xl text-sm font-black shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
                            >
                                {editingMaterial.ID_Material ? "Guardar Cambios" : "Crear Producto"}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
