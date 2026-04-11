import { useState, useEffect, useRef } from 'react';
import { Search, Filter, Calendar, ChevronRight, Calculator, Download, AlertTriangle, CheckCircle2, FileText, X, ChevronDown, Briefcase, Building2, Check, Activity, AlertCircle, Lock } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ApiClient } from '../services/apiClient';
import type { CAS, ValuationTicket, Penalty } from '../types';
import { cn } from '../utils/cn';
import { toTitleCase } from '../utils/formatters';
import { useDialog } from '../context/DialogContext';
import PenaltyModal from '../components/penalties/PenaltyModal';
import TarifarioModal from '../components/tarifario/TarifarioModal';
import { Modal } from '../components/common/Modal';

export default function ValuationsPage() {
    const { alert } = useDialog();
    const [casList, setCasList] = useState<CAS[]>([]);
    const [selectedCas, setSelectedCas] = useState<CAS | null>(null);

    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() < 16 ? 1 : 16).toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate() < 16 ? 15 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).toISOString().split('T')[0];
    });

    const [tickets, setTickets] = useState<ValuationTicket[]>([]);
    const [penalties, setPenalties] = useState<Penalty[]>([]);
    const [loadingData, setLoadingData] = useState(false);
    const [showPenaltyModal, setShowPenaltyModal] = useState<{show: boolean, type: 'penalty' | 'additional', ticket?: string, date?: string}>({show: false, type: 'penalty'});
    const [expandedDates, setExpandedDates] = useState<string[]>([]);
    const [showTarifarioModal, setShowTarifarioModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [modalData, setModalData] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'services' | 'penalties'>('services');
    const [globalSearch, setGlobalSearch] = useState('');
    const [globalSearchResult, setGlobalSearchResult] = useState<any>(null);
    const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchCas = async () => {
            try {
                const data = await ApiClient.request('/cas');
                setCasList(data);
            } catch (error) {
                console.error("Error fetching CAS:", error);
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

    const handleFetchValuation = async () => {
        if (!selectedCas) {
            alert({ message: "Por favor, seleccione un Centro de Atención (CAS) primero." });
            return;
        }
        setLoadingData(true);
        try {
            const data = await ApiClient.request(`/valuations/${selectedCas.RUC}?start=${startDate}&end=${endDate}`);
            setTickets(data);
            const penaltiesData = await ApiClient.request(`/penalties/${selectedCas.RUC}?start=${startDate}&end=${endDate}`);
            setPenalties(penaltiesData);
        } catch (error) {
            console.error("Error fetching valuation:", error);
            alert({ message: "No se pudo cargar la información de la valorización." });
        } finally {
            setLoadingData(false);
        }
    };

    const filteredCasList = casList.filter(cas => 
        cas.Nombre_CAS.toLowerCase().includes(searchQuery.toLowerCase()) || 
        cas.RUC.includes(searchQuery)
    );

    const totalTickets = tickets.reduce((sum, t) => sum + (t.TarifaBase + (t.Adicionales || 0)), 0);
    const totalPenalties = penalties.reduce((sum, p) => sum + p.Importe, 0);
    const grandTotal = totalTickets - totalPenalties;

    const handleCloseFortnightCurrent = async () => {
        if (!selectedCas) return;
        setIsClosing(true);
        try {
            await ApiClient.request('/valuations/close', {
                method: 'POST',
                body: JSON.stringify({
                    ruc: selectedCas.RUC,
                    nombreCas: selectedCas.Nombre_CAS,
                    start: startDate,
                    end: endDate,
                    totalServicios: tickets.length,
                    totalPenalidades: penalties.length,
                    subtotalServicios: totalTickets,
                    subtotalPenalidades: totalPenalties,
                    totalFinal: grandTotal,
                    cerradoPor: "Auditor CAS"
                })
            });
            setShowCloseModal(false);
            alert({ title: "¡Cerrado!", message: "La quincena se ha cerrado y registrado correctamente.", type: 'success' });
            handleFetchValuation();
        } catch (error) {
            console.error("Error closing fortnight:", error);
            alert({ message: "No se pudo cerrar la quincena. Intente nuevamente." });
        } finally {
            setIsClosing(false);
        }
    };

    const groupedTickets = tickets.reduce((acc, ticket) => {
        const dateStr = new Date(ticket.Fecha).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        if (!acc[dateStr]) {
            acc[dateStr] = { 
                dateStr, 
                count: 0, 
                zeroPriceCount: 0,
                totalBase: 0, 
                totalAdicional: 0, 
                tickets: [] 
            };
        }
        acc[dateStr].count += 1;
        if (ticket.TarifaBase === 0) {
            acc[dateStr].zeroPriceCount += 1;
        }
        acc[dateStr].totalBase += ticket.TarifaBase;
        acc[dateStr].totalAdicional += (ticket.Adicionales || 0);
        acc[dateStr].tickets.push(ticket);
        return acc;
    }, {} as Record<string, { dateStr: string, count: number, zeroPriceCount: number, totalBase: number, totalAdicional: number, tickets: ValuationTicket[] }>);

    const sortedDates = Object.keys(groupedTickets).sort((a, b) => {
        const [da, ma, ya] = a.split('/').map(Number);
        const [db, mb, yb] = b.split('/').map(Number);
        return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
    });

    const toggleDate = (date: string) => {
        setExpandedDates(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]);
    };

    const handleExportExcel = () => {
        if (!selectedCas || tickets.length === 0) return;
        const summaryData = [
            ["REPORTE DE VALORIZACIÓN QUINCENAL"],
            ["CAS:", selectedCas.Nombre_CAS],
            ["RUC:", selectedCas.RUC],
            ["Periodo:", `${startDate} al ${endDate}`],
            [""],
            ["CONCEPTO", "CANTIDAD", "SUBTOTAL"],
            ["Servicios de Instalación/Reparación", tickets.length, totalTickets],
            ["Penalidades y Descuentos", penalties.length, -totalPenalties],
            [""],
            ["TOTAL NETO A PAGAR", "", grandTotal]
        ];
        const servicesData = [
            ["TICKET", "FECHA CIERRE", "SERVICIO", "CATEGORÍA", "TARIFA BASE", "ADICIONALES", "TOTAL"],
            ...tickets.map(t => [t.Ticket, new Date(t.Fecha).toLocaleDateString(), t.ServicioNombre || t.Servicio, t.Categoria, t.TarifaBase, (t.Adicionales || 0), (t.TarifaBase + (t.Adicionales || 0))])
        ];
        const penaltiesData = [
            ["ID", "FECHA", "MOTIVO", "DESCRIPCIÓN", "TICKET REF.", "ESTADO", "IMPORTE"],
            ...penalties.map(p => [p.Id, new Date(p.Fecha).toLocaleDateString(), p.Motivo, p.Descripcion, p.Ticket || '-', p.Estado, -p.Importe])
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "Resumen");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(servicesData), "Detalle Servicios");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(penaltiesData), "Detalle Penalidades");
        XLSX.writeFile(wb, `Valorizacion_${selectedCas.Nombre_CAS.replace(/\s/g, '_')}_${startDate}.xlsx`);
    };

    const handleOpenTarifarioModal = (ticket: ValuationTicket) => {
        setModalData({
            casId: selectedCas?.ID_CAS || '',
            casNombre: selectedCas?.Nombre_CAS || '',
            categoria: ticket.Categoria,
            servicio: ticket.Servicio,
            servicioNombre: ticket.ServicioNombre || 'Servicio General'
        });
        setShowTarifarioModal(true);
    };

    return (
        <div className="flex flex-col h-full gap-5 animate-in fade-in duration-500 p-1">
            {/* Cabecera */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Valorizaciones CAS</h1>
                    <p className="text-muted-foreground text-sm">Gestión quincenal de pagos y descuentos.</p>
                </div>
            </div>

            {/* Banner Global Search Result */}
            {globalSearchResult && (
                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-4 duration-300">
                    {globalSearchResult.error ? (
                        <div className="flex items-center gap-3 text-red-600">
                            <AlertCircle className="w-5 h-5" />
                            <span className="text-sm font-bold">{globalSearchResult.error}</span>
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center gap-6">
                        <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-primary opacity-60">Ticket encontrado</span>
                                <span className="text-lg font-black">{globalSearchResult.Ticket}</span>
                            </div>
                            <div className="h-8 w-px bg-primary/10" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold opacity-40">CAS</span>
                                <span className="text-sm font-bold">{toTitleCase(globalSearchResult.CAS_Nombre)}</span>
                            </div>
                            <div className="h-8 w-px bg-primary/10" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold opacity-40">Fecha</span>
                                <span className="text-sm font-bold">{new Date(globalSearchResult.Fecha).toLocaleDateString()}</span>
                            </div>
                            <button 
                                onClick={() => {
                                    const cas = casList.find(c => c.RUC === globalSearchResult.RUC);
                                    if (cas) setSelectedCas(cas);
                                    setShowPenaltyModal({ show: true, type: 'penalty', ticket: globalSearchResult.Ticket, date: globalSearchResult.Fecha.split('T')[0] });
                                }}
                                className="bg-red-600 text-white px-5 py-2.5 rounded-xl text-xs font-black hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 flex items-center gap-2"
                            >
                                <AlertTriangle className="w-4 h-4" /> Aplicar penalidad
                            </button>
                        </div>
                    )}
                    <button onClick={() => setGlobalSearchResult(null)} className="p-2 hover:bg-primary/10 rounded-full transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>
            )}

            {/* Barra de Filtros Unificada (Fila Única Permanente) */}
            <div className="bg-card rounded-xl border border-border p-2 shadow-sm flex flex-wrap items-center gap-3">
                {/* Selector de CAS */}
                <div className="relative flex-1 min-w-[280px]" ref={dropdownRef}>
                    <div 
                        className={cn(
                            "bg-background rounded-lg border border-border flex items-center gap-2 transition-all hover:border-primary/30 h-11",
                            isDropdownOpen && "ring-2 ring-primary/5 border-primary/40 ring-offset-2"
                        )}
                    >
                        <div className="ml-3 text-primary/40">
                            <Building2 className="w-4 h-4" />
                        </div>
                        <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="flex-1 text-left px-1 py-1 overflow-hidden">
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-0">Centro de Atención (CAS)</p>
                            <p className={cn("text-sm font-bold tracking-tight truncate", !selectedCas && "text-muted-foreground/30 italic font-medium")}>
                                {selectedCas ? toTitleCase(selectedCas.Nombre_CAS) : "Seleccionar empresa..."}
                            </p>
                        </button>
                        {selectedCas && (
                            <button onClick={(e) => { e.stopPropagation(); setSelectedCas(null); setTickets([]); setPenalties([]); }} className="p-2 text-muted-foreground hover:text-red-500 transition-all">
                                <X className="w-4 h-4" />
                            </button>
                        )}
                        <ChevronDown className={cn("w-4 h-4 mr-3 text-muted-foreground/30 transition-transform", isDropdownOpen && "rotate-180 text-primary")} />
                    </div>

                    {isDropdownOpen && (
                        <div className="absolute top-full left-0 mt-2 w-full bg-card border border-border rounded-xl shadow-xl z-[100] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                            <div className="p-3 border-b border-border/40">
                                <input autoFocus type="text" placeholder="Buscar CAS..." className="w-full bg-muted/30 border border-transparent rounded-lg px-3 py-2 text-sm font-medium focus:bg-background focus:border-primary/20 outline-none transition-all" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            </div>
                            <div className="max-h-[280px] overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                {filteredCasList.map(cas => (
                                    <button key={cas.RUC} onClick={() => { setSelectedCas(cas); setIsDropdownOpen(false); setSearchQuery(''); }} className={cn("w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all", selectedCas?.RUC === cas.RUC ? "bg-primary text-white shadow-md shadow-primary/20" : "hover:bg-primary/5 text-sm font-medium")}>
                                        <div className="flex flex-col"><span className="truncate max-w-[200px]">{toTitleCase(cas.Nombre_CAS)}</span><span className="text-[11px] opacity-60">RUC: {cas.RUC}</span></div>
                                        {selectedCas?.RUC === cas.RUC && <Check className="w-3.5 h-3.5" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Rango de Fechas */}
                <div className="flex items-center gap-2 bg-muted/20 p-1 rounded-lg border border-border/30">
                    <div className="relative">
                        <input type="date" title="Inicio" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-background border border-border rounded-md pl-8 pr-2 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none h-9 w-[150px]" />
                        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                    </div>
                    <div className="relative">
                        <input type="date" title="Fin" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-background border border-border rounded-md pl-8 pr-2 py-1.5 text-sm font-medium focus:ring-1 focus:ring-primary outline-none h-9 w-[150px]" />
                        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
                    </div>
                </div>

                {/* Buscador de Tickets */}
                <div className="flex-1 max-w-[220px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input 
                        type="text" 
                        placeholder="N° Ticket..." 
                        className="w-full bg-background border border-border rounded-lg pl-9 pr-3 h-11 text-sm font-medium focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none transition-all" 
                        value={globalSearch} 
                        onChange={(e) => setGlobalSearch(e.target.value)}
                        onKeyDown={async (e) => {
                            if (e.key === 'Enter' && globalSearch) {
                                setIsSearchingGlobal(true);
                                try {
                                    const result = await ApiClient.request(`/tickets/find/${globalSearch}`);
                                    setGlobalSearchResult(result);
                                } catch (err) { setGlobalSearchResult({ error: 'Ticket no encontrado' }); } finally { setIsSearchingGlobal(false); }
                            }
                        }}
                    />
                    {isSearchingGlobal && <Activity className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-primary animate-spin" />}
                </div>

                {/* Botón Consultar */}
                <button onClick={handleFetchValuation} disabled={loadingData} className="h-11 bg-primary text-primary-foreground px-6 rounded-xl font-bold text-sm transition-all flex items-center gap-2 hover:opacity-95 active:scale-95 disabled:opacity-50 shadow-lg shadow-primary/10">
                    {loadingData ? <Activity className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" /> }
                    {loadingData ? "Cargando" : "Consultar"}
                </button>
            </div>

            {/* Contenido Principal */}
            <div className="flex-1 min-h-0">
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full pb-2">
                    {/* Resumen */}
                    <div className="xl:col-span-1 h-full">
                        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm h-full flex flex-col justify-between">
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Resumen de cuenta</h3>
                                    <Calculator className="w-5 h-5 text-primary" />
                                </div>
                                
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center p-4 bg-muted/20 rounded-xl border border-border/30">
                                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Servicios</span>
                                        <span className="text-base font-bold tracking-tight">S/ {totalTickets.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center p-4 bg-red-50/50 rounded-xl border border-red-100">
                                        <span className="text-[11px] font-bold text-red-600 uppercase tracking-wider">Penalidades</span>
                                        <span className="text-base font-bold text-red-600 tracking-tight">- S/ {totalPenalties.toLocaleString()}</span>
                                    </div>                                               
                                    <div className="flex flex-col px-5 py-6 bg-white border-l-[6px] border-[#059669] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(5,150,105,0.1)] transition-all duration-500 group/neto">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-[11px] font-bold text-[#059669] uppercase tracking-wider">Total neto</span>
                                            <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-md">
                                                <div className="w-1.5 h-1.5 bg-[#059669] rounded-full animate-pulse" />
                                                <span className="text-[10px] font-bold text-[#059669] uppercase tracking-wider">Siatc Live</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                                            <span className="text-2xl font-bold text-[#059669]/40 mt-1">S/</span>
                                            <span className="text-[27px] font-black tracking-tighter text-slate-800 group-hover/neto:text-[#059669] transition-colors duration-500">
                                                {grandTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mt-2">Cálculo oficial de auditoría</p>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 pt-6 mt-6 border-t border-border/50">
                                <button 
                                    onClick={handleExportExcel} 
                                    disabled={!selectedCas || tickets.length === 0} 
                                    className="w-full flex items-center justify-center gap-2 p-4 bg-background border border-border rounded-xl text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Download className="w-4 h-4" /> Exportar a Excel
                                </button>
                                <button 
                                    onClick={() => setShowCloseModal(true)} 
                                    disabled={!selectedCas || tickets.length === 0} 
                                    className="w-full flex items-center justify-center gap-2 p-4 bg-gradient-to-r from-primary to-indigo-600 text-white hover:opacity-90 text-sm font-bold rounded-xl transition-all shadow-xl shadow-primary/20 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Lock className="w-4 h-4" /> Cerrar quincena
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Tabs y Listado */}
                    <div className="xl:col-span-3 flex flex-col bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                        <div className="flex p-2 bg-muted/20 border-b border-border/40">
                            <button onClick={() => setActiveTab('services')} className={cn("flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl transition-all", activeTab === 'services' ? "bg-background text-primary shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:bg-background/40")}>
                                <Briefcase className="w-4 h-4" /> Servicios realizados ({tickets.length})
                            </button>
                            <button onClick={() => setActiveTab('penalties')} className={cn("flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl transition-all", activeTab === 'penalties' ? "bg-background text-red-600 shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:bg-background/40")}>
                                <AlertTriangle className="w-4 h-4" /> Penalidades aplicadas ({penalties.length})
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-5 custom-scrollbar">
                            {!selectedCas ? (
                                <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-30">
                                    <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mb-6"><Building2 className="w-10 h-10" /></div>
                                    <h3 className="text-lg font-black">Esperando selección</h3>
                                    <p className="text-xs font-bold max-w-[250px] mt-2">Seleccione una empresa y el rango de fechas para visualizar la auditoría.</p>
                                </div>
                            ) : activeTab === 'services' ? (
                                <div className="space-y-4">
                                    {tickets.length === 0 ? (
                                        <div className="py-24 text-center opacity-40"><FileText className="w-12 h-12 mx-auto mb-4" /><p className="text-xs font-bold">No se detectaron servicios en el rango seleccionado</p></div>
                                    ) : (
                                        sortedDates.map(date => (
                                            <div key={date} className="bg-background/40 rounded-xl border border-border overflow-hidden group hover:border-primary/20 transition-all">
                                                <button onClick={() => toggleDate(date)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/10 font-bold text-[11px] text-muted-foreground transition-all">
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/60 rounded-lg text-foreground"><Calendar className="w-4 h-4 opacity-40" /><span>{date}</span></div>
                                                        <span className="opacity-20">|</span>
                                                        <span>{groupedTickets[date].count} servicios</span>
                                                        {groupedTickets[date].zeroPriceCount > 0 && <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-lg flex items-center gap-1 text-[9px] border border-amber-100"><AlertCircle className="w-3.5 h-3.5" />{groupedTickets[date].zeroPriceCount} Sin tarifa</span>}
                                                    </div>
                                                    <div className="flex items-center gap-5">
                                                        <span className="text-foreground text-sm tracking-tight font-black">S/ {(groupedTickets[date].totalBase + groupedTickets[date].totalAdicional).toLocaleString()}</span>
                                                        <ChevronRight className={cn("w-5 h-5 transition-transform duration-300", expandedDates.includes(date) && "rotate-90 text-primary")} />
                                                    </div>
                                                </button>
                                                {expandedDates.includes(date) && (
                                                    <div className="border-t border-border/40 animate-in slide-in-from-top-2 duration-300">
                                                        <table className="w-full text-left text-xs"><thead className="bg-muted/20 border-b border-border/40"><tr><th className="px-6 py-4 font-bold text-[10px] text-muted-foreground">ID Ticket</th><th className="px-6 py-4 font-bold text-[10px] text-muted-foreground">Servicio</th><th className="px-6 py-4 font-bold text-[10px] text-muted-foreground">Categoría</th><th className="px-6 py-4 font-bold text-[10px] text-muted-foreground text-right">Subtotal</th><th className="px-6 py-4"></th></tr></thead>
                                                        <tbody className="divide-y divide-border/20">{groupedTickets[date].tickets.map((ticket) => (
                                                            <tr key={ticket.Ticket} className="hover:bg-primary/[0.02] transition-colors group/row">
                                                                <td className="px-6 py-4 font-black text-primary text-sm tracking-tighter">{ticket.Ticket}</td>
                                                                <td className="px-6 py-4"><div className="flex flex-col gap-0.5"><span className="font-bold text-foreground text-sm">{toTitleCase(ticket.ServicioNombre || 'General')}</span><span className="text-[10px] font-medium opacity-40">{ticket.Servicio}</span></div></td>
                                                                <td className="px-6 py-4"><span className="px-2.5 py-1 bg-muted rounded-md font-bold text-[9px] border border-border/40">{toTitleCase(ticket.Categoria)}</span></td>
                                                                <td className="px-6 py-4 text-right">{ticket.TarifaBase === 0 ? <button onClick={() => handleOpenTarifarioModal(ticket)} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[9px] font-black hover:scale-105 active:scale-95 transition-all shadow-md shadow-amber-500/20">Vincular tarifa</button> : <span className="font-black text-sm tracking-tighter">S/ {(ticket.TarifaBase + (ticket.Adicionales || 0)).toLocaleString()}</span>}</td>
                                                                <td className="px-6 py-4 text-right"><button onClick={() => setShowPenaltyModal({ show: true, type: 'penalty', ticket: ticket.Ticket, date: ticket.Fecha.split('T')[0] })} className="p-2.5 bg-red-500/10 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all opacity-0 group-hover/row:opacity-100 shadow-sm" title="Aplicar Penalidad"><AlertTriangle className="w-4 h-4" /></button></td>
                                                            </tr>
                                                        ))}</tbody></table>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {penalties.length > 0 ? (
                                        <div className="grid grid-cols-1 gap-4">
                                            {penalties.map(penalty => (
                                                <div key={penalty.Id} className="bg-red-50/20 border border-red-100 rounded-2xl p-6 flex items-center justify-between hover:border-red-500/30 transition-all group">
                                                    <div className="flex items-center gap-6"><div className="p-4 bg-red-500 text-white rounded-xl shadow-lg shadow-red-500/20 group-hover:scale-110 transition-transform"><AlertTriangle className="w-6 h-6" /></div>
                                                    <div className="space-y-1"><div className="flex items-center gap-3"><span className="text-base font-black tracking-tight">{toTitleCase(penalty.Motivo)}</span><span className="px-2.5 py-1 bg-red-100 text-red-700 rounded-lg text-[10px] font-black">{penalty.Ticket || 'Descuento general'}</span></div>
                                                    <p className="text-xs text-muted-foreground font-medium opacity-70 leading-relaxed font-sans">{penalty.Descripcion}</p><p className="text-[10px] font-black text-muted-foreground opacity-40">{new Date(penalty.Fecha).toLocaleDateString()} • Auditado</p></div></div>
                                                    <div className="text-right"><p className="text-2xl font-black text-red-600 tracking-tighter">- S/ {penalty.Importe.toLocaleString()}</p><span className="text-[9px] font-black text-muted-foreground opacity-30 italic">Débito CAS</span></div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="py-24 text-center"><div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-100 shadow-sm"><CheckCircle2 className="w-10 h-10 text-emerald-500" /></div><h3 className="text-xl font-black">Sin observaciones</h3><p className="text-xs text-muted-foreground font-bold opacity-60 mt-2">No se han registrado penalizaciones en este periodo.</p></div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modales */}
            {showPenaltyModal.show && (
                <PenaltyModal 
                    isOpen={showPenaltyModal.show}
                    type={showPenaltyModal.type} 
                    ruc={selectedCas?.RUC || ''}
                    tickets={tickets}
                    initialTicket={showPenaltyModal.ticket}
                    initialDate={showPenaltyModal.date}
                    onSuccess={handleFetchValuation}
                    onClose={() => setShowPenaltyModal({show: false, type: 'penalty'})} 
                />
            )}
            
            {showTarifarioModal && (
                <TarifarioModal 
                    isOpen={showTarifarioModal}
                    onClose={() => setShowTarifarioModal(false)}
                    initialData={modalData}
                    onSuccess={handleFetchValuation}
                />
            )}

            {showCloseModal && (
                <Modal isOpen={showCloseModal} onClose={() => !isClosing && setShowCloseModal(false)} title="Confirmar Cierre de Operaciones">
                    <div className="p-8 space-y-8">
                        <div className="flex items-center gap-6 p-6 bg-amber-50 border border-amber-200 rounded-2xl"><div className="p-4 bg-amber-500 text-white rounded-xl shadow-lg shadow-amber-500/20"><AlertCircle className="w-8 h-8" /></div>
                        <div className="space-y-1"><h4 className="text-lg font-black tracking-tight">Bloqueo de Quincena</h4><p className="text-xs text-muted-foreground font-bold leading-relaxed">Esta acción es irreversible. Se bloquearán todos los tickets y descuentos del periodo <span className="text-foreground font-black underline">{startDate} / {endDate}</span>.</p></div></div>
                        <div className="grid grid-cols-2 gap-4"><div className="p-6 bg-muted/20 rounded-2xl border border-border/40"><span className="text-[10px] font-black text-muted-foreground block mb-2 opacity-50">Ingresos (bruto)</span><span className="text-2xl font-black tracking-tighter">S/ {totalTickets.toLocaleString()}</span></div>
                        <div className="p-6 bg-red-50 rounded-2xl border border-red-100"><span className="text-[10px] font-black text-red-600/60 block mb-2">Egresos (penalidades)</span><span className="text-2xl font-black text-red-600 tracking-tighter">- S/ {totalPenalties.toLocaleString()}</span></div></div>
                        <div className="pt-4 flex justify-end gap-4"><button onClick={() => setShowCloseModal(false)} disabled={isClosing} className="px-8 py-4 text-[11px] font-black text-muted-foreground hover:bg-muted rounded-xl transition-all">Regresar</button>
                        <button onClick={handleCloseFortnightCurrent} disabled={isClosing} className="px-10 py-4 bg-foreground text-background font-black text-[11px] rounded-xl shadow-2xl hover:opacity-90 active:scale-95 transition-all flex items-center gap-3">
                        {isClosing && <Activity className="w-4 h-4 animate-spin" />} {isClosing ? "Cerrando..." : "Confirmar cierre final"}
                        </button></div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function StatCard({ title, value, subtitle, icon, color }: any) {
    const colorClasses: any = { blue: "bg-blue-500", red: "bg-red-500", emerald: "bg-emerald-500", amber: "bg-amber-500" };
    return (
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:translate-y-[-4px] transition-all group overflow-hidden relative">
            <div className={`absolute top-0 right-0 w-32 h-32 ${colorClasses[color]} opacity-[0.05] rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700`} />
            <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between"><div className={`p-3 rounded-xl ${colorClasses[color]}/10 text-${color}-600 shadow-sm border border-${color}-500/10`}>{icon}</div></div>
                <div className="space-y-1"><p className="text-[10px] font-bold text-muted-foreground/60">{title}</p><p className="text-2xl font-black tracking-tight text-foreground">{value}</p></div>
                <p className="text-[10px] font-bold text-muted-foreground opacity-60 flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" />{subtitle}</p>
            </div>
        </div>
    );
}
