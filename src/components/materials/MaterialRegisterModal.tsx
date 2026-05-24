import { useState, useEffect } from 'react';
import { ApiClient } from '../../services/apiClient';
import { Modal } from '../common/Modal';
import { Save, Package, AlertCircle, ChevronDown, Check } from 'lucide-react';
import { useDialog } from '../../context/DialogContext';
import { cn } from '../../utils/cn';
import { SIATC_THEME } from '../../utils/siatc-theme';

interface MaterialRegisterModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialData: {
        codigo: string;
        nombre: string;
    };
}

export default function MaterialRegisterModal({ isOpen, onClose, onSuccess, initialData }: MaterialRegisterModalProps) {
    const [nombre, setNombre] = useState(initialData.nombre);
    const [categoria, setCategoria] = useState('');
    const [categories, setCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const { alert } = useDialog();

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const data = await ApiClient.request('/materials/categories');
                setCategories(data);
            } catch (error) {
                console.error("Error fetching categories:", error);
            }
        };
        fetchCategories();
    }, []);

    const handleSave = async () => {
        if (!categoria) {
            alert({ title: "Faltan datos", message: "Debe seleccionar o escribir una categoría.", type: 'warning' });
            return;
        }

        setLoading(true);
        try {
            await ApiClient.request('/materials', {
                method: 'POST',
                body: JSON.stringify({
                    idExterno: initialData.codigo,
                    nombre: nombre,
                    categoria: categoria,
                    sector: 'GAC'
                })
            });
            alert({ title: "¡Registrado!", message: "El producto ha sido añadido al maestro de materiales.", type: 'success' });
            onSuccess();
            onClose();
        } catch (e: any) {
            alert({ title: "Error", message: e.message || "No se pudo registrar el material.", type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={onClose} 
            title="Registrar Nuevo Producto"
        >
            <div className="flex flex-col gap-6">
                {/* Info Card */}
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-cb-card p-4 flex items-start gap-4">
                    <div className="p-2 bg-amber-500 text-white rounded-cb-btn shadow-md shadow-amber-500/20">
                        <Package className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-xs font-bold text-amber-700 dark:text-amber-500 uppercase tracking-wider mb-1">Producto No Identificado</h4>
                        <p className="text-[11px] font-bold text-amber-600/70 dark:text-amber-500/60 leading-relaxed">
                            Este producto no existe en el maestro. Regístrelo ahora para que el sistema pueda asignarle una tarifa automáticamente.
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Código Externo</label>
                        <input 
                            disabled
                            type="text" 
                            value={initialData.codigo}
                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "dark:bg-cb-bg text-cb-text-secondary border-cb-border opacity-60 cursor-not-allowed")}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Descripción del Producto</label>
                        <textarea 
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "h-20 py-2.5 resize-none dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                            placeholder="Nombre del equipo..."
                        />
                    </div>

                    <div className="flex flex-col gap-1.5 relative">
                        <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider ml-1">Categoría asignada</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={categoria}
                                onChange={(e) => setCategoria(e.target.value)}
                                onFocus={() => setIsDropdownOpen(true)}
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, "dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                                placeholder="Escriba o seleccione categoría..."
                            />
                            <button 
                                type="button"
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-cb-bg rounded-cb-btn transition-colors"
                            >
                                <ChevronDown className={cn("w-4 h-4 text-cb-neutral transition-transform", isDropdownOpen && "rotate-180")} />
                            </button>
                        </div>
                        
                        {isDropdownOpen && categories.length > 0 && (
                            <div className="absolute top-full left-0 w-full mt-2 bg-white dark:bg-cb-bg border border-cb-border rounded-cb-card shadow-cb-level-3 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="max-h-48 overflow-y-auto p-2 custom-scrollbar">
                                    {categories.map(cat => (
                                        <button 
                                            key={cat}
                                            type="button"
                                            onClick={() => { setCategoria(cat); setIsDropdownOpen(false); }}
                                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-cb-btn text-left text-xs font-bold hover:bg-primary/5 dark:text-cb-text-primary transition-colors text-cb-text-primary"
                                        >
                                            {cat}
                                            {categoria === cat && <Check className="w-3.5 h-3.5 text-primary" />}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-cb-border">
                    <button 
                        onClick={onClose}
                        className={cn(SIATC_THEME.COMPONENTS.BUTTON_SECONDARY, "flex-1")}
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={loading}
                        className={cn(SIATC_THEME.COMPONENTS.BUTTON_PRIMARY, "flex-[2]")}
                    >
                        {loading ? "Registrando..." : (
                            <>
                                <Save className="w-4 h-4" />
                                Guardar en Maestro
                            </>
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
