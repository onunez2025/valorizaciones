import { useState, useRef } from 'react';
import { X, Upload, Download, CheckCircle, AlertCircle, RefreshCw, FileSpreadsheet, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ApiClient } from '../../services/apiClient';
import { cn } from '../../utils/cn';
import { useDialog } from '../../context/DialogContext';

interface PreviewRow {
    CAS_Nombre: string;
    Categoria: string;
    Servicio: string;
    Fecha_inicio: string;
    Fecha_fin: string;
    Importe: string;
    Estado: string;
    CAS_ID?: number;
    Status: 'INSERT' | 'UPDATE' | 'OK' | 'ERROR';
    Message: string;
    Importe_Actual?: number | null;
    ID_Tarifario?: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const STATUS_CONFIG = {
    INSERT:  { label: 'INSERTAR',    bg: 'bg-emerald-50',  text: 'text-emerald-700',  border: 'border-emerald-200',  dot: 'bg-emerald-500'  },
    UPDATE:  { label: 'ACTUALIZAR',  bg: 'bg-amber-50',    text: 'text-amber-700',    border: 'border-amber-200',    dot: 'bg-amber-500'    },
    OK:      { label: 'SIN CAMBIOS', bg: 'bg-muted/30',    text: 'text-muted-foreground', border: 'border-border/20', dot: 'bg-muted-foreground/40' },
    ERROR:   { label: 'ERROR',       bg: 'bg-red-50',      text: 'text-red-700',      border: 'border-red-200',      dot: 'bg-red-500'      },
};

function parseExcelDate(value: any): string {
    if (!value && value !== 0) return '';
    if (value instanceof Date) return value.toISOString().split('T')[0];
    if (typeof value === 'number') {
        // Excel serial date
        const date = XLSX.SSF.parse_date_code(value);
        if (date) {
            const y = date.y;
            const m = String(date.m).padStart(2, '0');
            const d = String(date.d).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }
    if (typeof value === 'string') {
        // DD/MM/YYYY
        const dmY = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmY) return `${dmY[3]}-${dmY[2].padStart(2,'0')}-${dmY[1].padStart(2,'0')}`;
        // YYYY-MM-DD already
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.split('T')[0];
    }
    return String(value);
}

function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const headers = ['CAS_Nombre', 'Categoria', 'Servicio', 'Fecha_inicio', 'Fecha_fin', 'Importe', 'Estado'];
    const example = [
        ['Black', 'CALENTADORES A GAS', 'Instalación', '01/01/2025', '31/12/2026', 42, 'A'],
        ['Silar', 'TERMAS ELECTRICAS -50LT', 'Revisión', '01/01/2025', '31/12/2026', 35, 'A'],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 20) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Tarifario');
    XLSX.writeFile(wb, 'Plantilla_Tarifario.xlsx');
}

export default function TarifarioImportModal({ isOpen, onClose, onSuccess }: Props) {
    const { alert } = useDialog();
    const fileRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [preview, setPreview] = useState<PreviewRow[]>([]);
    const [result, setResult] = useState<{ inserted: number; updated: number } | null>(null);

    if (!isOpen) return null;

    const counts = {
        insert: preview.filter(r => r.Status === 'INSERT').length,
        update: preview.filter(r => r.Status === 'UPDATE').length,
        ok:     preview.filter(r => r.Status === 'OK').length,
        error:  preview.filter(r => r.Status === 'ERROR').length,
    };

    const handleFile = async (file: File) => {
        setLoading(true);
        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

            if (raw.length < 2) {
                alert({ message: 'El archivo está vacío o solo tiene encabezados.' });
                setLoading(false);
                return;
            }

            const headerRow = raw[0].map((h: any) => String(h).trim());
            const required = ['CAS_Nombre', 'Categoria', 'Servicio', 'Fecha_inicio', 'Fecha_fin', 'Importe'];
            const missing = required.filter(r => !headerRow.includes(r));
            if (missing.length > 0) {
                alert({ message: `Columnas faltantes en el Excel: ${missing.join(', ')}. Descarga la plantilla para ver el formato correcto.` });
                setLoading(false);
                return;
            }

            const idx = (name: string) => headerRow.indexOf(name);
            const rows = raw.slice(1)
                .filter(r => r.some((c: any) => c !== ''))
                .map((r: any[]) => ({
                    CAS_Nombre:   String(r[idx('CAS_Nombre')] || '').trim(),
                    Categoria:    String(r[idx('Categoria')]  || '').trim().toUpperCase(),
                    Servicio:     String(r[idx('Servicio')]   || '').trim(),
                    Fecha_inicio: parseExcelDate(r[idx('Fecha_inicio')]),
                    Fecha_fin:    parseExcelDate(r[idx('Fecha_fin')]),
                    Importe:      String(r[idx('Importe')]    || '').trim(),
                    Estado:       String(r[idx('Estado')]     || 'A').trim().toUpperCase() || 'A',
                }));

            const { preview: data } = await ApiClient.request('/tarifarios/import/preview', {
                method: 'POST',
                body: JSON.stringify({ rows }),
            });
            setPreview(data);
            setStep('preview');
        } catch (err: any) {
            if (err.message !== 'AUTH_EXPIRED')
                alert({ message: 'Error al procesar el archivo: ' + err.message });
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        const toApply = preview.filter(r => r.Status === 'INSERT' || r.Status === 'UPDATE');
        if (toApply.length === 0) {
            alert({ message: 'No hay cambios pendientes para aplicar.' });
            return;
        }
        setConfirming(true);
        try {
            const data = await ApiClient.request('/tarifarios/import/confirm', {
                method: 'POST',
                body: JSON.stringify({ rows: toApply }),
            });
            setResult({ inserted: data.inserted, updated: data.updated });
            setStep('done');
            onSuccess();
        } catch (err: any) {
            if (err.message !== 'AUTH_EXPIRED')
                alert({ message: 'Error al confirmar la importación: ' + err.message });
        } finally {
            setConfirming(false);
        }
    };

    const handleReset = () => {
        setStep('upload');
        setPreview([]);
        setResult(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-5xl bg-card rounded-2xl border border-border shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-border/40">
                    <div className="flex items-center gap-4">
                        <div className="p-2.5 bg-blue-500/10 rounded-xl text-blue-600">
                            <FileSpreadsheet className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-black tracking-tight">Importar Tarifario desde Excel</h2>
                            <p className="text-[10px] font-bold text-muted-foreground/50">Carga masiva para múltiples CAS</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-auto p-8 custom-scrollbar">

                    {/* STEP: UPLOAD */}
                    {step === 'upload' && (
                        <div className="space-y-8">
                            {/* Format guide */}
                            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-6">
                                <h3 className="text-[11px] font-black uppercase tracking-widest text-blue-700 mb-4">Formato requerido del Excel</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-[11px]">
                                        <thead>
                                            <tr className="border-b border-blue-200">
                                                {['CAS_Nombre','Categoria','Servicio','Fecha_inicio','Fecha_fin','Importe','Estado'].map(h => (
                                                    <th key={h} className="px-3 py-2 font-black text-blue-800 bg-blue-100/50">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="border-b border-blue-100/50">
                                                <td className="px-3 py-2 font-bold text-blue-700">Black</td>
                                                <td className="px-3 py-2 text-blue-600">CALENTADORES A GAS</td>
                                                <td className="px-3 py-2 text-blue-600">Instalación</td>
                                                <td className="px-3 py-2 text-blue-600">01/01/2025</td>
                                                <td className="px-3 py-2 text-blue-600">31/12/2026</td>
                                                <td className="px-3 py-2 font-bold text-blue-700">42</td>
                                                <td className="px-3 py-2 text-blue-600">A</td>
                                            </tr>
                                            <tr>
                                                <td className="px-3 py-2 font-bold text-blue-700">Silar</td>
                                                <td className="px-3 py-2 text-blue-600">TERMAS ELECTRICAS -50LT</td>
                                                <td className="px-3 py-2 text-blue-600">Revisión</td>
                                                <td className="px-3 py-2 text-blue-600">01/01/2025</td>
                                                <td className="px-3 py-2 text-blue-600">31/12/2026</td>
                                                <td className="px-3 py-2 font-bold text-blue-700">35</td>
                                                <td className="px-3 py-2 text-blue-600">A</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] font-bold text-blue-600">
                                    <div><span className="text-blue-800">CAS_Nombre:</span> Nombre exacto del CAS en el sistema (ej: "Black", "Silar")</div>
                                    <div><span className="text-blue-800">Categoria:</span> Categoría del producto en MAYÚSCULAS</div>
                                    <div><span className="text-blue-800">Fecha_inicio / Fecha_fin:</span> Formato DD/MM/YYYY o YYYY-MM-DD</div>
                                    <div><span className="text-blue-800">Estado:</span> A = Activo, I = Inactivo (opcional, por defecto A)</div>
                                </div>
                            </div>

                            {/* Upload area */}
                            <div
                                className={cn(
                                    "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all",
                                    loading ? "border-primary/30 bg-primary/5" : "border-border/50 hover:border-primary/40 hover:bg-primary/[0.02]"
                                )}
                                onClick={() => !loading && fileRef.current?.click()}
                            >
                                {loading ? (
                                    <div className="flex flex-col items-center gap-4">
                                        <RefreshCw className="w-10 h-10 text-primary animate-spin opacity-40" />
                                        <p className="text-sm font-black text-muted-foreground/60">Procesando archivo y verificando contra la BD...</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-4">
                                        <Upload className="w-10 h-10 text-muted-foreground/30" />
                                        <div>
                                            <p className="text-sm font-black text-foreground/70">Haz clic o arrastra tu archivo Excel aquí</p>
                                            <p className="text-[10px] font-bold text-muted-foreground/40 mt-1">Acepta .xlsx y .xls</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".xlsx,.xls"
                                className="hidden"
                                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                            />
                        </div>
                    )}

                    {/* STEP: PREVIEW */}
                    {step === 'preview' && (
                        <div className="space-y-6">
                            {/* Summary chips */}
                            <div className="flex items-center gap-3 flex-wrap">
                                {counts.insert > 0 && (
                                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span className="text-[11px] font-black text-emerald-700">{counts.insert} a insertar</span>
                                    </div>
                                )}
                                {counts.update > 0 && (
                                    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                                        <span className="text-[11px] font-black text-amber-700">{counts.update} a actualizar</span>
                                    </div>
                                )}
                                {counts.ok > 0 && (
                                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border border-border/30 rounded-lg">
                                        <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                                        <span className="text-[11px] font-black text-muted-foreground/60">{counts.ok} sin cambios</span>
                                    </div>
                                )}
                                {counts.error > 0 && (
                                    <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
                                        <div className="w-2 h-2 rounded-full bg-red-500" />
                                        <span className="text-[11px] font-black text-red-700">{counts.error} con error</span>
                                    </div>
                                )}
                                <span className="text-[10px] font-bold text-muted-foreground/40 ml-auto">{preview.length} filas en total</span>
                            </div>

                            {/* Table */}
                            <div className="border border-border/40 rounded-xl overflow-hidden">
                                <table className="w-full text-left text-[11px]">
                                    <thead>
                                        <tr className="border-b border-border/40 bg-muted/10">
                                            <th className="px-4 py-3 font-black text-muted-foreground/60 uppercase tracking-widest">CAS</th>
                                            <th className="px-4 py-3 font-black text-muted-foreground/60 uppercase tracking-widest">Categoria</th>
                                            <th className="px-4 py-3 font-black text-muted-foreground/60 uppercase tracking-widest">Servicio</th>
                                            <th className="px-4 py-3 font-black text-muted-foreground/60 uppercase tracking-widest text-center">Vigencia</th>
                                            <th className="px-4 py-3 font-black text-muted-foreground/60 uppercase tracking-widest text-right">Actual</th>
                                            <th className="px-4 py-3 font-black text-muted-foreground/60 uppercase tracking-widest text-right">Nuevo</th>
                                            <th className="px-4 py-3 font-black text-muted-foreground/60 uppercase tracking-widest text-center">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/20">
                                        {preview.map((row, i) => {
                                            const cfg = STATUS_CONFIG[row.Status];
                                            return (
                                                <tr key={i} className={cn('transition-colors', cfg.bg)}>
                                                    <td className="px-4 py-2.5 font-bold">{row.CAS_Nombre}</td>
                                                    <td className="px-4 py-2.5 font-bold text-foreground/70">{row.Categoria}</td>
                                                    <td className="px-4 py-2.5 text-foreground/60">{row.Servicio}</td>
                                                    <td className="px-4 py-2.5 text-center text-foreground/50 whitespace-nowrap">
                                                        {row.Fecha_inicio} — {row.Fecha_fin}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-bold text-muted-foreground/60">
                                                        {row.Importe_Actual != null ? `S/ ${Number(row.Importe_Actual).toFixed(2)}` : '—'}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-black">
                                                        {row.Status !== 'ERROR' && (
                                                            <span className={cn(row.Status === 'UPDATE' ? 'text-amber-700' : row.Status === 'INSERT' ? 'text-emerald-700' : 'text-foreground/60')}>
                                                                S/ {Number(row.Importe).toFixed(2)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-center">
                                                        <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border', cfg.border)}>
                                                            <div className={cn('w-1.5 h-1.5 rounded-full', cfg.dot)} />
                                                            <span className={cn('text-[9px] font-black uppercase tracking-widest', cfg.text)}>
                                                                {row.Status === 'ERROR' ? row.Message : cfg.label}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* STEP: DONE */}
                    {step === 'done' && result && (
                        <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
                            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center">
                                <CheckCircle className="w-10 h-10 text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black">¡Importación exitosa!</h3>
                                <p className="text-muted-foreground text-sm mt-2">
                                    Se insertaron <strong>{result.inserted}</strong> nuevas tarifas y se actualizaron <strong>{result.updated}</strong>.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-5 border-t border-border/40 flex items-center justify-between bg-muted/5">
                    <button
                        onClick={downloadTemplate}
                        className="flex items-center gap-2 text-[10px] font-black text-muted-foreground/50 hover:text-primary transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Descargar plantilla Excel
                    </button>

                    <div className="flex items-center gap-3">
                        {step === 'preview' && (
                            <button
                                onClick={handleReset}
                                className="px-5 py-2.5 bg-muted rounded-lg font-bold text-[10px] text-muted-foreground hover:bg-muted/80 transition-all"
                            >
                                Cargar otro archivo
                            </button>
                        )}
                        {step === 'done' ? (
                            <button
                                onClick={onClose}
                                className="px-6 py-2.5 bg-foreground text-background rounded-lg font-bold text-[10px]"
                            >
                                Cerrar
                            </button>
                        ) : step === 'preview' ? (
                            <button
                                onClick={handleConfirm}
                                disabled={confirming || (counts.insert === 0 && counts.update === 0)}
                                className="px-6 py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-[10px] shadow-lg flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {confirming ? (
                                    <><RefreshCw className="w-4 h-4 animate-spin" /> Aplicando...</>
                                ) : (
                                    <><ArrowRight className="w-4 h-4" /> Confirmar importación ({counts.insert + counts.update})</>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={onClose}
                                className="px-5 py-2.5 bg-muted rounded-lg font-bold text-[10px] text-muted-foreground hover:bg-muted/80 transition-all"
                            >
                                Cancelar
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
