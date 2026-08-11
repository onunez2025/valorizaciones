import { useState, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useTranslation } from 'react-i18next';
import { ApiClient } from '../services/apiClient';
import {
    Package, Search, Filter, Plus, Edit2,
    Box, Activity
} from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { useDialog } from '../context/DialogContext';
import { toTitleCase } from '../utils/formatters';
import { cn } from '../utils/cn';
import type { Material } from '../types';
import { SIATC_THEME } from '../utils/siatc-theme';


/**
 * Mide el tiempo REAL que percibe el usuario: desde que se pide el dato hasta que la tabla
 * esta pintada. El servidor ya se cronometra en sus propios logs; esto cubre el otro tramo,
 * que es donde puede estar el problema cuando la consulta tarda menos de un segundo.
 */
const medirPintado = (etiqueta: string, filas: number, desde: number) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        console.log(`[MEDICION] ${etiqueta}: ${filas} filas — ${((performance.now() - desde) / 1000).toFixed(1)} s desde la peticion hasta pintarlo`);
    }));
};

export default function MaterialsPage() {
    const { t } = useTranslation();
    const [materials, setMaterials] = useState<Material[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todas');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
    const [isManualCategory, setIsManualCategory] = useState(false);
    const { alert } = useDialog();

    useEffect(() => {
        fetchMaterials();
    }, []);

    const fetchMaterials = async () => {
        setLoading(true);
        const t0 = performance.now();
        try {
            const data = await ApiClient.request('/materials');
            setMaterials(data);
            medirPintado('Materiales', (data as unknown[]).length, t0);
        } catch (error: unknown) {
            if (error instanceof Error && error.message === 'AUTH_EXPIRED') return;
            console.error("Error fetching materials:", error);
            alert({ message: t('materials.errors.loadFailed') });
        } finally {
            setLoading(false);
        }
    };

    // El catalogo tiene mas de 14.000 productos y la pantalla los pintaba TODOS, ademas por
    // duplicado: la tabla de escritorio y las tarjetas de movil se generan las dos aunque una
    // este oculta por CSS —`hidden` esconde, pero React construye igual los elementos—. Eran
    // cerca de 30.000 bloques en el DOM y ahi se iban los segundos, no en la consulta (0,5 s).
    //
    // Dos medidas: renderizar SOLO la vista que corresponde al ancho real, y dibujar
    // unicamente las filas visibles reciclandolas al desplazar.
    //
    // Se virtualiza en vez de paginar a proposito: asi el buscador y el filtro de categoria
    // siguen trabajando sobre el catalogo COMPLETO y siguen siendo instantaneos, sin viajes al
    // servidor por cada tecleo.
    const esEscritorio = useMediaQuery('(min-width: 768px)');
    const contenedorScroll = useRef<HTMLDivElement>(null);

    const categories = ['Todas', ...Array.from(new Set(materials.map(m => m.Categoria))).sort()];

    const filteredMaterials = materials.filter(m => {
        const matchesSearch = 
            m.Nombre?.toLowerCase().includes(search.toLowerCase()) || 
            m.ID_Externo?.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = selectedCategory === 'Todas' || m.Categoria === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const virtualizador = useVirtualizer({
        count: filteredMaterials.length,
        getScrollElement: () => contenedorScroll.current,
        // Alto aproximado de fila; el virtualizador lo corrige midiendo las reales.
        estimateSize: () => (esEscritorio ? 57 : 96),
        overscan: 8,
    });
    const filasVisibles = virtualizador.getVirtualItems();
    const rellenoArriba = filasVisibles.length ? filasVisibles[0].start : 0;
    const rellenoAbajo = filasVisibles.length
        ? virtualizador.getTotalSize() - filasVisibles[filasVisibles.length - 1].end
        : 0;

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
            alert({ title: t('materials.success.title'), message: t('materials.success.message'), type: 'success' });
            setIsEditModalOpen(false);
            fetchMaterials();
        } catch (error: unknown) {
            if (error instanceof Error && error.message === 'AUTH_EXPIRED') return;
            alert({ message: t('materials.errors.saveFailed') });
        }
    };

    return (
        <div className={SIATC_THEME.LAYOUT.PAGE_WRAPPER}>
            {/* Header */}
            <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                <div>
                    <h1 className={cn(SIATC_THEME.TYPOGRAPHY.PAGE_TITLE, "flex items-center gap-3")}>
                        <Box className="w-8 h-8 text-primary" />
                        {t('materials.title')}
                    </h1>
                    <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>{t('materials.subtitle')}</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-primary/5 px-4 py-2 rounded-xl border border-primary/10 flex items-center gap-3">
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-primary opacity-60 leading-tight">{t('materials.totalProducts')}</span>
                            <span className="text-xl font-black tracking-tighter text-primary">{materials.length}</span>
                        </div>
                        <Package className="w-6 h-6 text-primary opacity-40" />
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className={cn("p-3 flex flex-wrap items-center gap-4", SIATC_THEME.COMPONENTS.CARD_CONTAINER)}>
                <div className="flex-1 min-w-[300px] relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input 
                        type="text" 
                        placeholder={t('materials.searchPlaceholder')}
                        className="w-full bg-muted/30 border border-transparent rounded-xl pl-11 pr-4 py-3 text-sm font-bold focus:bg-background focus:border-primary/20 outline-none transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 bg-muted/20 p-1 rounded-xl border border-border/30">
                    <Filter className="w-4 h-4 ml-3 text-muted-foreground" />
                    <select
                        className={cn("bg-transparent border-none text-sm font-bold px-3 py-2 outline-none cursor-pointer", SIATC_THEME.MOBILE.TOUCH_INPUT)}
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
                    <Plus className="w-4 h-4" /> {t('materials.newProduct')}
                </button>
            </div>

            {/* Table */}
            <div className={cn("flex-1 overflow-hidden flex flex-col", SIATC_THEME.COMPONENTS.CARD_CONTAINER)}>
                <div ref={contenedorScroll} className="flex-1 overflow-auto custom-scrollbar">
                    {/* Vista de escritorio — solo se monta si el ancho la corresponde */}
                    {esEscritorio !== false && <div className="hidden md:block h-full">
                        {loading ? (
                            <div className="h-full flex flex-col items-center justify-center gap-4 opacity-40">
                                <Activity className="w-10 h-10 animate-spin text-primary" />
                                <p className="text-sm font-black">{t('materials.loading')}</p>
                            </div>
                        ) : filteredMaterials.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-30">
                                <Package className="w-16 h-16 mb-6" />
                                <h3 className="text-lg font-black">{t('materials.empty')}</h3>
                                <p className="text-xs font-bold mt-2">{t('materials.emptyHint')}</p>
                            </div>
                        ) : (
                            <table className="w-full border-separate border-spacing-0">
                                <thead className="bg-muted/30 sticky top-0 z-10 border-b border-border">
                                    <tr className="text-[11px] font-black text-muted-foreground uppercase tracking-widest">
                                        <th className="px-6 py-4 text-left">{t('materials.table.externalCode')}</th>
                                        <th className="px-6 py-4 text-left">{t('materials.table.productName')}</th>
                                        <th className="px-6 py-4 text-left">{t('materials.table.category')}</th>
                                        <th className="px-6 py-4 text-center">{t('materials.table.status')}</th>
                                        <th className="px-6 py-4 text-right">{t('materials.table.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/10">
                                    {/* Filas de relleno: sostienen la barra de desplazamiento como si
                                        estuvieran todas las filas, sin construirlas. */}
                                    {rellenoArriba > 0 && <tr><td colSpan={5} style={{ height: rellenoArriba }} /></tr>}
                                    {filasVisibles.map(fila => {
                                        const m = filteredMaterials[fila.index];
                                        return (
                                        <tr key={m.ID_Material} data-index={fila.index} ref={virtualizador.measureElement} className="hover:bg-primary/[0.02] transition-colors group">
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
                                                    {m.Categoria || t('materials.noCategory')}
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
                                                <div className="flex justify-end gap-2 transition-opacity">
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
                                        );
                                    })}
                                    {rellenoAbajo > 0 && <tr><td colSpan={5} style={{ height: rellenoAbajo }} /></tr>}
                                </tbody>
                            </table>
                        )}
                    </div>}

                    {/* Vista movil — solo se monta si el ancho la corresponde */}
                    {esEscritorio !== true && <div className="md:hidden space-y-3 p-3">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center gap-4 py-12 opacity-40">
                                <Activity className="w-10 h-10 animate-spin text-primary" />
                                <p className="text-sm font-black">{t('materials.loading')}</p>
                            </div>
                        ) : filteredMaterials.length === 0 ? (
                            <div className="flex flex-col items-center justify-center text-center py-20 opacity-30">
                                <Package className="w-16 h-16 mb-6" />
                                <h3 className="text-lg font-black">{t('materials.empty')}</h3>
                                <p className="text-xs font-bold mt-2">{t('materials.emptyHint')}</p>
                            </div>
                        ) : <>
                        {rellenoArriba > 0 && <div style={{ height: rellenoArriba }} />}
                        {filasVisibles.map(fila => {
                            const m = filteredMaterials[fila.index];
                            return (
                            <div key={m.ID_Material} data-index={fila.index} ref={virtualizador.measureElement} className={cn(SIATC_THEME.COMPONENTS.CARD_CONTAINER, "p-4 space-y-3")}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <span className="font-black text-primary text-[11px] tracking-tighter font-mono">{m.ID_Externo}</span>
                                        <div className="text-sm font-bold text-foreground truncate mt-1" title={m.Nombre}>
                                            {toTitleCase(m.Nombre)}
                                        </div>
                                    </div>
                                    <span className={cn(
                                        "shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-black",
                                        m.Estado === 'Activo' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-600 border border-red-100"
                                    )}>
                                        {m.Estado}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                                    <span className="px-3 py-1 bg-primary/5 text-primary rounded-lg text-[10px] font-black border border-primary/10 truncate max-w-[60%]">
                                        {m.Categoria || t('materials.noCategory')}
                                    </span>
                                    <button
                                        onClick={() => {
                                            setEditingMaterial(m);
                                            setIsManualCategory(false);
                                            setIsEditModalOpen(true);
                                        }}
                                        className={cn("px-3 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white transition-all shadow-sm flex items-center gap-1.5 shrink-0", SIATC_THEME.MOBILE.TOUCH_TARGET)}
                                        title="Editar"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                        <span className="text-[11px] font-black">{t('common.edit')}</span>
                                    </button>
                                </div>
                            </div>
                            );
                        })}
                        {rellenoAbajo > 0 && <div style={{ height: rellenoAbajo }} />}
                        </>}
                    </div>}
                </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && editingMaterial && (
                <Modal 
                    isOpen={isEditModalOpen} 
                    onClose={() => setIsEditModalOpen(false)} 
                    title={editingMaterial.ID_Material ? t('materials.modal.editTitle') : t('materials.modal.newTitle')}
                >
                    <form onSubmit={handleSaveMaterial} className="space-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5 col-span-2">
                                <label className="text-[10px] font-black text-muted-foreground ml-1">{t('materials.modal.description')}</label>
                                <textarea 
                                    className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all resize-none h-20"
                                    value={editingMaterial.Nombre}
                                    onChange={(e) => setEditingMaterial({...editingMaterial, Nombre: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-black text-muted-foreground ml-1">{t('materials.modal.externalCode')}</label>
                                <input
                                    disabled={!!editingMaterial.ID_Material}
                                    type="text"
                                    className={cn("w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all disabled:opacity-50", SIATC_THEME.MOBILE.TOUCH_INPUT)}
                                    value={editingMaterial.ID_Externo}
                                    onChange={(e) => setEditingMaterial({...editingMaterial, ID_Externo: e.target.value})}
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-1.5 overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-muted-foreground ml-1">{t('materials.modal.category')}</label>
                                    <button
                                        type="button"
                                        onClick={() => setIsManualCategory(!isManualCategory)}
                                        className={cn("text-[9px] font-black text-primary hover:underline flex items-center", SIATC_THEME.MOBILE.TOUCH_TARGET)}
                                    >
                                        {isManualCategory ? t('materials.modal.viewList') : t('materials.modal.newCategory')}
                                    </button>
                                </div>
                                {isManualCategory ? (
                                    <input
                                        type="text"
                                        className={cn("w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all", SIATC_THEME.MOBILE.TOUCH_INPUT)}
                                        value={editingMaterial.Categoria}
                                        onChange={(e) => setEditingMaterial({...editingMaterial, Categoria: e.target.value})}
                                        placeholder={t('materials.modal.newCategoryPlaceholder')}
                                        autoFocus
                                        required
                                    />
                                ) : (
                                    <select
                                        className={cn("w-full px-4 py-2.5 bg-card border border-border rounded-xl text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all cursor-pointer appearance-none", SIATC_THEME.MOBILE.TOUCH_INPUT)}
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
                                        <option value="" disabled>{t('materials.modal.selectCategory')}</option>
                                        {categories.filter(c => c !== 'Todas' && c !== '').map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                        <option value="NEW" className="text-primary font-bold">{t('materials.modal.addNewCategory')}</option>
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
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                className="flex-[2] py-3 bg-primary text-white rounded-xl text-sm font-black shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
                            >
                                {editingMaterial.ID_Material ? t('materials.modal.saveChanges') : t('materials.modal.createProduct')}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
