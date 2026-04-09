import { useState, useEffect, useRef } from 'react';
import { 
    TrendingUp, TrendingDown, DollarSign, Activity, 
    ArrowUpRight, ArrowDownRight, Calendar, AlertCircle, Building2, Search, ChevronDown, Check
} from 'lucide-react';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { ApiClient } from '../services/apiClient';
import { cn } from '../utils/cn';

interface DashboardStats {
    TotalTickets: number;
    Bruto: number;
    Sanciones: number;
}

interface TrendData {
    Mes: string;
    Bruto: number;
    Sanciones: number;
}

interface TopCasData {
    label: string;
    value: number;
}

interface CAS {
    ID_CAS: number;
    Nombre_CAS: string;
    RUC: string;
}

export default function DashboardPage() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [trends, setTrends] = useState<TrendData[]>([]);
    const [topCas, setTopCas] = useState<TopCasData[]>([]);
    const [casList, setCasList] = useState<CAS[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Filtros
    const [period, setPeriod] = useState('30'); 
    const [selectedCas, setSelectedCas] = useState('all');
    const [customRange, setCustomRange] = useState({ start: '', end: '' });

    // Estado para el Dropdown Custom
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchCas = async () => {
            try {
                const data = await ApiClient.request('/cas');
                setCasList(data);
            } catch (err) {
                console.error("Error fetching CAS list:", err);
            }
        };
        fetchCas();
        
        // Cerrar dropdown al hacer click fuera
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            let start = '';
            let end = new Date().toISOString().split('T')[0];
            
            if (period !== 'custom' && period !== 'year') {
                const d = new Date();
                d.setDate(d.getDate() - parseInt(period));
                start = d.toISOString().split('T')[0];
            } else if (period === 'year') {
                start = `${new Date().getFullYear()}-01-01`;
            } else {
                start = customRange.start;
                end = customRange.end;
            }

            const casQuery = selectedCas !== 'all' ? `&ruc=${selectedCas}` : '';
            const queryParams = (start && end) ? `?start=${start}&end=${end}${casQuery}` : (casQuery ? `?ruc=${selectedCas}` : '');
            const monthsParam = (period === 'year' ? '?months=12' : (period === '90' ? '?months=3' : '?months=6')) + casQuery.replace('&', '');

            const [s, t, tc] = await Promise.all([
                ApiClient.request(`/dashboard/stats${queryParams.includes('?') ? queryParams : '?' + queryParams.replace('&', '')}`),
                ApiClient.request(`/dashboard/trends${monthsParam.includes('?') ? monthsParam : '?' + monthsParam.replace('&', '')}`),
                ApiClient.request(`/dashboard/top-cas${queryParams.includes('?') ? queryParams : '?' + queryParams.replace('&', '')}`)
            ]);
            
            setStats(s || { TotalTickets: 0, Bruto: 0, Sanciones: 0 });
            setTrends(t || []);
            setTopCas(tc || []);
        } catch (err) {
            console.error("Dashboard error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (period !== 'custom' || (customRange.start && customRange.end)) {
            fetchData();
        }
    }, [period, customRange, selectedCas]);

    const filteredCasList = casList.filter(cas => 
        cas.Nombre_CAS.toLowerCase().includes(searchQuery.toLowerCase()) || 
        cas.RUC.includes(searchQuery)
    );

    const activeCasName = selectedCas === 'all' 
        ? 'Todas las Empresas' 
        : casList.find(c => c.RUC === selectedCas)?.Nombre_CAS;

    const netAmount = (stats?.Bruto || 0) - (stats?.Sanciones || 0);

    if (loading && !stats) return (
        <div className="h-[60vh] flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <div className="p-4 space-y-8 animate-in fade-in duration-500">
            {/* Header con Filtros Mejorados */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 bg-card p-5 rounded-xl border border-border shadow-sm">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                        Auditoría Analítica
                        <div className="w-2 h-2 bg-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]" />
                    </h1>
                    <p className="text-muted-foreground text-[11px] font-medium opacity-60">
                        Inteligencia de negocios CAS en tiempo real.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    {/* Filtro Empresa Custom Popover */}
                    <div className="relative" ref={dropdownRef}>
                        <button 
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className={cn(
                                "flex items-center justify-between gap-3 bg-background px-4 py-2.5 rounded-lg border border-border shadow-sm hover:border-primary/40 transition-all min-w-[260px] max-w-[300px]",
                                isDropdownOpen && "ring-2 ring-primary/20 border-primary/50"
                            )}
                        >
                            <div className="flex items-center gap-2 truncate">
                                <Building2 className="w-4 h-4 text-primary shrink-0" />
                                <span className="text-[11px] font-bold uppercase truncate tracking-widest">
                                    {activeCasName}
                                </span>
                            </div>
                            <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform duration-300", isDropdownOpen && "rotate-180")} />
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute top-full left-0 mt-2 w-full bg-card border border-border rounded-xl shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                                <div className="p-3 border-b border-border/50">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                        <input 
                                            autoFocus
                                            type="text" 
                                            placeholder="Buscar centro o RUC..."
                                            className="w-full bg-muted/30 border-none rounded-xl pl-9 pr-4 py-2 text-[11px] font-bold focus:ring-1 focus:ring-primary/20 outline-none"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto overflow-x-hidden p-2 custom-scrollbar">
                                    <button 
                                        onClick={() => { setSelectedCas('all'); setIsDropdownOpen(false); }}
                                        className={cn(
                                            "w-full flex items-center justify-between px-4 py-3 rounded-lg text-[10px] font-black uppercase transition-colors mb-1",
                                            selectedCas === 'all' ? "bg-primary text-white" : "hover:bg-muted text-muted-foreground"
                                        )}
                                    >
                                        Todas las Empresas
                                        {selectedCas === 'all' && <Check className="w-3 h-3" />}
                                    </button>
                                    <div className="h-px bg-border/30 my-1 mx-2" />
                                    {filteredCasList.map(cas => (
                                        <button 
                                            key={cas.ID_CAS}
                                            onClick={() => { setSelectedCas(cas.RUC); setIsDropdownOpen(false); }}
                                            className={cn(
                                                "w-full flex items-center justify-between px-4 py-3 rounded-lg text-[10px] font-black uppercase transition-colors text-left",
                                                selectedCas === cas.RUC ? "bg-primary text-white shadow-md shadow-primary/20" : "hover:bg-muted text-foreground/80"
                                            )}
                                        >
                                            <div className="flex flex-col gap-0.5">
                                                <span className="truncate max-w-[200px]">{cas.Nombre_CAS}</span>
                                                <span className={cn("text-[9px] opacity-60", selectedCas === cas.RUC ? "text-white" : "text-muted-foreground")}>{cas.RUC}</span>
                                            </div>
                                            {selectedCas === cas.RUC && <Check className="w-3 h-3" />}
                                        </button>
                                    ))}
                                    {filteredCasList.length === 0 && (
                                        <div className="py-8 text-center bg-muted/10 rounded-2xl">
                                            <Search className="w-6 h-6 text-muted-foreground mx-auto mb-2 opacity-20" />
                                            <p className="text-[9px] font-black uppercase text-muted-foreground opacity-40">No se encontraron resultados</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Filtro Periodo Custom */}
                    <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border shadow-inner">
                        {[
                            { id: '7', label: '7D' },
                            { id: '30', label: '30D' },
                            { id: '90', label: '90D' },
                            { id: 'year', label: 'AÑO' },
                            { id: 'custom', label: 'RANGO' },
                        ].map((p) => (
                            <button
                                key={p.id}
                                onClick={() => setPeriod(p.id)}
                                className={cn(
                                    "px-3.5 py-2 rounded-lg text-[10px] font-bold transition-all",
                                    period === p.id 
                                        ? "bg-foreground text-background shadow-md shadow-foreground/10" 
                                        : "text-muted-foreground hover:bg-muted"
                                )}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Selector de Rango Personalizado */}
            {period === 'custom' && (
                <div className="flex flex-wrap items-center gap-4 bg-muted/30 p-3 rounded-xl border border-border/40 animate-in slide-in-from-top-2 mx-6">
                    <div className="flex items-center gap-3 bg-background px-3 py-1.5 rounded-lg border border-border shadow-sm">
                        <Calendar className="w-3.5 h-3.5 text-primary" />
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-[10px] font-bold focus:ring-0 outline-none cursor-pointer"
                            value={customRange.start}
                            onChange={(e) => setCustomRange({...customRange, start: e.target.value})}
                        />
                    </div>
                    <span className="text-muted-foreground text-[9px] font-bold opacity-40">HASTA</span>
                    <div className="flex items-center gap-3 bg-background px-3 py-1.5 rounded-lg border border-border shadow-sm">
                        <Calendar className="w-3.5 h-3.5 text-primary" />
                        <input 
                            type="date" 
                            className="bg-transparent border-none text-[10px] font-bold focus:ring-0 outline-none cursor-pointer"
                            value={customRange.end}
                            onChange={(e) => setCustomRange({...customRange, end: e.target.value})}
                        />
                    </div>
                </div>
            )}

            {/* Metricas Principales */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                    title="Total Bruto Valorizado" 
                    value={`S/ ${(stats?.Bruto || 0).toLocaleString()}`} 
                    subtitle={`${stats?.TotalTickets} Tickets cerrados`}
                    icon={<DollarSign className="w-5 h-5" />}
                    trend="+12.5%"
                    trendUp={true}
                    color="blue"
                />
                <StatCard 
                    title="Penalidades Aplicadas" 
                    value={`S/ ${(stats?.Sanciones || 0).toLocaleString()}`} 
                    subtitle="Deducciones activas"
                    icon={<TrendingDown className="w-5 h-5" />}
                    trend="+5.2%"
                    trendUp={false}
                    color="red"
                />
                <StatCard 
                    title="Neto por Liquidar" 
                    value={`S/ ${netAmount.toLocaleString()}`} 
                    subtitle="Monto final proyectado"
                    icon={<TrendingUp className="w-5 h-5" />}
                    trend="+8.1%"
                    trendUp={true}
                    color="emerald"
                />
                <StatCard 
                    title="Eficiencia de Atención" 
                    value="94.2%" 
                    subtitle="Tickets solucionados"
                    icon={<Activity className="w-5 h-5" />}
                    trend="+2.3%"
                    trendUp={true}
                    color="amber"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Grafico de Tendencias */}
                <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-sm hover:border-primary/20 transition-all">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mb-1">Historial de Gastos</h3>
                            <p className="text-xl font-bold tracking-tight">{selectedCas === 'all' ? 'Crecimiento Mensual' : 'Tendencia Individual'}</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-primary rounded-full" />
                                <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Bruto</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 bg-red-500 rounded-full" />
                                <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Sanciones</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trends}>
                                <defs>
                                    <linearGradient id="colorBruto" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorSanciones" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                <XAxis dataKey="Mes" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 'bold'}} dx={-10} />
                                <Tooltip 
                                    contentStyle={{backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: '24px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', backdropFilter: 'blur(8px)'}} 
                                    itemStyle={{fontSize: '12px', fontWeight: 'bold'}}
                                />
                                <Area type="monotone" dataKey="Bruto" stroke="var(--primary)" strokeWidth={4} fillOpacity={1} fill="url(#colorBruto)" />
                                <Area type="monotone" dataKey="Sanciones" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorSanciones)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Ranking de CAS */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mb-1">Productividad</h3>
                        <p className="text-xl font-bold tracking-tight mb-6">{selectedCas === 'all' ? 'Top 5 CAS Activos' : 'Desempeño Local'}</p>
                        
                        <div className="space-y-6">
                            {topCas.length > 0 ? topCas.map((cas, index) => (
                                <div key={cas.label} className="group cursor-default">
                                    <div className="flex justify-between items-end mb-2">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-tighter">Ranking {index + 1}</span>
                                            <span className="text-sm font-black group-hover:text-primary transition-colors line-clamp-1">{cas.label}</span>
                                        </div>
                                        <span className="text-sm font-black opacity-40 group-hover:opacity-100 transition-opacity whitespace-nowrap">{cas.value} Tickets</span>
                                    </div>
                                    <div className="w-full bg-muted/40 h-2.5 rounded-full overflow-hidden">
                                        <div 
                                            className="bg-primary h-full rounded-full transition-all duration-1000 group-hover:brightness-110" 
                                            style={{ width: `${(cas.value / (topCas[0]?.value || 1)) * 100}%` }} 
                                        />
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-10">
                                    <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-20" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-40">No hay datos para este filtro</p>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="mt-8 pt-6 border-t border-border flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Auditados</span>
                            <span className="text-lg font-black">100% Completo</span>
                        </div>
                        <div className="p-3 bg-emerald-500/10 text-emerald-600 rounded-lg shadow-sm">
                            <ArrowUpRight className="w-6 h-6" />
                        </div>
                    </div>
                </div>
            </div>
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
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm hover:translate-y-[-2px] transition-all group overflow-hidden relative">
            <div className={`absolute top-0 right-0 w-32 h-32 ${colorClasses[color]} opacity-[0.05] rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform duration-700`} />
            
            <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between">
                    <div className={`p-2.5 rounded-lg ${colorClasses[color]}/10 text-${color}-600 shadow-sm border border-${color}-500/10`}>
                        {icon}
                    </div>
                    <div className={cn(
                        "flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-lg border",
                        trendUp ? "bg-emerald-500/5 text-emerald-600 border-emerald-200/20" : "bg-red-500/5 text-red-600 border-red-200/20"
                    )}>
                        {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {trend}
                    </div>
                </div>
                
                <div className="space-y-1">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">{title}</p>
                    <p className="text-xl font-bold tracking-tight text-foreground">{value}</p>
                </div>
                
                <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-60 flex items-center gap-2">
                    <AlertCircle className="w-3 h-3" />
                    {subtitle}
                </p>
            </div>
        </div>
    );
}
