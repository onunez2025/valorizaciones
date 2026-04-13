import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter, Calendar, ChevronRight, Calculator, Download, AlertTriangle, CheckCircle2, FileText, X, ChevronDown, Briefcase, Building2, Check, Activity, AlertCircle, Lock, ArrowUpDown, Package, History, BarChart2, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';
import { ApiClient } from '../services/apiClient';
import type { CAS, ValuationTicket, Penalty } from '../types';
import { cn } from '../utils/cn';
import { toTitleCase } from '../utils/formatters';
import { useDialog } from '../context/DialogContext';
import PenaltyModal from '../components/penalties/PenaltyModal';
import TarifarioModal from '../components/tarifario/TarifarioModal';
import MaterialRegisterModal from '../components/materials/MaterialRegisterModal';
import { Modal } from '../components/common/Modal';

const isValuable = (code?: string) => ['3120', '3121', '5120', '5121'].some(prefix => code?.startsWith(prefix));

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
    const [showTarifarioModal, setShowTarifarioModal] = useState<{show: boolean, data: any}>({show: false, data: null});
    const [showMaterialModal, setShowMaterialModal] = useState<{show: boolean, data: any}>({show: false, data: null});
    const [showCloseModal, setShowCloseModal] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [activeTab, setActiveTab] = useState<'services' | 'penalties'>('services');
    const [globalSearch, setGlobalSearch] = useState('');
    const [globalSearchResult, setGlobalSearchResult] = useState<any>(null);
    const [isSearchingGlobal, setIsSearchingGlobal] = useState(false);
    
    // Historial de Cierres
    const [viewMode, setViewMode] = useState<'current' | 'history'>('current');
    const [closures, setClosures] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [selectedClosure, setSelectedClosure] = useState<any | null>(null);
    const [closureDetails, setClosureDetails] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [detailSearchQuery, setDetailSearchQuery] = useState('');
    const [detailActiveTab, setDetailActiveTab] = useState<'services' | 'penalties'>('services');

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [detailSort, setDetailSort] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: '', direction: null });

    const handleDetailSort = (key: string) => {
        setDetailSort(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const getSortedTickets = (tickets: ValuationTicket[]) => {
        if (!detailSort.key || !detailSort.direction) return tickets;

        return [...tickets].sort((a, b) => {
            let valA: any = a[detailSort.key as keyof ValuationTicket];
            let valB: any = b[detailSort.key as keyof ValuationTicket];

            if (detailSort.key === 'Ticket') {
                valA = Number(valA);
                valB = Number(valB);
            } else if (detailSort.key === 'Subtotal') {
                valA = a.TarifaBase + (a.Adicionales || 0);
                valB = b.TarifaBase + (b.Adicionales || 0);
            } else if (detailSort.key === 'ServicioNombre') {
                valA = a.ServicioNombre || '';
                valB = b.ServicioNombre || '';
            }

            if (valA < valB) return detailSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return detailSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

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

    useEffect(() => {
        if (viewMode === 'history' && selectedCas) {
            handleFetchClosures();
        }
    }, [viewMode, selectedCas]);

    const handleSearchTicket = async () => {
        if (!globalSearch) return;
        setIsSearchingGlobal(true);
        try {
            const result = await ApiClient.request(`/tickets/find/${globalSearch}`);
            setGlobalSearchResult(result);
        } catch (err) { 
            setGlobalSearchResult({ error: 'Ticket no encontrado' }); 
        } finally { 
            setIsSearchingGlobal(false); 
        }
    };

    const handleFetchValuation = async () => {
        if (!selectedCas) {
            if (globalSearch) {
                handleSearchTicket();
                return;
            }
            alert({ message: "Por favor, seleccione un Centro de Atención (CAS) primero." });
            return;
        }
        setLoadingData(true);
        try {
            await Promise.all([
                ApiClient.request(`/valuations/${selectedCas.RUC}?start=${startDate}&end=${endDate}`).then(setTickets),
                ApiClient.request(`/penalties/${selectedCas.RUC}?start=${startDate}&end=${endDate}`).then(setPenalties)
            ]);
        } catch (error) {
            console.error("Error fetching valuation:", error);
            alert({ message: "No se pudo cargar la información de la valorización." });
        } finally {
            setLoadingData(false);
        }
    };

    const handleFetchClosures = async () => {
        setLoadingHistory(true);
        try {
            const data = await ApiClient.request('/closures');
            setClosures(data);
        } catch (error) {
            console.error("Error fetching closures:", error);
            alert({ message: "No se pudo cargar el historial de cierres." });
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleViewClosureDetails = async (closure: any) => {
        setSelectedClosure(closure);
        setLoadingDetails(true);
        try {
            const data = await ApiClient.request(`/closures/${closure.IdCierre}/details`);
            setClosureDetails(data);
        } catch (error) {
            console.error("Error fetching closure details:", error);
            alert({ message: "No se pudo cargar el detalle del cierre." });
        } finally {
            setLoadingDetails(false);
        }
    };

    const filteredCasList = casList.filter(cas => 
        cas.Nombre_CAS.toLowerCase().includes(searchQuery.toLowerCase()) || 
        cas.RUC.includes(searchQuery)
    );

    const totalTickets = tickets.reduce((sum, t) => sum + (isValuable(t.CodigoEquipo) ? (t.TarifaBase + (t.Adicionales || 0)) : 0), 0);
    const totalPenalties = penalties.reduce((sum, p) => sum + p.Importe, 0);
    const grandTotal = totalTickets - totalPenalties;

    const handleCloseFortnightCurrent = async () => {
        if (!selectedCas) return;
        setIsClosing(true);

        const ticketDetails = tickets.map(t => ({
            ticket: t.Ticket,
            monto: t.TarifaBase + (t.Adicionales || 0),
            fecha: t.Fecha,
            tipo: 'SERVICIO',
            servicio: t.ServicioNombre || t.Servicio,
            categoria: t.Categoria,
            fechaVisita: t.FechaVisita,
            fechaCierre: t.FechaCierre || t.Fecha,
            diasDiferencia: t.DiasDiferencia,
            codigoExterno: t.CodigoEquipo,
            tarifaBase: t.TarifaBase,
            adicionales: (t.Adicionales || 0)
        }));

        const penaltyDetails = penalties.map(p => ({
            ticket: p.Ticket || 'G-DESCUENTO',
            monto: -p.Importe,
            fecha: p.Fecha,
            tipo: 'PENALIDAD',
            servicio: p.Motivo,
            categoria: 'DESCUENTO'
        }));

        try {
            const result = await ApiClient.request('/valuations/close', {
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
                    cerradoPor: "Auditor CAS",
                    details: [...ticketDetails, ...penaltyDetails]
                })
            });
            setShowCloseModal(false);
            alert({ 
                title: "¡Cerrado!", 
                message: `La quincena se ha cerrado correctamente con el código: ${result.codigo}`, 
                type: 'success' 
            });
            handleFetchValuation();
        } catch (error) {
            console.error("Error closing fortnight:", error);
            alert({ message: "No se pudo cerrar la quincena. Intente nuevamente." });
        } finally {
            setIsClosing(false);
        }
    };

    const groupedTickets = tickets.reduce((acc, ticket) => {
        const dateStr = new Date(ticket.Fecha).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
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
        if (ticket.TarifaBase === 0 && isValuable(ticket.CodigoEquipo) && (ticket.DiasDiferencia || 0) < 3 && !(ticket.ServicioNombre || '').toLowerCase().includes('visita')) {
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
            ["Servicios de Instalación/Reparación", tickets.filter(t => isValuable(t.CodigoEquipo)).length, totalTickets],
            ["Servicios Exentos", tickets.filter(t => !isValuable(t.CodigoEquipo)).length, 0],
            ["Penalidades y Descuentos", penalties.length, -totalPenalties],
            [""],
            ["TOTAL NETO A PAGAR", "", grandTotal]
        ];
        const servicesData = [
            ["TICKET", "Fecha Visita", "FECHA CIERRE", "Dias Diferencia", "SERVICIO", "Codigo Externo", "CATEGORÍA", "TARIFA BASE", "ADICIONALES", "TOTAL"],
            ...tickets.map(t => [
                t.Ticket, 
                t.FechaVisita ? new Date(t.FechaVisita).toLocaleDateString('es-PE', { timeZone: 'UTC' }) : '-', 
                t.FechaCierre ? new Date(t.FechaCierre).toLocaleDateString('es-PE', { timeZone: 'UTC' }) : new Date(t.Fecha).toLocaleDateString('es-PE', { timeZone: 'UTC' }),
                t.DiasDiferencia ?? '-',
                t.ServicioNombre || t.Servicio, 
                t.CodigoEquipo || '-',
                t.Categoria, 
                t.TarifaBase, 
                (t.Adicionales || 0), 
                (t.TarifaBase + (t.Adicionales || 0))
            ])
        ];
        const penaltiesData = [
            ["ID", "FECHA", "MOTIVO", "DESCRIPCIÓN", "TICKET REF.", "ESTADO", "IMPORTE"],
            ...penalties.map(p => [p.Id, new Date(p.Fecha).toLocaleDateString('es-PE', { timeZone: 'UTC' }), p.Motivo, p.Descripcion, p.Ticket || '-', p.Estado, -p.Importe])
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "Resumen");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(servicesData), "Detalle Servicios");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(penaltiesData), "Detalle Penalidades");
        XLSX.writeFile(wb, `Valorizacion_${selectedCas.Nombre_CAS.replace(/\s/g, '_')}_${startDate}.xlsx`);
    };
    
    const handleExportClosureExcel = () => {
        if (!selectedClosure || closureDetails.length === 0) return;
        
        const services = closureDetails.filter(d => d.Tipo === 'SERVICIO');
        const penalties = closureDetails.filter(d => d.Tipo === 'PENALIDAD');

        // Calcular desglose diario para la pestaña de resumen
        const dailyMap: Record<string, { count: number, sum: number }> = {};
        services.forEach(s => {
            const dateStr = s.FechaVisita ? new Date(s.FechaVisita).toLocaleDateString('es-PE', { timeZone: 'UTC' }) : new Date(s.Fecha_Ticket).toLocaleDateString('es-PE', { timeZone: 'UTC' });
            if (!dailyMap[dateStr]) dailyMap[dateStr] = { count: 0, sum: 0 };
            dailyMap[dateStr].count++;
            dailyMap[dateStr].sum += s.Monto;
        });

        const breakdownRows = Object.entries(dailyMap)
            .sort((a, b) => {
                const [d1, m1, y1] = a[0].split('/').map(Number);
                const [d2, m2, y2] = b[0].split('/').map(Number);
                return new Date(y1, m1 - 1, d1).getTime() - new Date(y2, m2 - 1, d2).getTime();
            })
            .map(([date, data]) => [
                date, 
                data.count, 
                `S/ ${data.sum.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
            ]);

        const summaryData = [
            ["REPORTE DE CIERRE DE VALORIZACIÓN", ""],
            ["CÓDIGO:", selectedClosure.Codigo_Valorizacion],
            ["CAS:", selectedClosure.Nombre_CAS],
            ["Periodo:", `${new Date(selectedClosure.Fecha_Inicio).toLocaleDateString()} al ${new Date(selectedClosure.Fecha_Fin).toLocaleDateString()}`],
            ["Cerrado Por:", selectedClosure.Cerrado_Por],
            ["Fecha de Cierre:", new Date(selectedClosure.Cerrado_El).toLocaleString()],
            [],
            ["CONCEPTO", "CANTIDAD", "TOTAL"],
            ["Servicios Realizados", services.length, `S/ ${selectedClosure.Subtotal_Servicios.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
            ["Penalidades y Descuentos", penalties.length, `-S/ ${selectedClosure.Subtotal_Penalidades.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
            ["TOTAL LIQUIDADO", "", `S/ ${selectedClosure.Total_Final.toLocaleString('en-US', { minimumFractionDigits: 2 })}`],
            [],
            [],
            ["Etiquetas de fila", "Cuenta de TICKET", "Suma de MONTO"],
            ...breakdownRows,
            ["Total general", services.length, `S/ ${selectedClosure.Subtotal_Servicios.toLocaleString('en-US', { minimumFractionDigits: 2 })}`]
        ];

        const servicesData = [
            ["TICKET", "Fecha Visita", "FECHA CIERRE", "Dias Diferencia", "SERVICIO", "Codigo Externo", "CATEGORÍA", "TARIFA BASE", "ADICIONALES", "TOTAL"],
            ...services.map(s => [
                s.Ticket,
                s.FechaVisita ? new Date(s.FechaVisita).toLocaleDateString('es-PE', { timeZone: 'UTC' }) : '-',
                s.FechaCierre ? new Date(s.FechaCierre).toLocaleDateString('es-PE', { timeZone: 'UTC' }) : '-',
                s.DiasDiferencia ?? '-',
                s.Servicio_Nombre,
                s.CodigoExterno || '-',
                s.Categoria,
                s.Tarifa_Base ?? s.Monto,
                s.Adicionales ?? 0,
                s.Monto
            ])
        ];

        const penaltiesData = [
            ["TICKET", "FECHA TICKET", "MOTIVO / DESCRIPCIÓN", "CATEGORÍA", "IMPORTE"],
            ...penalties.map(p => [
                p.Ticket,
                new Date(p.Fecha_Ticket).toLocaleDateString('es-PE', { timeZone: 'UTC' }),
                p.Servicio_Nombre,
                p.Categoria,
                p.Monto
            ])
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), "Resumen");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(servicesData), "Servicios");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(penaltiesData), "Penalidades");
        XLSX.writeFile(wb, `Cierre_${selectedClosure.Codigo_Valorizacion}_${selectedClosure.Nombre_CAS.replace(/\s/g, '_')}.xlsx`);
    };


    const handleOpenTarifarioModal = (ticket: ValuationTicket) => {
        setShowTarifarioModal({
            show: true,
            data: {
                casId: selectedCas?.ID_CAS || '',
                casNombre: selectedCas?.Nombre_CAS || '',
                categoria: ticket.Categoria,
                servicio: ticket.Servicio,
                servicioNombre: ticket.ServicioNombre || 'Servicio General'
            }
        });
    };

    const handleOpenMaterialModal = (ticket: ValuationTicket) => {
        setShowMaterialModal({
            show: true,
            data: {
                codigo: ticket.CodigoEquipo || '',
                nombre: ticket.NombreEquipo || ''
            }
        });
    };

    return (
        <div className="flex flex-col h-full gap-5 animate-in fade-in duration-500 p-1">
            {/* Cabecera */}
            <div className="flex items-center justify-between px-1">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Valorizaciones CAS</h1>
                    <p className="text-muted-foreground text-sm">Gestión quincenal de pagos y descuentos.</p>
                </div>

                <div className="flex bg-muted/30 p-1 rounded-2xl border border-border/50">
                    <button 
                        onClick={() => setViewMode('current')}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black transition-all",
                            viewMode === 'current' ? "bg-white text-primary shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:bg-white/40"
                        )}
                    >
                        <BarChart2 className="w-4 h-4" /> Generar
                    </button>
                    <button 
                        onClick={() => { setViewMode('history'); handleFetchClosures(); }}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black transition-all",
                            viewMode === 'history' ? "bg-white text-primary shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:bg-white/40"
                        )}
                    >
                        <History className="w-4 h-4" /> Historial
                    </button>
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
                                <span className="text-sm font-bold">{new Date(globalSearchResult.Fecha).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</span>
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
                            <p className="text-[13px] font-medium text-muted-foreground mb-0">Empresa (CAS)</p>
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
                    <div className="flex items-center gap-2 px-3 py-2 bg-background rounded-lg border border-border shadow-sm">
                        <Calendar className="w-4 h-4 text-primary" />
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-black focus:ring-0 p-0" 
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)} 
                        />
                        <span className="text-muted-foreground opacity-30 mx-1">/</span>
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-xs font-black focus:ring-0 p-0" 
                            value={endDate} 
                            onChange={(e) => setEndDate(e.target.value)} 
                        />
                    </div>
                </div>

                <button 
                    onClick={handleFetchValuation}
                    disabled={loadingData}
                    className="bg-primary text-white p-3 rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center disabled:opacity-50"
                >
                    {loadingData ? <Activity className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                </button>

                <div className="h-8 w-px bg-border mx-1" />

                <div className="flex-1 relative">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-40" />
                        <input 
                            type="text" 
                            placeholder="Buscar ticket específico en todo el CAS..." 
                            className="w-full pl-10 pr-4 py-2.5 bg-muted/20 border border-transparent rounded-xl text-xs font-bold focus:bg-background focus:border-primary/20 focus:ring-4 focus:ring-primary/5 outline-none transition-all h-11"
                            value={globalSearch}
                            onChange={(e) => setGlobalSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearchTicket()}
                        />
                        {isSearchingGlobal && (
                            <Activity className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />
                        )}
                    </div>
                </div>
            </div>

            {/* Contenido Principal */}
            {viewMode === 'current' ? (
                <div className="flex-1 min-h-0">
                    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-full pb-2">
                        {/* Resumen */}
                        <div className="xl:col-span-1 h-full">
                            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm h-full flex flex-col justify-between">
                                <div className="space-y-6">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-[11px] font-bold text-muted-foreground">Resumen de Cuenta</h3>
                                        <Calculator className="w-5 h-5 text-primary" />
                                    </div>
                                    
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center p-4 bg-muted/20 rounded-xl border border-border/30">
                                            <span className="text-[11px] font-bold text-muted-foreground">Servicios</span>
                                            <span className="text-base font-bold tracking-tight">S/ {totalTickets.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center p-4 bg-red-50/50 rounded-xl border border-red-100">
                                            <span className="text-[11px] font-bold text-red-600">Penalidades</span>
                                            <span className="text-base font-bold text-red-600 tracking-tight">- S/ {totalPenalties.toLocaleString()}</span>
                                        </div>                                               
                                        <div className="flex flex-col px-5 py-6 bg-white border-l-[6px] border-[#059669] rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(5,150,105,0.1)] transition-all duration-500 group/neto">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-[11px] font-bold text-[#059669]">Total Neto</span>
                                                <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-md">
                                                    <div className="w-1.5 h-1.5 bg-[#059669] rounded-full animate-pulse" />
                                                    <span className="text-[11px] font-bold text-[#059669]">Siatc Live</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                                                <span className="text-2xl font-bold text-[#059669]/40 mt-1">S/</span>
                                                <span className="text-[27px] font-black tracking-tighter text-slate-800 group-hover/neto:text-[#059669] transition-colors duration-500">
                                                    {grandTotal.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                            <p className="text-[11px] font-bold text-muted-foreground mt-2">Cálculo Oficial de Auditoría</p>
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
                                    <div className="h-full">
                                        {tickets.length === 0 ? (
                                            <div className="py-24 text-center opacity-40">
                                                <FileText className="w-12 h-12 mx-auto mb-4" />
                                                <p className="text-xs font-bold">No se detectaron servicios en el rango seleccionado</p>
                                            </div>
                                        ) : (
                                            <table className="w-full border-separate border-spacing-0">
                                                <thead className="bg-white sticky top-[-20px] z-30 border-b border-border shadow-sm">
                                                    <tr className="text-[15px] font-medium text-muted-foreground bg-white">
                                                        <th className="px-5 py-4 text-left">Fecha de Proceso</th>
                                                        <th className="px-5 py-4 text-center">Servicios</th>
                                                        <th className="px-5 py-4 text-center">Estado de Auditoría</th>
                                                        <th className="px-5 py-4 text-right">Acumulado Diario</th>
                                                        <th className="px-5 py-4 text-center w-10"></th>
                                                    </tr>
                                                </thead>
                                                    <tbody className="divide-y divide-border/10">
                                                        {sortedDates.map(date => (
                                                            <React.Fragment key={date}>
                                                                <tr 
                                                                    onClick={() => toggleDate(date)} 
                                                                    className={cn(
                                                                        "group cursor-pointer transition-all hover:bg-primary/[0.03] select-none",
                                                                        expandedDates.includes(date) ? "bg-primary/[0.02]" : ""
                                                                    )}
                                                                >
                                                                    <td className="px-5 py-4">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className={cn(
                                                                                "p-2 rounded-lg transition-all duration-300", 
                                                                                expandedDates.includes(date) ? "bg-primary text-white scale-110 shadow-lg shadow-primary/20" : "bg-muted/60 text-muted-foreground group-hover:bg-primary/20"
                                                                            )}>
                                                                                <Calendar className="w-4 h-4" />
                                                                            </div>
                                                                            <span className="text-sm font-medium tracking-tight">{date}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-5 py-4 text-center">
                                                                        <span className="px-3 py-1 bg-muted/60 rounded-full text-[11px] font-medium text-muted-foreground">
                                                                            {groupedTickets[date].count} servicios
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-5 py-4 text-center">
                                                                        <div className="flex justify-center">
                                                                            {groupedTickets[date].zeroPriceCount > 0 ? (
                                                                                <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-medium border border-amber-100 flex items-center gap-1.5 animate-pulse">
                                                                                    <AlertCircle className="w-3.5 h-3.5" />
                                                                                    {groupedTickets[date].zeroPriceCount} por vincular
                                                                                </span>
                                                                            ) : (
                                                                                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-medium border border-emerald-100 flex items-center gap-1.5">
                                                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                                                    Auditado
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-5 py-4 text-right">
                                                                        <span className="text-sm font-medium tracking-tighter">
                                                                            S/ {(groupedTickets[date].totalBase + groupedTickets[date].totalAdicional).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-5 py-4 text-center">
                                                                        <ChevronRight className={cn("w-5 h-5 transition-transform duration-300", expandedDates.includes(date) && "rotate-90 text-primary")} />
                                                                    </td>
                                                                </tr>

                                                                {expandedDates.includes(date) && (
                                                                    <tr>
                                                                        <td colSpan={5} className="p-0 border-b border-border/40 bg-muted/[0.03]">
                                                                            <div className="max-h-[480px] overflow-y-auto custom-scrollbar animate-in slide-in-from-top-4 duration-500 shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)]">
                                                                                <table className="w-full border-collapse">
                                                                                    <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-md shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
                                                                                        <tr className="text-sm font-medium text-muted-foreground border-b border-border/30">
                                                                                            <th onClick={() => handleDetailSort('Ticket')} className="px-5 py-3 text-left cursor-pointer hover:text-primary transition-colors">
                                                                                                <div className="flex items-center gap-1">Ticket <ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                                                                                            </th>
                                                                                            <th className="px-2 py-3 text-center text-[10px] uppercase tracking-wider opacity-50">Visita / Cierre</th>
                                                                                            <th className="px-2 py-3 text-center text-[10px] uppercase tracking-wider opacity-50">Días</th>
                                                                                            <th onClick={() => handleDetailSort('ServicioNombre')} className="px-6 py-3 text-left cursor-pointer hover:text-primary transition-colors">
                                                                                                <div className="flex items-center gap-1">Servicio Realizado <ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                                                                                            </th>
                                                                                            <th onClick={() => handleDetailSort('Categoria')} className="px-6 py-3 text-left cursor-pointer hover:text-primary transition-colors">
                                                                                                <div className="flex items-center gap-1">Categoría <ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                                                                                            </th>
                                                                                            <th onClick={() => handleDetailSort('Subtotal')} className="px-6 py-3 text-right cursor-pointer hover:text-primary transition-colors">
                                                                                                <div className="flex items-center gap-1 justify-end">Subtotal <ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                                                                                            </th>
                                                                                            <th className="px-6 py-3 text-right">Acciones</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody className="divide-y divide-border/10">
                                                                                        {getSortedTickets(groupedTickets[date].tickets).map((ticket) => (
                                                                                            <tr key={ticket.Ticket} className="hover:bg-primary/[0.01] transition-colors group/row">
                                                                                                <td className="px-5 py-4 font-medium text-primary text-sm tracking-tighter cursor-default">{ticket.Ticket}</td>
                                                                                                <td className="px-2 py-4 text-center">
                                                                                                    <div className="flex flex-col items-center">
                                                                                                        <span className="text-[10px] font-bold text-muted-foreground">{ticket.FechaVisita ? new Date(ticket.FechaVisita).toLocaleDateString('es-PE', {day:'2-digit', month:'2-digit'}) : '-'}</span>
                                                                                                        <span className="text-[10px] font-bold text-foreground">{ticket.FechaCierre ? new Date(ticket.FechaCierre).toLocaleDateString('es-PE', {day:'2-digit', month:'2-digit'}) : '-'}</span>
                                                                                                    </div>
                                                                                                </td>
                                                                                                <td className="px-2 py-4 text-center">
                                                                                                    <span className={cn(
                                                                                                        "px-2 py-0.5 rounded text-[10px] font-black",
                                                                                                        (ticket.DiasDiferencia || 0) > 2 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                                                                                                    )}>
                                                                                                        {ticket.DiasDiferencia ?? '-'}
                                                                                                    </span>
                                                                                                </td>
                                                                                                <td className="px-6 py-4">
                                                                                                    <span className="font-medium text-foreground text-sm">
                                                                                                        {toTitleCase(ticket.ServicioNombre || 'General')}
                                                                                                    </span>
                                                                                                </td>
                                                                                                <td className="px-6 py-4">
                                                                                                    <div className="flex flex-col">
                                                                                                        <span className="font-medium text-muted-foreground text-[10px] uppercase opacity-60">
                                                                                                            {ticket.CodigoEquipo}
                                                                                                        </span>
                                                                                                        <span className="font-bold text-foreground text-xs truncate max-w-[200px]" title={ticket.NombreEquipo}>
                                                                                                            {toTitleCase(ticket.Categoria)}
                                                                                                        </span>
                                                                                                    </div>
                                                                                                </td>
                                                                                                <td className="px-6 py-4 text-right">
                                                                                                    {!isValuable(ticket.CodigoEquipo) ? (
                                                                                                        <span className="text-[10px] font-bold text-muted-foreground/40 italic">Exento</span>
                                                                                                    ) : (ticket.ServicioNombre || '').toLowerCase().includes('visita') ? (
                                                                                                        <span className="text-[10px] font-bold text-muted-foreground/40 italic">Visita (S/ 0.00)</span>
                                                                                                    ) : ticket.Categoria === 'N/A' ? (
                                                                                                        (ticket.DiasDiferencia || 0) >= 3 ? (
                                                                                                            <span className="text-[10px] font-bold text-red-500 italic">Fuera de tiempo</span>
                                                                                                        ) : (
                                                                                                            <button 
                                                                                                                onClick={() => handleOpenMaterialModal(ticket)} 
                                                                                                                className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[9px] font-black hover:scale-105 active:scale-95 transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
                                                                                                            >
                                                                                                                <Package className="w-3 h-3" /> Registrar Prod.
                                                                                                            </button>
                                                                                                        )
                                                                                                    ) : ticket.TarifaBase === 0 ? (
                                                                                                        (ticket.DiasDiferencia || 0) >= 3 ? (
                                                                                                            <span className="font-bold text-sm tracking-tighter text-red-500">S/ 0.00</span>
                                                                                                        ) : (
                                                                                                            <button 
                                                                                                                onClick={() => handleOpenTarifarioModal(ticket)} 
                                                                                                                className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-[9px] font-black hover:scale-105 active:scale-95 transition-all shadow-md shadow-amber-500/20"
                                                                                                            >
                                                                                                                Vincular Tarifa
                                                                                                            </button>
                                                                                                        )
                                                                                                    ) : (
                                                                                                        <span className="font-bold text-sm tracking-tighter text-foreground/80">
                                                                                                            S/ {(ticket.TarifaBase + (ticket.Adicionales || 0)).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                                                                                        </span>
                                                                                                    )}
                                                                                                </td>
                                                                                                <td className="px-6 py-4 text-right">
                                                                                                    <button 
                                                                                                        onClick={() => setShowPenaltyModal({ show: true, type: 'penalty', ticket: ticket.Ticket, date: ticket.Fecha.split('T')[0] })} 
                                                                                                        className="p-2 bg-red-500/10 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all opacity-0 group-hover/row:opacity-100 shadow-sm" 
                                                                                                        title="Aplicar Penalidad"
                                                                                                    >
                                                                                                        <AlertTriangle className="w-4 h-4" />
                                                                                                    </button>
                                                                                                </td>
                                                                                            </tr>
                                                                                        ))}
                                                                                    </tbody>
                                                                                </table>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </React.Fragment>
                                                        ))}
                                                    </tbody>
                                                </table>
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
                                                        <p className="text-xs text-muted-foreground font-medium opacity-70 leading-relaxed font-sans">{penalty.Descripcion}</p><p className="text-[10px] font-black text-muted-foreground opacity-40">{new Date(penalty.Fecha).toLocaleDateString('es-PE', { timeZone: 'UTC' })} • Auditado</p></div></div>
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
            ) : (
                <div className="flex-1 bg-white border border-border rounded-2xl overflow-hidden shadow-sm flex flex-col">
                    <div className="flex-1 overflow-auto p-6">
                        {loadingHistory ? (
                             <div className="h-full flex items-center justify-center"><Activity className="w-8 h-8 animate-spin text-primary" /></div>
                        ) : closures.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center opacity-30">
                                <History className="w-16 h-16 mb-4" />
                                <p className="text-sm font-bold">No hay cierres registrados aún.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {closures.map((closure) => (
                                    <div key={closure.IdCierre} className="p-6 bg-card border border-border rounded-2xl hover:border-primary/50 transition-all group">
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-sm font-black text-primary bg-primary/5 px-2.5 py-1 rounded-lg">{closure.Codigo_Valorizacion || `ID-${closure.IdCierre}`}</span>
                                            <span className="text-[10px] font-black text-muted-foreground bg-muted px-2 py-0.5 rounded uppercase">Cerrado</span>
                                        </div>
                                        <div className="space-y-1 mb-4">
                                            <h4 className="font-black text-slate-800 text-lg">{closure.Nombre_CAS}</h4>
                                            <p className="text-xs font-bold text-muted-foreground opacity-60">Periodo: {new Date(closure.Fecha_Inicio).toLocaleDateString('es-PE', { timeZone: 'UTC' })} al {new Date(closure.Fecha_Fin).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</p>
                                        </div>
                                        <div className="flex gap-6 mb-6 border-t border-border/30 pt-4">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-muted-foreground opacity-40 uppercase tracking-widest">Servicios</span>
                                                <span className="text-xs font-black">{closure.Total_Servicios || 0} items</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-muted-foreground opacity-40 uppercase tracking-widest">Penalidades</span>
                                                <span className="text-xs font-black text-red-500">{closure.Total_Penalidades || 0} aplicadas</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div>
                                                <p className="text-xs font-bold text-muted-foreground mb-1 uppercase opacity-30">Total Neto</p>
                                                <p className="text-2xl font-black text-emerald-600 tracking-tighter">S/ {closure.Total_Final.toLocaleString()}</p>
                                            </div>
                                            <button 
                                                onClick={() => handleViewClosureDetails(closure)}
                                                className="p-3 bg-muted rounded-xl hover:bg-primary hover:text-white transition-all shadow-sm"
                                            >
                                                <Eye className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal de Detalle de Cierre */}
            {selectedClosure && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-5xl rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                        <div className="p-8 border-b border-border/50 bg-slate-50 flex items-center justify-between gap-6">
                            <div className="flex-1">
                                <h2 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                                    Detalle del Cierre
                                    <span className="text-sm font-black text-primary bg-white border border-primary/20 px-3 py-1 rounded-full">{selectedClosure.Codigo_Valorizacion}</span>
                                </h2>
                                <p className="text-xs font-bold text-muted-foreground mt-1">{selectedClosure.Nombre_CAS} • {new Date(selectedClosure.Fecha_Inicio).toLocaleDateString('es-PE', { timeZone: 'UTC' })} al {new Date(selectedClosure.Fecha_Fin).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</p>
                            </div>
                            
                            <div className="relative w-64 group">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                                <input 
                                    type="text"
                                    placeholder="Buscar ticket..."
                                    className="w-full pl-10 pr-4 py-2 bg-white border border-border rounded-xl text-xs font-bold outline-none ring-primary/5 focus:ring-4 focus:border-primary transition-all"
                                    value={detailSearchQuery}
                                    onChange={(e) => setDetailSearchQuery(e.target.value)}
                                />
                                {detailSearchQuery && (
                                    <button onClick={() => setDetailSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-red-500">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={handleExportClosureExcel}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                                >
                                    <Download className="w-4 h-4" /> Exportar Excel
                                </button>
                                
                                <button onClick={() => { setSelectedClosure(null); setDetailSearchQuery(''); setDetailActiveTab('services'); }} className="p-3 bg-white border border-border rounded-2xl hover:bg-muted transition-all">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        
                        <div className="px-8 bg-slate-50 border-b border-border/50 flex">
                            <button 
                                onClick={() => setDetailActiveTab('services')}
                                className={cn(
                                    "px-8 py-4 text-xs font-black transition-all border-b-2",
                                    detailActiveTab === 'services' ? "border-primary text-primary bg-white shadow-[0_-4px_10px_rgba(0,0,0,0.02)]" : "border-transparent text-muted-foreground hover:text-slate-600"
                                )}
                            >
                                Servicios Realizados ({closureDetails.filter(d => d.Tipo === 'SERVICIO').length})
                            </button>
                            <button 
                                onClick={() => setDetailActiveTab('penalties')}
                                className={cn(
                                    "px-8 py-4 text-xs font-black transition-all border-b-2",
                                    detailActiveTab === 'penalties' ? "border-red-500 text-red-600 bg-white shadow-[0_-4px_10px_rgba(0,0,0,0.02)]" : "border-transparent text-muted-foreground hover:text-slate-600"
                                )}
                            >
                                Penalidades y Descuentos ({closureDetails.filter(d => d.Tipo === 'PENALIDAD').length})
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto custom-scrollbar">
                            {loadingDetails ? (
                                <div className="h-64 flex items-center justify-center p-8"><Activity className="w-8 h-8 animate-spin text-primary" /></div>
                            ) : (
                                <>
                                <div className="px-8 py-4 bg-muted/5 border-b border-border/30 flex gap-8">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                                        <span className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Subtotal Servicios:</span>
                                        <span className="text-xs font-black">S/ {(selectedClosure.Subtotal_Servicios || 0).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-red-500" />
                                        <span className="text-[10px] font-black uppercase text-muted-foreground opacity-60">Total Penalidades:</span>
                                        <span className="text-xs font-black text-red-600">- S/ {(selectedClosure.Subtotal_Penalidades || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                                <table className="w-full border-separate border-spacing-0">
                                    <thead className="sticky top-0 z-20 bg-white border-b border-border shadow-sm">
                                        <tr className="text-[11px] font-black text-muted-foreground uppercase tracking-widest text-left">
                                            <th className="px-8 py-5 bg-white border-b border-border">Ticket</th>
                                            <th className="px-4 py-5 bg-white border-b border-border">Fecha</th>
                                            <th className="px-4 py-5 bg-white border-b border-border text-center">Tipo</th>
                                            <th className="px-4 py-5 bg-white border-b border-border">Descripción</th>
                                            <th className="px-8 py-5 bg-white border-b border-border text-right">Monto</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/10">
                                        {closureDetails
                                            .filter(d => detailActiveTab === 'services' ? d.Tipo === 'SERVICIO' : d.Tipo === 'PENALIDAD')
                                            .filter(d => 
                                                d.Ticket.toString().includes(detailSearchQuery) || 
                                                (d.Servicio_Nombre || '').toLowerCase().includes(detailSearchQuery.toLowerCase())
                                            ).map((det) => (
                                            <tr key={det.IdDetalle} className="hover:bg-muted/30 transition-all group/det">
                                                <td className="px-8 py-4 font-bold text-sm text-primary">{det.Ticket}</td>
                                                <td className="px-4 py-4 text-xs font-medium">{new Date(det.Fecha_Ticket).toLocaleDateString('es-PE', { timeZone: 'UTC' })}</td>
                                                <td className="px-4 py-4 text-center">
                                                    <span className={cn("px-2 py-0.5 rounded text-[10px] font-black uppercase", det.Tipo === 'SERVICIO' ? "bg-blue-100 text-blue-700" : "bg-red-500 text-white shadow-sm")}>
                                                        {det.Tipo}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <p className="text-xs font-bold truncate max-w-[400px]" title={det.Servicio_Nombre}>{det.Servicio_Nombre}</p>
                                                    <p className="text-[10px] text-muted-foreground font-medium">{det.Categoria}</p>
                                                </td>
                                                <td className="px-8 py-4 text-right">
                                                    <span className={cn("text-sm font-black tracking-tight", det.Monto < 0 ? "text-red-600" : "text-slate-800")}>
                                                        {det.Monto < 0 ? '-' : ''} S/ {Math.abs(det.Monto).toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {closureDetails
                                            .filter(d => detailActiveTab === 'services' ? d.Tipo === 'SERVICIO' : d.Tipo === 'PENALIDAD')
                                            .filter(d => d.Ticket.toString().includes(detailSearchQuery) || (d.Servicio_Nombre || '').toLowerCase().includes(detailSearchQuery.toLowerCase())).length === 0 && (
                                            <tr>
                                                <td colSpan={5} className="py-20 text-center text-muted-foreground opacity-40">
                                                    <Search className="w-10 h-10 mx-auto mb-3" />
                                                    <p className="text-xs font-bold">No hay {detailActiveTab === 'services' ? 'servicios' : 'penalidades'} que coincidan con la búsqueda</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                </>
                            )}
                        </div>
                        <div className="p-8 border-t border-border/50 bg-slate-50 flex items-center justify-between">
                            <div className="flex gap-8">
                                <div><p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-40">Cerrado por</p><p className="text-sm font-black text-slate-800">{selectedClosure.Cerrado_Por}</p></div>
                                <div><p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 opacity-40">Fecha de Cierre</p><p className="text-sm font-black text-slate-800">{new Date(selectedClosure.Cerrado_El).toLocaleString()}</p></div>
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-black text-muted-foreground opacity-30 uppercase tracking-widest mb-1">Total Liquidado</p>
                                <p className="text-4xl font-black text-emerald-600 tracking-tighter">S/ {selectedClosure.Total_Final.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modales Existentes */}
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
            
            {showMaterialModal.show && showMaterialModal.data && (
                <MaterialRegisterModal
                    isOpen={showMaterialModal.show}
                    initialData={showMaterialModal.data}
                    onClose={() => setShowMaterialModal({ show: false, data: null })}
                    onSuccess={handleFetchValuation}
                />
            )}

            {showTarifarioModal.show && showTarifarioModal.data && (
                <TarifarioModal
                    isOpen={showTarifarioModal.show}
                    initialData={showTarifarioModal.data}
                    onClose={() => setShowTarifarioModal({ show: false, data: null })}
                    onSuccess={handleFetchValuation}
                />
            )}

            {/* Modal de Confirmación de Cierre */}
            {showCloseModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col">
                        <div className="p-8 border-b border-border/50 bg-slate-50 flex items-center justify-between">
                            <h2 className="text-xl font-black text-slate-800">Confirmar Cierre de Operaciones</h2>
                            <button onClick={() => setShowCloseModal(false)} className="p-2 hover:bg-muted rounded-xl transition-all"><X className="w-5 h-5" /></button>
                        </div>
                        
                        <div className="p-8 space-y-8">
                            <div className="p-6 bg-amber-50 border border-amber-100 rounded-3xl flex items-start gap-4">
                                <div className="p-3 bg-amber-500 text-white rounded-2xl shadow-lg shadow-amber-500/20"><AlertCircle className="w-6 h-6" /></div>
                                <div className="space-y-1">
                                    <h4 className="font-black text-amber-900">Bloqueo de Quincena</h4>
                                    <p className="text-[11px] font-bold text-amber-800/70 leading-relaxed">Esta acción es irreversible. Se bloquearán todos los tickets y descuentos del periodo <span className="underline font-black">{startDate} / {endDate}</span>.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-5 bg-muted/20 border border-border/30 rounded-2xl">
                                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-4 opacity-40">Ingresos (bruto)</p>
                                    <p className="text-2xl font-black text-slate-800 tracking-tighter">S/ {totalTickets.toLocaleString()}</p>
                                </div>
                                <div className="p-5 bg-red-50 text-red-600 border border-red-100 rounded-2xl">
                                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-4 opacity-40">Egresos (penalidades)</p>
                                    <p className="text-2xl font-black text-red-600 tracking-tighter">- S/ {totalPenalties.toLocaleString()}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <button onClick={() => setShowCloseModal(false)} className="flex-1 py-4 text-xs font-black text-muted-foreground hover:bg-muted rounded-2xl transition-all">Regresar</button>
                                <button 
                                    onClick={handleCloseFortnightCurrent} 
                                    disabled={isClosing}
                                    className="flex-[2] py-4 bg-slate-900 text-white text-xs font-black rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20 disabled:opacity-50"
                                >
                                    {isClosing ? "Procesando cierre..." : "Confirmar cierre final"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
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
