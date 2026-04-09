import { useState, useEffect, useRef } from 'react';
import { Search, Filter, Calendar, ChevronRight, Calculator, Download, AlertTriangle, CheckCircle2, FileText, X, ChevronDown, Briefcase, Building2, Check, Activity } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ApiClient } from '../services/apiClient';
import type { CAS, ValuationTicket, Penalty } from '../types';
import { cn } from '../utils/cn';
import { useDialog } from '../context/DialogContext';
import PenaltyModal from '../components/penalties/PenaltyModal';
import { PlusCircle, Lock, AlertCircle } from 'lucide-react';
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
    const [showPenaltyModal, setShowPenaltyModal] = useState<{show: boolean, type: 'penalty' | 'additional'}>({show: false, type: 'penalty'});
    const [expandedDates, setExpandedDates] = useState<string[]>([]);
    const [showTarifarioModal, setShowTarifarioModal] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [modalData, setModalData] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'services' | 'penalties'>('services');

    // Estado para el Dropdown Custom
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
        if (!selectedCas) return;
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
            ...tickets.map(t => [
                t.Ticket, 
                new Date(t.Fecha).toLocaleDateString(), 
                t.ServicioNombre || t.Servicio, 
                t.Categoria, 
                t.TarifaBase, 
                (t.Adicionales || 0), 
                (t.TarifaBase + (t.Adicionales || 0))
            ])
        ];

        const penaltiesData = [
            ["ID", "FECHA", "MOTIVO", "DESCRIPCIÓN", "TICKET REF.", "ESTADO", "IMPORTE"],
            ...penalties.map(p => [
                p.Id, 
                new Date(p.Fecha).toLocaleDateString(), 
                p.Motivo, 
                p.Descripcion, 
                p.Ticket || '-', 
                p.Estado, 
                -p.Importe
            ])
        ];

        const wb = XLSX.utils.book_new();
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen");
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
        <div className="flex flex-col h-full gap-6 animate-in fade-in duration-500 p-2">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-foreground">Valorizaciones CAS</h1>
                    <p className="text-muted-foreground text-sm font-medium">Gestión quincenal de pagos y descuentos.</p>
                </div>
                {selectedCas && (
                    <div className="flex items-center gap-3 bg-primary/10 border border-primary/20 px-4 py-2 rounded-lg shadow-sm">
                        <div className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse" />
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Gestionando</span>
                            <span className="text-sm font-black tracking-tight">{selectedCas.Nombre_CAS}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Selector de CAS Custom Moderno */}
            <div className="relative" ref={dropdownRef}>
                <div 
                    className={cn(
                        "bg-card rounded-xl border border-border shadow-sm p-1 flex items-center gap-2 transition-all group hover:border-primary/30",
                        isDropdownOpen && "ring-2 ring-primary/5 border-primary/40"
                    )}
                >
                    <div className="p-3.5 bg-primary/10 rounded-2xl text-primary transition-transform group-hover:scale-105">
                        <Building2 className="w-6 h-6" />
                    </div>
                    
                    <button 
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="flex-1 text-left px-3 py-1.5"
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 mb-0.5">Seleccionar Centro de Atención (CAS)</p>
                        <p className={cn(
                            "text-lg font-black tracking-tight flex items-center gap-2",
                            !selectedCas && "text-muted-foreground/30 italic"
                        )}>
                            {selectedCas ? selectedCas.Nombre_CAS : "-- Localice una empresa en la lista --"}
                            {selectedCas && <span className="text-xs font-bold text-muted-foreground opacity-40">(RUC: {selectedCas.RUC})</span>}
                        </p>
                    </button>

                    {selectedCas && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedCas(null); handleFetchValuation(); }}
                            className="p-3 text-muted-foreground hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                    
                    <div className="p-3">
                        <ChevronDown className={cn("w-5 h-5 text-muted-foreground/30 transition-transform duration-300", isDropdownOpen && "rotate-180 text-primary")} />
                    </div>
                </div>

                {/* Popover del Selector */}
                {isDropdownOpen && (
                    <div className="absolute top-full left-0 mt-3 w-full bg-card border border-border/50 rounded-[2.5rem] shadow-2xl shadow-black/20 z-[100] animate-in fade-in zoom-in-95 duration-200 overflow-hidden backdrop-blur-2xl">
                        <div className="p-5 border-b border-border/40">
                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <input 
                                    autoFocus
                                    type="text" 
                                    placeholder="Buscar por nombre o RUC..."
                                    className="w-full bg-muted/30 border border-transparent rounded-[1.2rem] pl-11 pr-5 py-3.5 text-sm font-bold focus:bg-background focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-all"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="max-h-[350px] overflow-y-auto p-3 custom-scrollbar space-y-1">
                            {filteredCasList.map(cas => (
                                <button 
                                    key={cas.RUC}
                                    onClick={() => {
                                        setSelectedCas(cas);
                                        setIsDropdownOpen(false);
                                        setSearchQuery('');
                                    }}
                                    className={cn(
                                        "w-full flex items-center justify-between px-6 py-4 rounded-[1.5rem] transition-all group",
                                        selectedCas?.RUC === cas.RUC 
                                            ? "bg-primary text-white shadow-lg shadow-primary/25" 
                                            : "hover:bg-primary/5 text-foreground/80 hover:translate-x-1"
                                    )}
                                >
                                    <div className="flex flex-col gap-0.5 text-left">
                                        <span className="text-sm font-black tracking-tight">{cas.Nombre_CAS}</span>
                                        <span className={cn("text-[10px] font-bold opacity-60", selectedCas?.RUC === cas.RUC ? "text-white" : "text-muted-foreground")}>RUC: {cas.RUC}</span>
                                    </div>
                                    {selectedCas?.RUC === cas.RUC && <Check className="w-4 h-4" />}
                                </button>
                            ))}
                            {filteredCasList.length === 0 && (
                                <div className="py-12 text-center">
                                    <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-border/50">
                                        <Building2 className="w-8 h-8 text-muted-foreground opacity-20" />
                                    </div>
                                    <p className="text-sm font-black text-muted-foreground opacity-40 uppercase tracking-widest">No se encontraron CAS</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 min-h-0">
                {!selectedCas ? (
                    <div className="h-full bg-card rounded-xl border border-border border-dashed flex flex-col items-center justify-center p-12 text-center shadow-sm relative overflow-hidden group">
                        <div className="absolute inset-0 bg-primary/[0.01] group-hover:bg-primary/[0.02] transition-colors" />
                        <div className="w-24 h-24 bg-primary/5 rounded-full flex items-center justify-center mb-8 border border-primary/10 relative">
                            <Search className="w-10 h-10 text-primary opacity-40" />
                            <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping opacity-20 duration-[2000ms]" />
                        </div>
                        <h3 className="text-2xl font-black tracking-tight">Seleccione una Empresa</h3>
                        <p className="text-muted-foreground max-w-xs mt-3 leading-relaxed font-bold opacity-60">Para comenzar la auditoría, localice la sede CAS en el buscador superior.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6 h-full">
                        <div className="bg-card rounded-[2rem] border border-border/60 p-6 shadow-sm flex flex-wrap items-end gap-6">
                                <div className="space-y-2.5">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-2">Inicio de Periodo</label>
                                    <div className="relative group">
                                        <input 
                                            type="date" 
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="bg-background border border-border rounded-md pl-10 pr-4 py-2 text-sm font-medium focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all shadow-sm"
                                        />
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                                    </div>
                                </div>
                                <div className="space-y-2.5">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 ml-2">Fin de Periodo</label>
                                    <div className="relative group">
                                        <input 
                                            type="date" 
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="bg-background border border-border rounded-2xl pl-12 pr-5 py-3.5 text-sm font-bold focus:ring-4 focus:ring-primary/5 focus:border-primary/20 outline-none transition-all shadow-sm"
                                        />
                                        <Calendar className="absolute left-4.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-muted-foreground/40 group-focus-within:text-primary transition-colors" />
                                    </div>
                                </div>
                                <button 
                                    onClick={handleFetchValuation}
                                    disabled={loadingData}
                                    className="bg-primary text-primary-foreground px-6 py-2 rounded-md font-bold text-sm transition-all flex items-center gap-2 disabled:opacity-50 shadow-sm"
                                >
                                    {loadingData ? <Activity className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" /> }
                                    {loadingData ? "Cargando..." : "Consultar Valorización"}
                                </button>
                        </div>

                        {/* El resto del contenido (Tablas, Resumen, etc.) se mantiene pero con estilos suavizados */}
                        <div className="flex-1 grid grid-cols-1 xl:grid-cols-4 gap-6 min-h-0">
                            {/* Panel Izquierdo: Resumen y Acciones */}
                            <div className="xl:col-span-1 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                                <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Resumen de Cuenta</h3>
                                        <Calculator className="w-4 h-4 text-primary" />
                                    </div>
                                    
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center p-3 bg-muted/20 rounded-lg border border-border/30">
                                             <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Servicios</span>
                                             <span className="text-base font-black tracking-tight">S/ {totalTickets.toLocaleString()}</span>
                                         </div>
                                         <div className="flex justify-between items-center p-3 bg-red-50/50 rounded-lg border border-red-100">
                                             <span className="text-[10px] font-bold uppercase tracking-widest text-red-600">Penalidades</span>
                                             <span className="text-base font-black text-red-600 tracking-tight">- S/ {totalPenalties.toLocaleString()}</span>
                                         </div>                                               
                                         <div className="flex justify-between items-center p-4 bg-primary text-white rounded-xl shadow-md">
                                             <div className="flex flex-col">
                                                 <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Total Neto</span>
                                                 <span className="text-[10px] opacity-70">Periodo actual</span>
                                             </div>
                                             <span className="text-xl font-black tracking-tight">S/ {grandTotal.toLocaleString()}</span>
                                         </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-3 pt-4 border-t border-border/50">
                                        <button 
                                            onClick={handleExportExcel}
                                            className="w-full flex items-center justify-center gap-2 p-3.5 bg-muted/30 hover:bg-muted text-[10px] font-black uppercase tracking-widest rounded-xl transition-all border border-border/40"
                                        >
                                            <Download className="w-4 h-4" /> Exportar a Excel
                                        </button>
                                        <button 
                                            onClick={() => setShowCloseModal(true)}
                                            className="w-full flex items-center justify-center gap-2 p-3 bg-foreground text-background hover:opacity-90 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-sm"
                                        >
                                            <Lock className="w-3 h-3" /> Cerrar Quincena
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Panel Derecho: Tabs y Tablas */}
                            <div className="xl:col-span-3 flex flex-col bg-card border border-border rounded-xl overflow-hidden shadow-sm">
                                <div className="flex p-2 bg-muted/20 border-b border-border/40">
                                    <button 
                                        onClick={() => setActiveTab('services')}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-[0.15em] rounded-xl transition-all",
                                            activeTab === 'services' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:bg-background/40"
                                        )}
                                    >
                                        <Briefcase className="w-4 h-4" /> Servicios ({tickets.length})
                                    </button>
                                    <button 
                                        onClick={() => setActiveTab('penalties')}
                                        className={cn(
                                            "flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase tracking-[0.15em] rounded-xl transition-all",
                                            activeTab === 'penalties' ? "bg-background text-red-600 shadow-sm" : "text-muted-foreground hover:bg-background/40"
                                        )}
                                    >
                                        <AlertTriangle className="w-4 h-4" /> Penalidades ({penalties.length})
                                    </button>
                                </div>

                                <div className="flex-1 overflow-auto p-4 custom-scrollbar">
                                    {activeTab === 'services' ? (
                                        <div className="space-y-4">
                                            {sortedDates.map(date => (
                                                <div key={date} className="bg-background/50 rounded-xl border border-border overflow-hidden transition-all group hover:border-primary/20">
                                                    <button 
                                                        onClick={() => toggleDate(date)}
                                                        className="w-full flex items-center justify-between p-5 hover:bg-muted/10 transition-all font-black text-xs uppercase tracking-widest text-muted-foreground"
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-xl">
                                                                <Calendar className="w-4 h-4" />
                                                                <span>{date}</span>
                                                            </div>
                                                            <span className="opacity-40">•</span>
                                                            <span>{groupedTickets[date].count} Servicios</span>
                                                            {groupedTickets[date].zeroPriceCount > 0 && (
                                                                <span className="text-amber-600 bg-amber-50 px-2 py-1 rounded-lg flex items-center gap-1 text-[10px]">
                                                                    <AlertCircle className="w-3 h-3" />
                                                                    {groupedTickets[date].zeroPriceCount} Sin tarifa
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center gap-6">
                                                            <span className="text-foreground tracking-tight">S/ {(groupedTickets[date].totalBase + groupedTickets[date].totalAdicional).toLocaleString()}</span>
                                                            <ChevronRight className={cn("w-5 h-5 transition-transform duration-500", expandedDates.includes(date) && "rotate-90 text-primary")} />
                                                        </div>
                                                    </button>
                                                    
                                                    {expandedDates.includes(date) && (
                                                        <div className="border-t border-border animate-in slide-in-from-top duration-300">
                                                            <table className="w-full text-left text-xs">
                                                                <thead className="bg-muted/30 border-b border-border">
                                                                    <tr>
                                                                        <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-muted-foreground">Ticket</th>
                                                                        <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-muted-foreground">Servicio Realizado</th>
                                                                        <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-muted-foreground">Categoría</th>
                                                                        <th className="px-6 py-4 font-black text-[10px] uppercase tracking-widest text-muted-foreground text-right">Monto</th>
                                                                        <th className="px-6 py-4"></th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-border/50">
                                                                    {groupedTickets[date].tickets.map((ticket, idx) => (
                                                                        <tr key={ticket.Ticket} className="hover:bg-muted/5 transition-colors group/row">
                                                                            <td className="px-6 py-4 font-black text-primary text-sm tracking-tight">{ticket.Ticket}</td>
                                                                            <td className="px-6 py-4">
                                                                                <div className="flex flex-col gap-0.5">
                                                                                    <span className="font-bold text-foreground/80 line-clamp-1">{ticket.ServicioNombre || 'Servicio General'}</span>
                                                                                    <span className="text-[10px] font-bold text-muted-foreground opacity-50">{ticket.Servicio}</span>
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-6 py-4">
                                                                                <span className="px-2.5 py-1 bg-muted rounded-lg font-black text-[9px] uppercase tracking-widest border border-border/50">
                                                                                    {ticket.Categoria}
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-6 py-4 text-right">
                                                                                <div className="flex flex-col items-end">
                                                                                    {ticket.TarifaBase === 0 ? (
                                                                                        <button 
                                                                                            onClick={() => handleOpenTarifarioModal(ticket)}
                                                                                            className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md shadow-amber-500/20"
                                                                                        >
                                                                                            Vincular Tarifa
                                                                                        </button>
                                                                                    ) : (
                                                                                        <span className="font-black text-sm tracking-tight">S/ {(ticket.TarifaBase + (ticket.Adicionales || 0)).toLocaleString()}</span>
                                                                                    )}
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-6 py-4">
                                                                                <button 
                                                                                    onClick={() => setShowPenaltyModal({show: true, type: 'penalty'})}
                                                                                    className="p-2.5 bg-red-500/10 text-red-600 rounded-lg hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover/row:opacity-100"
                                                                                    title="Aplicar Sanción"
                                                                                >
                                                                                    <AlertTriangle className="w-4 h-4" />
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {penalties.length > 0 ? (
                                                <div className="grid grid-cols-1 gap-4">
                                                    {penalties.map(penalty => (
                                                        <div key={penalty.Id} className="bg-red-50/30 border border-red-200/30 rounded-xl p-5 flex items-center justify-between hover:border-red-500/30 transition-all group">
                                                            <div className="flex items-center gap-5">
                                                                <div className="p-3.5 bg-red-500/10 text-red-600 rounded-lg group-hover:scale-110 transition-transform shadow-sm">
                                                                    <AlertTriangle className="w-6 h-6" />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-3">
                                                                        <span className="text-sm font-black tracking-tight">{penalty.Motivo}</span>
                                                                        <span className="px-2 py-0.5 bg-red-500/10 text-red-600 rounded-lg text-[9px] font-black tracking-widest uppercase">
                                                                            {penalty.Ticket || 'General'}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground font-bold opacity-60 leading-relaxed">{penalty.Descripcion}</p>
                                                                    <p className="text-[9px] font-black uppercase text-muted-foreground opacity-40">{new Date(penalty.Fecha).toLocaleDateString()}</p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-xl font-black text-red-600 tracking-tighter">- S/ {penalty.Importe.toLocaleString()}</p>
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-40 italic">Auditado</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="py-24 text-center">
                                                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-100">
                                                        <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                                                    </div>
                                                    <h3 className="text-xl font-black">Operación Limpia</h3>
                                                    <p className="text-sm text-muted-foreground font-bold opacity-60 mt-2">No se han registrado penalidades en este periodo.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modales */}
            {showPenaltyModal.show && (
                <PenaltyModal 
                    isOpen={showPenaltyModal.show}
                    type={showPenaltyModal.type} 
                    ruc={selectedCas.RUC}
                    tickets={tickets}
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

            {/* Modal de Cierre de Quincena Premium */}
            {showCloseModal && (
                <Modal isOpen={showCloseModal} onClose={() => !isClosing && setShowCloseModal(false)} title="Cierre de Quincena">
                    <div className="p-8 space-y-8">
                        <div className="flex items-center gap-6 p-6 bg-amber-500/5 border border-amber-200/20 rounded-xl">
                            <div className="p-4 bg-amber-500/10 text-amber-600 rounded-lg">
                                <AlertCircle className="w-8 h-8" />
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-lg font-black tracking-tight">Confirmar Cierre de Operaciones</h4>
                                <p className="text-xs text-muted-foreground font-bold opacity-60 leading-relaxed">
                                    Esta acción bloqueará la edición de tickets y penalidades para el periodo <span className="text-foreground">{startDate}</span> al <span className="text-foreground">{endDate}</span>.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-5 bg-muted/20 rounded-xl border border-border/40">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-2 opacity-50">Total Bruto</span>
                                <span className="text-2xl font-black tracking-tighter">S/ {totalTickets.toLocaleString()}</span>
                            </div>
                            <div className="p-5 bg-red-500/5 rounded-xl border border-red-200/20">
                                <span className="text-[10px] font-black uppercase tracking-widest text-red-600/60 block mb-2">Penalidades</span>
                                <span className="text-2xl font-black text-red-600 tracking-tighter">S/ {totalPenalties.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end gap-4">
                            <button 
                                onClick={() => setShowCloseModal(false)}
                                disabled={isClosing}
                                className="px-8 py-3.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-xl transition-all"
                            >
                                Cancelar y Revisar
                            </button>
                            <button 
                                onClick={handleCloseFortnightCurrent}
                                disabled={isClosing}
                                className="px-10 py-3.5 bg-foreground text-background font-black text-[11px] uppercase tracking-widest rounded-xl shadow-xl shadow-black/10 hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
                            >
                                {isClosing && <Activity className="w-4 h-4 animate-spin" />}
                                {isClosing ? "Procesando Cierre..." : "Confirmar Cierre Final"}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}

function StatCard({ title, value, subtitle, icon, trend, trendUp, color }: any) {
    const colorClasses: any = {
        blue: "bg-blue-500",
        red: "bg-red-500",
        emerald: "bg-emerald-500",
        amber: "bg-amber-500"
    };

    return (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm hover:translate-y-[-2px] transition-all group overflow-hidden relative">
            <div className={`absolute top-0 right-0 w-32 h-32 ${colorClasses[color]} opacity-[0.05] rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700`} />
            <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                    <div className={`p-3 rounded-lg ${colorClasses[color]}/10 text-${color}-600 shadow-sm border border-${color}-500/10`}>
                        {icon}
                    </div>
                </div>
                <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">{title}</p>
                    <p className="text-2xl font-black tracking-tight text-foreground">{value}</p>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase opacity-60 flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {subtitle}
                </p>
            </div>
        </div>
    );
}
