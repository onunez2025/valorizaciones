import React, { useState, useEffect } from 'react';
import { Shield, Plus, Edit2, Trash2, Check, ChevronDown, Activity, Settings, CalendarDays, Users, BarChart3, Mail, Terminal, Lock, ChevronRight, Layout, Database, AppWindow, ShieldAlert, Save } from 'lucide-react';
import { cn } from '../../utils/cn';
import { toTitleCase } from '../../utils/formatters';
import { Modal } from '../../components/common/Modal';
import { useDialog } from '../../context/DialogContext';
import { useAuth } from '../../hooks/useAuth';
import { RolesService } from '../../services/rolesService';
import { SIATC_THEME } from '../../utils/siatc-theme';
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
            alert({ title: 'Error de guardado', message: err.message || 'No se pudo procesar la solicitud', type: 'error' });
        }
    };

    const handleDelete = (id: string) => {
        confirm({
            title: 'Revocar perfil de seguridad',
            message: '¿Estás seguro de que deseas eliminar este rol? Los usuarios asignados perderán sus facultades actuales en el sistema de Valorizaciones.',
            type: 'danger',
            confirmText: 'Eliminar rol',
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
            <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-cb-text-secondary font-medium">
                        <Shield className="w-4 h-4 text-cb-neutral" />
                        <span>Configuración</span>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                        <span className="text-cb-text-primary">Perfiles y Permisos</span>
                    </div>
                    <h1 className={SIATC_THEME.TYPOGRAPHY.PAGE_TITLE}>Gestión de Perfiles</h1>
                    <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>Define las facultades y niveles de acceso para las identidades de Valorizaciones</p>
                </div>
                {hasPermission('val.config.roles') && (
                    <button
                        onClick={handleCreate}
                        className={SIATC_THEME.COMPONENTS.BUTTON_PRIMARY}
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Perfil
                    </button>
                )}
            </div>

            {/* Content Container */}
            <div className="flex-1 min-h-0 overflow-auto pr-1 pb-4 custom-scrollbar">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4 bg-white dark:bg-cb-bg rounded-cb-card border border-cb-border shadow-cb-level-1">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-bold text-cb-text-secondary tracking-widest">Sincronizando seguridad...</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {roles.map((role) => (
                            <div key={role.id} className={cn(SIATC_THEME.COMPONENTS.CARD_CONTAINER, "group p-5 hover:shadow-cb-level-2 transition-all duration-300 relative overflow-hidden bg-white dark:bg-cb-bg border-cb-border")}>
                                <div className="absolute top-0 right-0 p-8 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
                                    <Shield className="w-24 h-24 rotate-12" />
                                </div>
                                <div className="flex items-start justify-between mb-4 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="w-11 h-11 rounded-cb-btn bg-cb-bg/50 flex items-center justify-center text-cb-neutral group-hover:bg-primary/10 group-hover:text-primary transition-all border border-cb-border shrink-0">
                                            <Shield className="w-5.5 h-5.5 stroke-[2]" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-cb-text-primary text-sm tracking-tight leading-none mb-1.5">
                                                {toTitleCase(role.name)}
                                            </h3>
                                            <div className="flex items-center gap-2">
                                                <span className={cn(SIATC_THEME.STATES.BADGE_BASE, SIATC_THEME.STATES.SUCCESS)}>Activo</span>
                                                <span className="text-[11px] text-cb-text-secondary font-bold tracking-tight">
                                                     {role.permissions.filter(p => allPermissions.some(ap => ap.id === p)).length} facultades
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {hasPermission('val.config.roles') && (
                                            <>
                                                <button
                                                    onClick={() => { setEditingRole(role); setFormData({ name: role.name, permissions: role.permissions, apps: role.apps || APP_IDENTIFIER }); setIsModalOpen(true); }}
                                                    className="p-2 text-cb-text-secondary hover:text-primary hover:bg-primary/10 rounded-cb-btn transition-all active:scale-90 cursor-pointer"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                {role.id !== 'ADMIN' && (
                                                    <button
                                                        onClick={() => handleDelete(role.id)}
                                                        className="p-2 text-cb-text-secondary hover:text-[#DF2935] hover:bg-[#DF2935]/10 rounded-cb-btn transition-all active:scale-90 cursor-pointer"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar relative z-10 transition-all">
                                    {role.permissions.filter(p => allPermissions.some(ap => ap.id === p)).length === 0 ? (
                                        <div className="w-full flex flex-col items-center justify-center gap-2 py-4 px-4 bg-cb-bg/30 rounded-cb-card border border-dashed border-cb-border">
                                            <Lock className="w-5 h-5 text-cb-neutral/40" />
                                            <span className="text-[10px] text-cb-neutral font-bold italic text-center">Sin facultades asignadas</span>
                                        </div>
                                    ) : (
                                        role.permissions
                                            .filter(p => allPermissions.some(ap => ap.id === p))
                                            .map((perm: string) => {
                                                const label = allPermissions.find((p: any) => p.id === perm)?.label || perm;
                                                return (
                                                    <span key={perm} className={cn(SIATC_THEME.STATES.BADGE_BASE, SIATC_THEME.STATES.SECONDARY, "normal-case tracking-normal h-[22px] hover:border-primary/20 hover:bg-primary/5 hover:text-primary whitespace-nowrap")}>
                                                        {label}
                                                    </span>
                                                );
                                            })
                                    )}
                                </div>
                                <div className="mt-5 pt-4 border-t border-cb-border flex items-center justify-between opacity-40 group-hover:opacity-100 transition-opacity">
                                    <div className="flex items-center gap-1.5 font-bold text-[9px] text-cb-neutral tracking-widest uppercase">
                                        <Database className="w-3 h-3" />
                                        SIATC Global
                                    </div>
                                    <ShieldAlert className="w-3.5 h-3.5 text-primary/40 group-hover:text-primary transition-colors" />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal de Rol: SIATC Standard */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingRole ? 'Configuración de Perfil' : 'Nuevo Perfil de Seguridad'} size="xl">
                <form onSubmit={handleSave} className="p-6 pt-2 space-y-6">
                    <div className="space-y-6">
                        {/* Role Header Section */}
                        <div className="bg-cb-bg/30 p-5 rounded-cb-card border border-cb-border relative overflow-hidden group">
                           <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity pointer-events-none">
                                <Shield className="w-20 h-20 rotate-12" />
                            </div>
                            <div className="relative z-10 flex flex-col gap-3">
                                <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider pl-1">Nombre del perfil:</label>
                                <div className="relative flex-1">
                                    <input 
                                        type="text" 
                                        required
                                        value={formData.name || ''} 
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className={cn(SIATC_THEME.COMPONENTS.INPUT, "h-11 pl-11 pr-4 dark:bg-cb-bg text-cb-text-primary border-cb-border")}
                                        placeholder="Ej: Administrador Compras, Auditor" 
                                    />
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-cb-neutral/60">
                                        <Lock className="w-4 h-4 stroke-[2.5]" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Application Access Section */}
                        <div className="space-y-3">
                            <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider px-1 flex items-center gap-2">
                                <AppWindow className="w-4 h-4 text-primary/60" />
                                Ámbito del ecosistema SIATC
                            </label>
                            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                                {[
                                    { id: 'EBM', label: 'EBM Central' },
                                    { id: 'FSM', label: 'Gestor FSM' },
                                    { id: 'TCtrl', label: 'Tablero' },
                                    { id: 'Liq', label: 'Liquidaciones' },
                                    { id: 'VAL', label: 'Valorizaciones' },
                                    { id: 'CXG', label: 'Gestor NC-CxG' }
                                ].map(app => {
                                    const isSelected = (formData.apps || '').split(',').map(a => a.trim()).includes(app.id);
                                    return (
                                        <button 
                                            key={app.id} 
                                            type="button" 
                                            onClick={() => toggleApp(app.id)}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2.5 rounded-cb-btn text-[10px] font-bold tracking-tight border transition-all duration-200 cursor-pointer",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground border-primary shadow-sm scale-[1.02]"
                                                    : "bg-white dark:bg-cb-bg border-cb-border text-cb-neutral hover:bg-cb-bg"
                                            )}>
                                            <div className={cn(
                                                "w-7 h-7 rounded-cb-btn flex items-center justify-center text-[10px] font-black transition-all",
                                                isSelected 
                                                    ? "bg-white text-primary" 
                                                    : "bg-muted text-cb-neutral/60"
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
                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider px-1 shrink-0 flex items-center gap-2">
                                     <Activity className="w-4 h-4 text-primary/60" />
                                     Matriz de facultades
                                </label>
                                <div className="h-px bg-cb-border flex-1" />
                            </div>

                            <div className="space-y-3">
                                {permissionGroups.map(group => {
                                    const isExpanded = expandedGroup === group;
                                    const groupPermissions = allPermissions.filter((p: any) => p.group === group);
                                    const selectedCount = groupPermissions.filter((p: any) => formData.permissions.includes(p.id)).length;

                                    return (
                                        <div key={group} className={cn(
                                            "border rounded-cb-card overflow-hidden bg-white dark:bg-cb-bg transition-all duration-300",
                                            isExpanded ? "border-primary/40 shadow-sm" : "border-cb-border"
                                        )}>
                                            <button 
                                                type="button"
                                                onClick={() => toggleGroup(group)}
                                                className={cn(
                                                    "w-full flex items-center justify-between p-3.5 hover:bg-cb-bg/50 transition-all",
                                                    isExpanded && "bg-cb-bg/30 border-b border-cb-border"
                                                )}
                                            >
                                                <div className="flex items-center gap-3.5">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-cb-btn flex items-center justify-center transition-all border",
                                                        isExpanded ? "bg-primary text-white border-primary" : "bg-cb-bg text-primary border-cb-border"
                                                    )}>
                                                        {getGroupIcon(group)}
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-sm font-bold text-cb-text-primary leading-none mb-1.5">{group}</p>
                                                        <p className="text-[10px] font-medium text-cb-text-secondary">
                                                            {selectedCount} de {groupPermissions.length} activos
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    {selectedCount > 0 && !isExpanded && (
                                                        <div className="px-2 py-0.5 rounded-cb-chip bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 text-[10px] font-bold border border-emerald-500/20 flex items-center gap-1">
                                                            <Check className="w-3 h-3 stroke-[3]" />
                                                            {selectedCount}
                                                        </div>
                                                    )}
                                                    <ChevronDown className={cn(
                                                        "w-5 h-5 text-cb-neutral transition-transform duration-300",
                                                        isExpanded ? "rotate-180" : ""
                                                    )} />
                                                </div>
                                            </button>

                                            {isExpanded && (
                                                <div className="p-4 bg-cb-bg/10">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                        {groupPermissions.map((perm: any) => {
                                                            const isSelected = formData.permissions.includes(perm.id);
                                                            return (
                                                                <button 
                                                                    type="button"
                                                                    key={perm.id} 
                                                                    onClick={() => togglePermission(perm.id)}
                                                                    className={cn(
                                                                        "group flex items-center gap-3 px-3 py-2.5 rounded-cb-btn text-[10px] font-bold text-left transition-all border cursor-pointer",
                                                                        isSelected
                                                                            ? "bg-white dark:bg-cb-bg border-primary text-primary shadow-sm"
                                                                            : "bg-white dark:bg-cb-bg border-cb-border text-cb-neutral hover:bg-cb-bg"
                                                                    )}
                                                                >
                                                                    <div className={cn(
                                                                        "w-4.5 h-4.5 rounded-lg flex items-center justify-center transition-all shrink-0 border",
                                                                        isSelected 
                                                                            ? 'bg-primary text-white border-primary' 
                                                                            : 'bg-muted/30 border-border group-hover:border-primary/40'
                                                                    )}>
                                                                        {isSelected && <Check className="w-3 h-3 stroke-[4px]" />}
                                                                    </div>
                                                                    <span className="truncate flex-1 tracking-tight text-cb-text-primary">{perm.label}</span>
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

                    <div className="flex items-center gap-3 pt-4 border-t border-cb-border mt-2">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className={cn(SIATC_THEME.COMPONENTS.BUTTON_SECONDARY, "flex-1")}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className={cn(SIATC_THEME.COMPONENTS.BUTTON_PRIMARY, "flex-1")}
                        >
                            <Save className="w-4 h-4" />
                            {editingRole ? 'Guardar cambios' : 'Confirmar perfil'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
