import { useState, useEffect } from 'react';
import { ApiClient } from '../../services/apiClient';
import { Modal } from '../common/Modal';
import { Save, Package, AlertCircle, ChevronDown, Check } from 'lucide-react';
import { useDialog } from '../../context/DialogContext';
import { cn } from '../../utils/cn';

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
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start gap-4">
                    <div className="p-2 bg-amber-500 text-white rounded-lg shadow-md shadow-amber-500/20">
                        <Package className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                        <h4 className="text-xs font-black text-amber-700 uppercase tracking-wider mb-1">Producto No Identificado</h4>
                        <p className="text-[11px] font-bold text-amber-600/70 leading-relaxed">
                            Este producto no existe en el maestro. Regístrelo ahora para que el sistema pueda asignarle una tarifa automáticamente.
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-muted-foreground ml-1">Código Externo</label>
                        <input 
                            disabled
                            type="text" 
                            value={initialData.codigo}
                            className="w-full px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-sm font-black text-muted-foreground cursor-not-allowed"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-muted-foreground ml-1">Descripción del Producto</label>
                        <textarea 
                            value={nombre}
                            onChange={(e) => setNombre(e.target.value)}
                            className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all resize-none h-20"
                            placeholder="Nombre del equipo..."
                        />
                    </div>

                    <div className="flex flex-col gap-1.5 relative">
                        <label className="text-[10px] font-black text-muted-foreground ml-1">Categoría asignada</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={categoria}
                                onChange={(e) => setCategoria(e.target.value)}
                                onFocus={() => setIsDropdownOpen(true)}
                                className="w-full px-4 py-3 bg-card border border-border rounded-xl text-sm font-black focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all"
                                placeholder="Escriba o seleccione categoría..."
                            />
                            <button 
                                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-md transition-colors"
                            >
                                <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isDropdownOpen && "rotate-180")} />
                            </button>
                        </div>
                        
                        {isDropdownOpen && categories.length > 0 && (
                            <div className="absolute top-full left-0 w-full mt-2 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                <div className="max-h-48 overflow-y-auto p-2 custom-scrollbar">
                                    {categories.map(cat => (
                                        <button 
                                            key={cat}
                                            onClick={() => { setCategoria(cat); setIsDropdownOpen(false); }}
                                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left text-xs font-bold hover:bg-primary/5 transition-colors"
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

                <div className="flex items-center gap-3 pt-4 border-t border-border/50">
                    <button 
                        onClick={onClose}
                        className="flex-1 px-4 py-3 border border-border rounded-xl font-bold text-sm hover:bg-muted transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={loading}
                        className="flex-[2] flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-xl font-black text-sm shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
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
