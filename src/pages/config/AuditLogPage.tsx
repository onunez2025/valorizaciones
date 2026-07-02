import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal, ShieldAlert, Search, RefreshCcw, User, Clock, Activity, FileText, ChevronRight, Database, ChevronDown, CheckCircle2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { AuditService } from '../../services/auditService';
import { SIATC_THEME } from '../../utils/siatc-theme';
import { 
    SIATCTable, 
    SIATCTableRow, 
    SIATCTableCell, 
    SIATCTableFooter 
} from '../../components/siatc/table/SIATCTable';
import { useTableResizer } from '../../hooks/useTableResizer';
import { ResizableHeader } from '../../components/common/ResizableHeader';

interface AuditLog {
    id: number;
    user_id: string;
    user_name: string;
    action: string;
    entity: string;
    entity_id: string;
    details: string;
    created_at: string;
}

const normalizeLogs = (data: unknown[]): AuditLog[] => {
    if (!Array.isArray(data)) return [];
    return data.map((raw, index) => {
        const item = raw as Record<string, unknown>;
        return {
            id: (item.id ?? item.Id ?? index) as number,
            created_at: (item.created_at ?? item.Fecha ?? item.fecha ?? new Date().toISOString()) as string,
            user_id: (item.user_id ?? item.UsuarioID ?? item.usuario_id ?? '') as string,
            user_name: (item.user_name ?? item.UsuarioNombre ?? item.usuario_nombre ?? item.user_id ?? item.UsuarioID ?? 'Sistema') as string,
            action: (item.action ?? item.Accion ?? item.accion ?? 'Operación') as string,
            entity: (item.entity ?? item.Entidad ?? item.entidad ?? 'General') as string,
            entity_id: (item.entity_id ?? item.EntidadID ?? item.entidad_id ?? '') as string,
            details: (item.details ?? item.Detalle ?? item.detalle ?? '') as string
        };
    });
};

export default function AuditLogPage() {
    const { t } = useTranslation();
    const { widths, onResizeStart } = useTableResizer('val_audit_column_widths', {
        fecha: 180,
        usuario: 220,
        operacion: 180,
        entidad: 200,
        payload: 300
    });
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterAction, setFilterAction] = useState('ALL');
    const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const recordsPerPage = 10;

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const data = await AuditService.getLogs();
            setLogs(normalizeLogs(data));
        } catch (error) {
            console.error('Error fetching audit logs:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    const filteredLogs = logs.filter(log => {
        const matchesSearch = 
            (log.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
            (log.entity || '').toLowerCase().includes(search.toLowerCase()) ||
            (log.action || '').toLowerCase().includes(search.toLowerCase());
        
        const matchesAction = filterAction === 'ALL' || log.action === filterAction;
        
        return matchesSearch && matchesAction;
    });

    const toTitleCase = (str: string) => {
        return str.toLowerCase().split(/[_\s]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    const getActionBadge = (action: string) => {
        const isCritical = action.includes('DENEGADO') || action.includes('DELETE') || action.includes('ERROR');
        const isSuccess = action.includes('SUCCESS') || action.includes('LOGIN') || action.includes('CREATE');
        
        return (
            <span className={cn(
                SIATC_THEME.STATES.BADGE_BASE,
                isCritical 
                    ? SIATC_THEME.STATES.ERROR
                    : isSuccess
                    ? SIATC_THEME.STATES.SUCCESS
                    : SIATC_THEME.STATES.PRIMARY
            )}>
                {isCritical ? <ShieldAlert className="w-3 h-3" /> : isSuccess ? <CheckCircle2 className="w-3 h-3" /> : <Activity className="w-3 h-3" />}
                {toTitleCase(action)}
            </span>
        );
    };

    const totalPages = Math.ceil(filteredLogs.length / recordsPerPage);
    const paginatedLogs = filteredLogs.slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage);

    return (
        <div className="flex flex-col h-full space-y-4 min-h-0 animate-in fade-in duration-500">
            {/* Header: SIATC Standard */}
            <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-cb-text-secondary font-medium">
                        <Terminal className="w-4 h-4 text-cb-neutral" />
                        {t('common.configuration')}
                        <ChevronRight className="w-3 h-3 opacity-50" />
                        <span className="text-cb-text-primary">{t('audit.breadcrumb')}</span>
                    </div>
                    <h1 className={SIATC_THEME.TYPOGRAPHY.PAGE_TITLE}>{t('audit.title')}</h1>
                    <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>{t('audit.subtitle')}</p>
                </div>
                <button 
                    onClick={fetchLogs}
                    disabled={isLoading}
                    className={cn(SIATC_THEME.COMPONENTS.BUTTON_PRIMARY, isLoading && "opacity-80 cursor-not-allowed")}
                >
                    <RefreshCcw className={cn("w-4 h-4 stroke-[2.5]", isLoading && "animate-spin")} />
                    {t('audit.sync')}
                </button>
            </div>

            {/* Content Container */}
            <div className={cn(SIATC_THEME.LAYOUT.CONTENT_CONTAINER, "dark:bg-cb-bg")}>
                {/* Search / Filters Toolbar */}
                <div className={SIATC_THEME.LAYOUT.SEARCH_BAR_WRAPPER}>
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/60" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                            placeholder={t('audit.searchPlaceholder')}
                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-11 pr-4 dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                        />
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Database className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/60 pointer-events-none" />
                        <select
                            className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-11 pr-8 dark:bg-cb-bg text-cb-text-primary border-cb-border appearance-none cursor-pointer text-xs uppercase tracking-wider")}
                            value={filterAction}
                            onChange={(e) => { setFilterAction(e.target.value); setCurrentPage(1); }}
                        >
                            <option value="ALL">{t('audit.filter.all')}</option>
                            <option value="ACCESO_DENEGADO">{t('audit.filter.denied')}</option>
                            <option value="LOGIN_SUCCESS">{t('audit.filter.login')}</option>
                            <option value="CREATE">{t('audit.filter.create')}</option>
                            <option value="UPDATE">{t('audit.filter.update')}</option>
                            <option value="DELETE">{t('audit.filter.delete')}</option>
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral pointer-events-none" />
                    </div>
                </div>

                {/* Table Area */}
                <SIATCTable containerClassName="relative">
                    {isLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/60 backdrop-blur-md z-50">
                            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-bold text-cb-text-secondary mt-6 tracking-[0.2em] animate-pulse">{t('audit.loading')}</span>
                        </div>
                    ) : (
                        <>
                            <thead className={SIATC_THEME.TABLE.HEADER_ROW}>
                                <tr className="border-b border-cb-border">
                                    <ResizableHeader columnId="fecha" width={widths.fecha} onResizeStart={onResizeStart}>
                                        <span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>{t('audit.table.date')}</span>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="usuario" width={widths.usuario} onResizeStart={onResizeStart}>
                                        <span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>{t('audit.table.user')}</span>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="operacion" width={widths.operacion} onResizeStart={onResizeStart}>
                                        <span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>{t('audit.table.operation')}</span>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="entidad" width={widths.entidad} onResizeStart={onResizeStart}>
                                        <span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>{t('audit.table.entity')}</span>
                                    </ResizableHeader>
                                    <th className={SIATC_THEME.TABLE.HEADER_TH}><span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>{t('audit.table.payload')}</span></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-cb-border/60">
                                {paginatedLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-32 text-center">
                                            <div className="flex flex-col items-center gap-4 opacity-30">
                                                <Activity className="w-16 h-16 text-cb-neutral" />
                                                <p className="text-xs font-bold tracking-widest text-cb-neutral">{t('audit.empty')}</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedLogs.map((log) => (
                                        <React.Fragment key={log.id}>
                                            <SIATCTableRow 
                                                className={cn(
                                                    expandedLogId === log.id && "bg-primary/[0.02]"
                                                )}
                                                onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                            >
                                                <SIATCTableCell>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2.5 text-cb-text-primary font-bold text-xs tracking-tight">
                                                            <Clock className="w-3.5 h-3.5 text-primary/60" />
                                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </div>
                                                        <span className="text-[10px] text-cb-text-secondary font-medium ml-6">
                                                            {new Date(log.created_at).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </SIATCTableCell>
                                                <SIATCTableCell>
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary dark:text-primary-foreground shrink-0 border border-cb-border shadow-inner group-hover:scale-110 transition-transform animate-in fade-in">
                                                            <User className="w-5 h-5 stroke-[2]" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-bold text-cb-text-primary text-[13px] truncate tracking-tight">{toTitleCase(log.user_name)}</div>
                                                            <div className="text-[9px] text-cb-text-secondary font-bold tracking-tighter opacity-60 flex items-center gap-1.5 mt-0.5 font-mono">
                                                                <Database className="w-2.5 h-2.5" /> ID: {log.user_id}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </SIATCTableCell>
                                                <SIATCTableCell>
                                                    {getActionBadge(log.action)}
                                                </SIATCTableCell>
                                                <SIATCTableCell>
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="w-8 h-8 bg-cb-bg/50 dark:bg-cb-bg rounded-cb-btn flex items-center justify-center shrink-0 border border-cb-border shadow-sm group-hover:bg-background dark:group-hover:bg-cb-bg transition-colors">
                                                            <FileText className="w-4 h-4 text-primary/60" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-[12px] font-bold text-cb-text-primary truncate tracking-tighter">{log.entity}</div>
                                                            {log.entity_id && (
                                                                <div className="text-[9px] text-cb-text-secondary font-bold tracking-widest mt-0.5 italic">Ref_{log.entity_id}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </SIATCTableCell>
                                                <SIATCTableCell>
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="max-w-[15rem] truncate text-[11px] text-cb-text-secondary font-bold bg-cb-bg/30 px-3 py-2 rounded-cb-btn border border-cb-border tracking-tighter" title={log.details}>
                                                            {log.details}
                                                        </div>
                                                        <ChevronDown className={cn(
                                                            "w-4 h-4 text-cb-neutral transition-transform duration-300",
                                                            expandedLogId === log.id && "rotate-180 text-primary"
                                                        )} />
                                                    </div>
                                                </SIATCTableCell>
                                            </SIATCTableRow>
                                            {expandedLogId === log.id && (
                                                <tr className="bg-primary/[0.01] animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <td colSpan={5} className="px-10 py-6 border-l-4 border-l-primary/40">
                                                        <div className="bg-slate-900 rounded-cb-card p-6 shadow-2xl overflow-hidden relative group/code">
                                                            <div className="absolute top-4 right-6 flex items-center gap-2 text-[10px] font-bold text-slate-500 tracking-wider group-hover/code:text-primary transition-colors">
                                                                <Terminal className="w-4 h-4" />
                                                                Metadata Raw
                                                            </div>
                                                            <pre className="text-[12px] font-mono text-emerald-400 overflow-x-auto custom-scrollbar leading-relaxed">
                                                                {JSON.stringify({
                                                                    id: log.id,
                                                                    action: log.action,
                                                                    resource: log.entity,
                                                                    origin: 'VAL_ENGINE_V2.1.0',
                                                                    meta: log.details,
                                                                    timestamp: log.created_at
                                                                }, null, 4)}
                                                            </pre>
                                                            <div className="mt-4 flex items-center gap-4">
                                                                <div className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-[9px] font-bold tracking-widest border border-slate-700/50">
                                                                    Status: Commit Secure
                                                                 </div>
                                                                <div className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-[9px] font-bold tracking-widest border border-slate-700/50 flex items-center gap-2">
                                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                                    Protected by SIATC
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))
                                )}
                            </tbody>
                        </>
                    )}
                </SIATCTable>
                
                {/* Footer Stats: SIATC Standard */}
                <SIATCTableFooter 
                    totalRecords={filteredLogs.length} 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />
            </div>
        </div>
    );
}
