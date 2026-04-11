import React, { useState, useEffect } from 'react';
import { Terminal, ShieldAlert, Search, RefreshCcw, User, Clock, Activity, FileText } from 'lucide-react';
import { cn } from '../../utils/cn';
import { AuditService } from '../../services/auditService';

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

export default function AuditLogPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterAction, setFilterAction] = useState('ALL');

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const data = await AuditService.getLogs();
            setLogs(data);
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

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in zoom-in duration-300">
            {/* Header */}
            <div className="p-6 bg-card border border-border rounded-t-lg flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
                        <Activity className="w-6 h-6 text-primary" /> Auditoría de Seguridad
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Registro de actividad para Valorizaciones</p>
                </div>
                <button 
                    onClick={fetchLogs}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium shadow-sm shrink-0"
                >
                    <RefreshCcw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                    Actualizar
                </button>
            </div>

            {/* Filters */}
            <div className="p-4 bg-muted/30 border-x border-border flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="search"
                        placeholder="Buscar por usuario, acción o entidad..."
                        className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select
                    className="px-3 py-2 bg-card border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value)}
                >
                    <option value="ALL">Todas las acciones</option>
                    <option value="ACCESO_DENEGADO">Accesos Denegados</option>
                    <option value="LOGIN_SUCCESS">Inicios de Sesión</option>
                    <option value="CREATE">Creaciones</option>
                    <option value="UPDATE">Modificaciones</option>
                    <option value="DELETE">Eliminaciones</option>
                    <option value="DEACTIVATE">Desactivaciones</option>
                </select>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto bg-card border-x border-b border-border rounded-b-lg scrollbar-thin scrollbar-thumb-border">
                <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-muted sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="px-6 py-3 font-bold border-b border-border w-48 bg-muted text-foreground">Fecha / Hora</th>
                            <th className="px-6 py-3 font-bold border-b border-border bg-muted text-foreground">Usuario</th>
                            <th className="px-6 py-3 font-bold border-b border-border w-40 bg-muted text-foreground">Acción</th>
                            <th className="px-6 py-3 font-bold border-b border-border bg-muted text-foreground">Entidad</th>
                            <th className="px-6 py-3 font-bold border-b border-border bg-muted text-foreground">Detalles</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {isLoading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground italic">
                                    Cargando registros...
                                </td>
                            </tr>
                        ) : filteredLogs.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                                    No se encontraron eventos
                                </td>
                            </tr>
                        ) : (
                            filteredLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-muted-foreground text-xs font-medium">
                                        <div className="flex items-center gap-2">
                                            <Clock className="w-3.5 h-3.5" />
                                            {new Date(log.created_at).toLocaleString()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2 font-bold text-foreground overflow-hidden max-w-[200px]">
                                            <User className="w-4 h-4 text-primary shrink-0" />
                                            <span className="truncate">{log.user_name}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={cn(
                                            "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                                            log.action === 'ACCESO_DENEGADO' 
                                                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                        )}>
                                            {log.action.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 font-medium text-foreground">
                                        {log.entity}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="max-w-xs truncate text-[10px] text-muted-foreground font-mono bg-muted/50 p-1 rounded" title={log.details}>
                                            {log.details}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
