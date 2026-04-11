import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Shield, X, Save, Check, ChevronDown, Activity, Settings, CalendarDays, Users } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Modal } from '../../components/common/Modal';
import { useDialog } from '../../context/DialogContext';
import { useAuth } from '../../hooks/useAuth';
import { RolesService } from '../../services/rolesService';
import type { Role, Permission } from '../../types';

export default function RolesPage() {
    const { confirm } = useDialog();
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
    const [expandedGroup, setExpandedGroup] = useState<string | null>(permissionGroups[0] || null);

    const toggleGroup = (group: string) => {
        setExpandedGroup(prev => prev === group ? null : group);
    };

    const getGroupIcon = (groupName: string) => {
        const lower = groupName.toLowerCase();
        if (lower.includes('valoriza')) return <Activity className="w-4 h-4" />;
        if (lower.includes('config')) return <Settings className="w-4 h-4" />;
        if (lower.includes('tarifario')) return <CalendarDays className="w-4 h-4" />;
        if (lower.includes('dashboard')) return <Activity className="w-4 h-4" />;
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

    const handleSave = async () => {
        if (!formData.name) return;
        try {
            await RolesService.saveRole({ ...formData, id: editingRole?.id } as any);
            setIsModalOpen(false);
            setEditingRole(null);
            loadRoles();
        } catch (err) { console.error(err); }
    };

    const handleDelete = async (id: string) => {
        confirm({
            title: 'Eliminar Rol',
            message: '¿Está seguro de eliminar este rol?',
            onConfirm: async () => {
                try { await RolesService.deleteRole(id); loadRoles(); }
                catch (err) { console.error(err); }
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

    return (
        <>
            <div className="flex flex-col h-full bg-background animate-in fade-in zoom-in duration-300">
                {/* Header */}
                <div className="p-6 bg-card border border-border rounded-t-lg flex justify-between items-center shrink-0">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
                            <Shield className="w-6 h-6 text-primary" /> Gestión de Roles
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">Define permisos y niveles de acceso para Valorizaciones</p>
                    </div>
                    {hasPermission('val.config.roles') && (
                        <button 
                            onClick={handleCreate}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium shadow-sm shrink-0"
                        >
                            <Plus className="w-4 h-4" /> Nuevo Rol
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto bg-card border-x border-b border-border rounded-b-lg p-6">
                        {isLoading ? (
                            <div className="text-center py-12 text-muted-foreground italic">Cargando roles...</div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {roles
                                    .filter(role => (role.apps || APP_IDENTIFIER).split(',').some(a => a.trim().toUpperCase() === APP_IDENTIFIER))
                                    .map(role => (
                                        <div key={role.id} className="bg-background rounded-lg border border-border shadow-sm p-5 hover:shadow-md transition-shadow group/card">
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                                        <Shield className="w-5 h-5 text-primary" />
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-foreground text-sm">{role.name}</h3>
                                                        <p className="text-[11px] text-muted-foreground">{role.permissions.filter(p => allPermissions.some(ap => ap.id === p)).length} permisos VAL</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                                                    {hasPermission('val.config.roles') && (
                                                        <>
                                                            <button onClick={() => { setEditingRole(role); setFormData({ name: role.name, permissions: role.permissions, apps: role.apps || APP_IDENTIFIER }); setIsModalOpen(true); }} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="Editar">
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => handleDelete(role.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors" title="Eliminar">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-border">
                                                {role.permissions.filter(p => allPermissions.some(ap => ap.id === p)).length === 0 ? (
                                                    <span className="text-xs text-muted-foreground italic">Sin permisos VAL asignados</span>
                                                ) : (
                                                    role.permissions
                                                        .filter(p => allPermissions.some(ap => ap.id === p))
                                                        .map(p => (
                                                            <span key={p} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-secondary-foreground border border-border">
                                                                {allPermissions.find(ap => ap.id === p)?.label || p}
                                                            </span>
                                                        ))
                                                )}
                                            </div>
                                        </div>
                                    ))
                                }
                                {roles.filter(role => (role.apps || APP_IDENTIFIER).split(',').some(a => a.trim().toUpperCase() === APP_IDENTIFIER)).length === 0 && (
                                    <div className="col-span-full text-center py-12 text-muted-foreground italic opacity-60">No hay roles definidos para mostrar.</div>
                                )}
                            </div>
                        )}
                </div>
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingRole ? 'Configuración de Rol' : 'Nuevo Rol'} size="xl">
                <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
                    <div className="space-y-6 py-2">
                        <div className="bg-muted/30 p-4 rounded-xl border border-border/50">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                <label className="shrink-0 flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">
                                    <Shield className="w-3.5 h-3.5 text-primary" />
                                    Nombre del Rol:
                                </label>
                                <input 
                                    type="text" 
                                    required
                                    value={formData.name || ''} 
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full h-10 px-4 bg-background border border-input rounded-lg text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none" 
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-4">
                                <h3 className="text-sm font-bold text-foreground uppercase tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                    Panel de Permisos
                                </h3>
                                <div className="h-px bg-border flex-1" />
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {permissionGroups.map(group => {
                                    const isExpanded = expandedGroup === group;
                                    return (
                                        <div key={group} className="border border-border/50 rounded-xl overflow-hidden bg-background">
                                            <button 
                                                type="button"
                                                onClick={() => toggleGroup(group)}
                                                className="w-full flex items-center justify-between p-3.5 hover:bg-muted/30 transition-colors"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                                                        {getGroupIcon(group)}
                                                    </div>
                                                    <p className="text-sm font-bold text-foreground tracking-tight">{group}</p>
                                                </div>
                                                <ChevronDown className={cn(
                                                    "w-4 h-4 text-muted-foreground transition-transform duration-300",
                                                    !isExpanded && "-rotate-90"
                                                )} />
                                            </button>

                                            {isExpanded && (
                                                <div className="p-4 pt-0 border-t border-border/50 bg-muted/5">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-4">
                                                        {allPermissions.filter(p => p.group === group).map(perm => {
                                                            const isSelected = formData.permissions?.includes(perm.id);
                                                            return (
                                                                <button 
                                                                    type="button"
                                                                    key={perm.id} 
                                                                    onClick={() => togglePermission(perm.id)}
                                                                    className={cn(
                                                                        "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs text-left transition-all border",
                                                                        isSelected
                                                                            ? 'bg-primary/5 border-primary/30 text-primary'
                                                                            : 'bg-background border-border text-muted-foreground hover:bg-muted/30'
                                                                    )}
                                                                >
                                                                    <div className={cn(
                                                                        "w-4 h-4 rounded-md flex items-center justify-center transition-all shrink-0",
                                                                        isSelected 
                                                                            ? 'bg-primary text-primary-foreground' 
                                                                            : 'bg-muted border border-border'
                                                                    )}>
                                                                        {isSelected && <Check className="w-3 h-3 stroke-[3px]" />}
                                                                    </div>
                                                                    <span className="font-medium truncate">{perm.label}</span>
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
                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent rounded-md">Cancelar</button>
                        <button type="submit" className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md shadow-sm">Guardar Rol</button>
                    </div>
                </form>
            </Modal>
        </>
    );
}
