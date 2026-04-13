import React, { useState, useEffect } from 'react';
import { Shield, Plus, Edit2, Trash2, Check, ChevronDown, Activity, Settings, CalendarDays, Users, BarChart3, Mail, Terminal, Lock, ChevronRight, Layout, Database, AppWindow, ShieldAlert } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Modal } from '../../components/common/Modal';
import { useDialog } from '../../context/DialogContext';
import { useAuth } from '../../hooks/useAuth';
import { RolesService } from '../../services/rolesService';
import type { Role, Permission } from '../../types';

export default function RolesPage() {
    const { confirm, alert } = useDialog();
    const { hasPermission } = useAuth();
    const [roles, setRoles] = useState<Role[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState<Partial<Role> | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState<Omit<Role, 'id'>>({
        name: '',
        permissions: [],
        apps: 'VAL'
    });

    const APP_IDENTIFIER = 'VAL';
    const allPermissions = RolesService.getAllPermissions();
    const permissionGroups = [...new Set(allPermissions.map(p => p.group))];
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

    const toggleGroup = (group: string) => {
        setExpandedGroup(prev => prev === group ? null : group);
    };

    const getGroupIcon = (groupName: string) => {
        const lower = groupName.toLowerCase();
        if (lower.includes('valoriza') || lower.includes('servicio') || lower.includes('penalidad')) return <Activity className="w-4 h-4" />;
        if (lower.includes('config') || lower.includes('ajuste')) return <Settings className="w-4 h-4" />;
        if (lower.includes('tarifario') || lower.includes('precio')) return <BarChart3 className="w-4 h-4" />;
        if (lower.includes('report') || lower.includes('dashboard')) return <BarChart3 className="w-4 h-4" />;
        return <Shield className="w-4 h-4" />;
    };

    useEffect(() => { loadRoles(); }, []);

    const loadRoles = async () => {
        setIsLoading(true);
        try { 
            const data = await RolesService.getRoles();
            setRoles(data); 
        }
        catch (err: any) { 
            console.error(err);
            setError(err.message || 'Error al cargar los roles');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = () => {
        setEditingRole(null);
        setFormData({
            name: '',
            permissions: [],
            apps: APP_IDENTIFIER
        });
        setExpandedGroup(null);
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) return;
        try {
            await RolesService.saveRole({ ...formData, id: editingRole?.id } as any);
            setIsModalOpen(false);
            setEditingRole(null);
            loadRoles();
        } catch (err: any) { 
            alert({ title: 'Error de Guardado', message: err.message || 'No se pudo procesar la solicitud', type: 'error' });
        }
    };

    const handleDelete = (id: string) => {
        confirm({
            title: 'Revocar Perfil de Seguridad',
            message: '¿Estás seguro de que deseas eliminar este rol? Los usuarios asignados perderán sus facultades actuales en el sistema de Valorizaciones.',
            type: 'danger',
            confirmText: 'Eliminar Rol',
            onConfirm: async () => {
                try {
                    await RolesService.deleteRole(id);
                    loadRoles();
                } catch (err: any) { 
                    alert({ title: 'Error', message: err.message || 'No se pudo eliminar el rol', type: 'error' });
                }
            }
        });
    };

    const togglePermission = (permId: Permission) => {
        const current = formData.permissions || [];
        const updated = current.includes(permId)
            ? current.filter(p => p !== permId)
            : [...current, permId];
        setFormData({ ...formData, permissions: updated });
    };

    const toggleApp = (appCode: string) => {
        const currentApps = (formData.apps || '').split(',').map(a => a.trim()).filter(Boolean);
        const updatedApps = currentApps.includes(appCode)
            ? currentApps.filter(a => a !== appCode)
            : [...currentApps, appCode];
        
        setFormData({ ...formData, apps: updatedApps.join(', ') });
    };

    return (
        <div className="flex flex-col h-full space-y-4 min-h-0 animate-in fade-in duration-500">
            {/* Header: SIATC Standard */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                        <Shield className="w-4 h-4" />
                        <span>Configuración</span>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                        <span className="text-foreground">Perfiles y Permisos</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestión de Perfiles</h1>
                    <p className="text-sm text-muted-foreground">Define las facultades y niveles de acceso para las identidades de Valorizaciones</p>
                </div>
                {hasPermission('val.config.roles') && (
                    <button
                        onClick={handleCreate}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all active:scale-95 font-semibold text-sm shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Perfil
                    </button>
                )}
            </div>

            {/* Content Container */}
            <div className="flex-1 min-h-0 overflow-auto pr-1 pb-4 custom-scrollbar">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4 bg-card rounded-[2rem] border border-border/50 shadow-sm">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-black text-muted-foreground uppercase tracking-widest">Sincronizando seguridad...</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {roles
                            .filter(role => (role.apps || APP_IDENTIFIER).split(',').some(a => a.trim().toUpperCase() === APP_IDENTIFIER))
                            .map((role) => (
                            <div key={role.id} className="group bg-card rounded-[2rem] border border-border/50 shadow-xl shadow-slate-200/20 p-6 hover:shadow-2xl hover:border-primary/20 transition-all duration-500 overflow-hidden relative">
                                <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
                                    <Shield className="w-32 h-32 rotate-12" />
                                </div>
                                <div className="flex items-start justify-between mb-6 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/10 shadow-inner group-hover:scale-110 transition-transform duration-500">
                                            <Shield className="w-6 h-6 stroke-[2]" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-foreground text-sm uppercase tracking-tight leading-none mb-1.5">{role.name}</h3>
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-widest border border-emerald-100">Activo</span>
                                                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-1">
                                                     {role.permissions.filter(p => allPermissions.some(ap => ap.id === p)).length} facultades
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                                        {hasPermission('val.config.roles') && (
                                            <>
                                                <button
                                                    onClick={() => { setEditingRole(role); setFormData({ name: role.name, permissions: role.permissions, apps: role.apps || APP_IDENTIFIER }); setIsModalOpen(true); }}
                                                    className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-90"
                                                    title="Configurar Perfil"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                {role.id !== 'ADMIN' && (
                                                    <button
                                                        onClick={() => handleDelete(role.id)}
                                                        className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all active:scale-90"
                                                        title="Eliminar Perfil"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar relative z-10 transition-all">
                                    {role.permissions.filter(p => allPermissions.some(ap => ap.id === p)).length === 0 ? (
                                        <div className="w-full flex flex-col items-center justify-center gap-3 py-6 px-4 bg-muted/30 rounded-2xl border-2 border-dashed border-border/60">
                                            <Lock className="w-6 h-6 text-muted-foreground/30" />
                                            <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest italic text-center">Acceso restringido / Sin facultades</span>
                                        </div>
                                    ) : (
                                        role.permissions
                                            .filter(p => allPermissions.some(ap => ap.id === p))
                                            .map((perm: string) => {
                                                const label = allPermissions.find((p: any) => p.id === perm)?.label || perm;
                                                return (
                                                    <span key={perm} className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-tighter bg-slate-100 text-slate-600 border border-slate-200/50 shadow-sm whitespace-nowrap group-hover:bg-primary/5 group-hover:text-primary group-hover:border-primary/20 transition-colors">
                                                        {label}
                                                    </span>
                                                );
                                            })
                                    )}
                                </div>
                                <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-between opacity-40 group-hover:opacity-100 transition-opacity">
                                    <div className="flex items-center gap-1.5 font-bold text-[9px] text-muted-foreground uppercase tracking-widest">
                                        <Database className="w-3 h-3" />
                                        Indexado: SIATC Global
                                    </div>
                                    <ShieldAlert className="w-3.5 h-3.5 text-primary/40 group-hover:text-primary transition-colors" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal de Rol: SIATC Standard */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingRole ? 'GESTIÓN DE PERFIL OPERATIVO' : 'NUEVO PERFIL DE SEGURIDAD'} size="xl">
                <form onSubmit={handleSave} className="p-6 pt-2 space-y-8">
                    <div className="space-y-8">
                        {/* Role Header Section */}
                        <div className="bg-muted/30 p-6 rounded-3xl border border-border/50 relative overflow-hidden group">
                           <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
                                <Shield className="w-24 h-24 rotate-12" />
                            </div>
                            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-6">
                                <div className="shrink-0 flex items-center gap-2.5 text-xs font-black text-muted-foreground uppercase tracking-[0.2em] whitespace-nowrap bg-background px-4 py-2 rounded-xl border border-border shadow-sm">
                                    <Shield className="w-4 h-4 text-primary" />
                                    Categoría de Acceso:
                                </div>
                                <div className="relative flex-1">
                                    <input 
                                        type="text" 
                                        required
                                        value={formData.name || ''} 
                                        onChange={e => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                                        className="w-full h-14 pl-12 pr-4 bg-background border border-border rounded-2xl text-sm font-black tracking-widest placeholder:text-muted-foreground/30 focus:ring-4 focus:ring-primary/10 focus:border-primary transition-all outline-none uppercase shadow-inner" 
                                        placeholder="EJ: ADMINISTRADOR COMPRAS, AUDITOR" 
                                    />
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/40">
                                        <Lock className="w-5 h-5 stroke-[2.5]" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Application Access Section */}
                        <div className="space-y-4 px-1">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] px-1 flex items-center gap-3">
                                <AppWindow className="w-4 h-4 text-primary/60" />
                                Alcance del Ecosistema SIATC
                            </label>
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { id: 'EBM', label: 'EBM' },
                                    { id: 'FSM', label: 'GESTOR FSM' },
                                    { id: 'TCtrl', label: 'TABLERO' },
                                    { id: 'Liq', label: 'LIQUIDACIONES' },
                                    { id: 'VAL', label: 'VALORIZACIONES' }
                                ].map(app => {
                                    const isSelected = (formData.apps || '').split(',').map(a => a.trim()).includes(app.id);
                                    return (
                                        <button 
                                            key={app.id} 
                                            type="button" 
                                            onClick={() => toggleApp(app.id)}
                                            className={cn(
                                                "flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all duration-300 shadow-sm",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground border-primary shadow-xl shadow-primary/20 scale-105"
                                                    : "bg-background border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                            )}>
                                            <div className={cn(
                                                "w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black transition-all shadow-inner",
                                                isSelected 
                                                    ? "bg-white text-primary rotate-12" 
                                                    : "bg-muted text-muted-foreground/60 border border-border/50"
                                            )}>
                                                {app.id.substring(0, 1)}
                                            </div>
                                            <span className="truncate">{app.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Permissions Section */}
                        <div className="space-y-5 px-1 pb-4">
                            <div className="flex items-center gap-4">
                                <label className="text-xs font-black text-muted-foreground uppercase tracking-[0.2em] px-1 shrink-0 flex items-center gap-2">
                                     <Activity className="w-4 h-4 text-primary/60" />
                                     Matriz de Facultades
                                </label>
                                <div className="h-px bg-border flex-1" />
                            </div>

                            <div className="space-y-4">
                                {permissionGroups.map(group => {
                                    const isExpanded = expandedGroup === group;
                                    const groupPermissions = allPermissions.filter((p: any) => p.group === group);
                                    const selectedCount = groupPermissions.filter((p: any) => formData.permissions.includes(p.id)).length;

                                    return (
                                        <div key={group} className={cn(
                                            "border-[1.5px] rounded-[2rem] overflow-hidden transition-all duration-500 bg-background mb-4",
                                            isExpanded ? "border-primary/40 shadow-2xl shadow-primary/5 ring-4 ring-primary/5" : "border-border"
                                        )}>
                                            <button 
                                                type="button"
                                                onClick={() => toggleGroup(group)}
                                                className={cn(
                                                    "w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-all duration-300",
                                                    isExpanded && "bg-muted/20 border-b border-border shadow-inner"
                                                )}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={cn(
                                                        "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-md border",
                                                        isExpanded ? "bg-primary text-white border-primary shadow-primary/30 rotate-6 scale-110" : "bg-muted text-primary border-border"
                                                    )}>
                                                        {getGroupIcon(group)}
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-sm font-black text-foreground tracking-widest uppercase leading-none mb-1.5">{group}</p>
                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">
                                                            {selectedCount} de {groupPermissions.length} módulos habilitados
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    {selectedCount > 0 && !isExpanded && (
                                                        <div className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[9px] font-black border border-emerald-100 flex items-center gap-1.5">
                                                            <Check className="w-3 h-3 stroke-[3]" />
                                                            {selectedCount}
                                                        </div>
                                                    )}
                                                    <ChevronDown className={cn(
                                                        "w-6 h-6 text-muted-foreground transition-transform duration-500",
                                                        isExpanded ? "rotate-180 text-primary" : ""
                                                    )} />
                                                </div>
                                            </button>

                                            {isExpanded && (
                                                <div className="p-6 bg-muted/5 animate-in fade-in slide-in-from-top-4 duration-500">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {groupPermissions.map((perm: any) => {
                                                            const isSelected = formData.permissions.includes(perm.id);
                                                            return (
                                                                <button 
                                                                    type="button"
                                                                    key={perm.id} 
                                                                    onClick={() => togglePermission(perm.id)}
                                                                    className={cn(
                                                                        "group relative flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-tight text-left transition-all duration-300 border-2",
                                                                        isSelected
                                                                            ? "bg-white border-primary text-primary shadow-lg shadow-primary/5 active:scale-95 translate-x-1"
                                                                            : "bg-background border-transparent text-muted-foreground hover:border-border hover:bg-muted/30"
                                                                    )}
                                                                >
                                                                    <div className={cn(
                                                                        "w-5 h-5 rounded-lg flex items-center justify-center transition-all shrink-0 shadow-inner border-2",
                                                                        isSelected 
                                                                            ? 'bg-primary text-white border-primary rotate-6' 
                                                                            : 'bg-muted/30 border-border group-hover:border-primary/40'
                                                                    )}>
                                                                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[4px]" />}
                                                                    </div>
                                                                    <span className="truncate flex-1 tracking-widest">{perm.label}</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-6 border-t border-border mt-2">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1 px-4 py-3 text-xs font-black text-muted-foreground hover:bg-muted rounded-2xl transition-all uppercase tracking-[0.2em] active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Layout className="w-4 h-4" />
                            Descartar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-3 text-xs font-black text-primary-foreground bg-primary hover:bg-primary/90 rounded-2xl shadow-xl shadow-primary/25 active:scale-95 transition-all uppercase tracking-[0.2em] flex items-center justify-center gap-2"
                        >
                            <Check className="w-4 h-4 stroke-[3]" />
                            {editingRole ? 'GUARDAR CAMBIOS' : 'CONFIRMAR PERFIL'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
