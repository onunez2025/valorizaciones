import React, { useState, useEffect } from 'react';
import { 
    Plus, 
    Trash2, 
    Search, 
    Edit2, 
    Check, 
    Users, 
    ChevronUp, 
    ChevronDown, 
    ChevronRight, 
    Activity, 
    ShieldCheck, 
    AppWindow, 
    Database, 
    XCircle, 
    Layout,
    Save
} from 'lucide-react';
import { Modal } from '../../components/common/Modal';
import { useDialog } from '../../context/DialogContext';
import { UsersService } from '../../services/usersService';
import { RolesService } from '../../services/rolesService';
import { useTableResizer } from '../../hooks/useTableResizer';
import { ResizableHeader } from '../../components/common/ResizableHeader';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '../../utils/cn';
import type { User, Role } from '../../types';

export default function UsersPage() {
    const { confirm, alert } = useDialog();
    const { hasPermission } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<(Partial<User> & { password_hash?: string }) | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [sortBy, setSortBy] = useState<string>('username');
    const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
    const [error, setError] = useState('');

    const APP_IDENTIFIER = 'VAL';

    const { widths, onResizeStart } = useTableResizer('val_users_column_widths', {
        usuario: 250,
        email: 220,
        rol: 160,
        apps: 220
    });

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [u, r] = await Promise.all([
                UsersService.getUsers(),
                RolesService.getRoles()
            ]);
            setUsers(u);
            setRoles(r);
        } catch (err: any) { 
            console.error(err);
            setError(err.message || 'Error al cargar los datos');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        setError('');
        try {
            await UsersService.saveUser(editingUser as User);
            setIsModalOpen(false);
            setEditingUser(null);
            loadData();
        } catch (err: any) {
            setError(err.message || 'Error crítico al procesar la identidad');
        }
    };

    const handleDelete = (id: string) => {
        confirm({
            title: 'Eliminar usuario',
            message: '¿Estás seguro de que deseas eliminar este usuario? El ID de usuario será revocado permanentemente en el sistema de Valorizaciones.',
            type: 'danger',
            confirmText: 'Eliminar usuario',
            onConfirm: async () => {
                try {
                    await UsersService.deleteUser(id);
                    loadData();
                } catch (err: any) { 
                    alert({ title: 'Error', message: err.message || 'No se pudo eliminar el usuario', type: 'error' });
                }
            }
        });
    };

    const openNew = () => {
        setEditingUser({ full_name: '', username: '', email: '', role_id: '', management_id: '', is_active: true, apps: APP_IDENTIFIER, password_hash: '' });
        setError('');
        setIsModalOpen(true);
    };

    const toggleApp = (appCode: string) => {
        if (!editingUser) return;
        const currentApps = (editingUser.apps || '').split(',').map(a => a.trim()).filter(Boolean);
        const updatedApps = currentApps.includes(appCode)
            ? currentApps.filter(a => a !== appCode)
            : [...currentApps, appCode];
        
        setEditingUser({ ...editingUser, apps: updatedApps.join(', ') });
    };

    const openEdit = (user: User) => {
        setEditingUser({ ...user, password_hash: '' });
        setError('');
        setIsModalOpen(true);
    };

    const handleSort = (column: string) => {
        if (sortBy === column) {
            setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
        } else {
            setSortBy(column);
            setSortOrder('ASC');
        }
    };

    const SortIcon = ({ column }: { column: string }) => {
        if (sortBy !== column) return <ChevronUp className="w-3.5 h-3.5 opacity-20" />;
        return sortOrder === 'ASC' 
            ? <ChevronUp className="w-3.5 h-3.5 text-primary" /> 
            : <ChevronDown className="w-3.5 h-3.5 text-primary" />;
    };

    const filtered = users
        .filter(u =>
            (u.apps || APP_IDENTIFIER).split(',').some(a => a.trim().toUpperCase() === APP_IDENTIFIER) &&
            ((u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
            (u.username || '').toLowerCase().includes(search.toLowerCase()) ||
            (u.email || '').toLowerCase().includes(search.toLowerCase()))
        )
        .sort((a, b) => {
            const factor = sortOrder === 'ASC' ? 1 : -1;
            if (sortBy === 'username') return (a.username || '').localeCompare(b.username || '') * factor;
            if (sortBy === 'email') return (a.email || '').localeCompare(b.email || '') * factor;
            if (sortBy === 'rol') return (a.role_name || '').localeCompare(b.role_name || '') * factor;
            return 0;
        });

    return (
        <div className="flex flex-col h-full space-y-3 min-h-0 animate-in fade-in duration-500">
            {/* Header: SIATC Standard */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 px-1">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                        <Users className="w-4 h-4" />
                        <span>Configuración</span>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                        <span className="text-foreground">Gestión de Usuarios</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestión de Usuarios</h1>
                    <p className="text-sm text-muted-foreground">Administra los permisos y accesos al ecosistema de Valorizaciones</p>
                </div>
                {hasPermission('val.config.users') && (
                    <button
                        onClick={openNew}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all active:scale-95 font-semibold text-sm shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Usuario
                    </button>
                )}
            </div>

            {/* Content Container */}
            <div className="flex-1 min-h-0 flex flex-col bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                {/* Search / Filters Toolbar */}
                <div className="p-3.5 border-b border-border bg-muted/20 flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por nombre, usuario o email..."
                            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                        />
                    </div>
                </div>

                {/* Table Area */}
                <div className="flex-1 overflow-auto relative custom-scrollbar">
                    {isLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/50 backdrop-blur-sm z-50">
                            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-bold text-muted-foreground mt-4 tracking-widest">Sincronizando identidades...</span>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left border-collapse table-fixed min-w-[1000px]">
                            <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-md">
                                <tr className="border-b border-border">
                                    <ResizableHeader columnId="usuario" width={widths.usuario} onResizeStart={onResizeStart} className="px-6 py-3.5">
                                        <div className="flex items-center justify-between gap-2 group/header cursor-pointer" onClick={() => handleSort('username')}>
                                            <span className="font-bold text-[11px] tracking-wider text-muted-foreground">Responsable / ID</span>
                                            <SortIcon column="username" />
                                        </div>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="email" width={widths.email} onResizeStart={onResizeStart} className="px-6 py-3.5">
                                        <div className="flex items-center justify-between gap-2 group/header cursor-pointer" onClick={() => handleSort('email')}>
                                            <span className="font-bold text-[11px] tracking-wider text-muted-foreground">Correo corporativo</span>
                                            <SortIcon column="email" />
                                        </div>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="rol" width={widths.rol} onResizeStart={onResizeStart} className="px-6 py-3.5">
                                        <div className="flex items-center justify-between gap-2 group/header cursor-pointer" onClick={() => handleSort('rol')}>
                                            <span className="font-bold text-[11px] tracking-wider text-muted-foreground">Perfil de seguridad</span>
                                            <SortIcon column="rol" />
                                        </div>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="apps" width={widths.apps} onResizeStart={onResizeStart} className="px-6 py-3.5 text-center">
                                        <span className="font-bold text-[11px] tracking-wider text-muted-foreground">Alcance ecosistema</span>
                                    </ResizableHeader>
                                    <th className="px-6 py-3.5 w-24 bg-muted/30 text-right italic font-medium text-[11px] text-muted-foreground">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-20 text-center opacity-60">
                                            <div className="flex flex-col items-center gap-3">
                                                <Activity className="w-10 h-10 text-muted-foreground/20" />
                                                <p className="text-sm font-medium text-muted-foreground italic">No se encontraron identidades para el filtro seleccionado</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((user) => (
                                        <tr key={user.id} className="group hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xs border border-primary/20 shadow-inner shrink-0 uppercase">
                                                        {user.username?.substring(0, 2)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-foreground text-sm truncate tracking-tight">{user.full_name || user.username}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono truncate flex items-center gap-1.5 opacity-60 mt-0.5">
                                                            <Activity className="w-2.5 h-2.5" /> {user.username}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5">
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-muted-foreground font-medium truncate">{user.email}</span>
                                                    {!user.is_active && (
                                                        <span className="text-[9px] font-bold text-destructive tracking-tight mt-0.5">Cuenta suspendida</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex items-center px-3 py-0.5 rounded-full text-[10px] font-bold bg-primary/5 text-primary border border-primary/20 shadow-sm whitespace-nowrap">
                                                        <ShieldCheck className="w-3 h-3 mr-1.5 opacity-60" />
                                                        {user.role_name || 'Sin perfil'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5">
                                                <div className="flex flex-wrap gap-1 justify-center">
                                                    {(user.apps || APP_IDENTIFIER).split(',').map((app: string) => (
                                                        <span key={app} className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-bold bg-muted text-muted-foreground border border-border/50 tracking-tight group-hover:bg-primary/5 group-hover:text-primary group-hover:border-primary/20 transition-all uppercase">
                                                            {app.trim()}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {hasPermission('val.config.users') && (
                                                        <>
                                                            <button
                                                                onClick={() => openEdit(user)}
                                                                className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all active:scale-90"
                                                                title="Configurar"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(user.id)}
                                                                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all active:scale-90"
                                                                title="Revocar"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
                
                {/* Footer Stats */}
                <div className="px-6 py-2.5 border-t border-border bg-muted/30 flex items-center justify-between shrink-0">
                    <p className="text-[10px] font-bold text-muted-foreground tracking-widest">
                        Total identidades activas en Valorizaciones: <span className="text-foreground ml-1">{filtered.length}</span>
                    </p>
                </div>
            </div>

            {/* Modal de Usuario: SIATC Standard */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser?.id ? 'Configuración de Identidad' : 'Nueva Identidad Ecosistema'} size="lg">
                <form onSubmit={handleSave} className="p-6 pt-2 space-y-6">
                    {error && (
                        <div className="p-4 bg-rose-500/10 text-rose-700 rounded-xl border border-rose-500/20 text-xs font-bold tracking-tight flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                            <XCircle className="w-5 h-5 shrink-0" />
                            {error}
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-muted-foreground tracking-widest pl-1">Nombre completo:</label>
                            <input
                                type="text"
                                required
                                value={editingUser?.full_name || ''}
                                onChange={(e) => setEditingUser(prev => prev ? { ...prev, full_name: e.target.value } : null)}
                                className="w-full h-11 px-4 bg-background border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/30"
                                placeholder="Ej: Juan Pérez"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-muted-foreground tracking-widest pl-1">ID de acceso / Usuario:</label>
                            <div className="relative">
                                <Activity className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                <input
                                    type="text"
                                    required
                                    value={editingUser?.username || ''}
                                    onChange={(e) => setEditingUser(prev => prev ? { ...prev, username: e.target.value } : null)}
                                    className="w-full h-11 pl-10 pr-4 bg-background border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/30 font-mono"
                                    placeholder="Ej: jperez"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-muted-foreground tracking-widest pl-1">Correo corporativo:</label>
                            <input
                                type="email"
                                required
                                value={editingUser?.email || ''}
                                onChange={(e) => setEditingUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                                className="w-full h-11 px-4 bg-background border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/30"
                                placeholder="ejemplo@siatc.com"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-muted-foreground tracking-widest pl-1">
                                {editingUser?.id ? 'Actualizar credencial:' : 'Credencial de acceso:'}
                            </label>
                            <input
                                type="password"
                                required={!editingUser?.id}
                                value={editingUser?.password_hash || ''}
                                onChange={(e) => setEditingUser(prev => prev ? { ...prev, password_hash: e.target.value } : null)}
                                className="w-full h-11 px-4 bg-background border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/30 font-mono"
                                placeholder={editingUser?.id ? "Solo si desea cambiar" : "••••••••"}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-muted-foreground tracking-widest pl-1">Perfil de seguridad:</label>
                            <div className="relative">
                                <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                <select
                                    required
                                    value={editingUser?.role_id || ''}
                                    onChange={(e) => setEditingUser(prev => prev ? { ...prev, role_id: e.target.value } : null)}
                                    className="w-full h-11 pl-10 pr-4 bg-background border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all appearance-none cursor-pointer"
                                >
                                    <option value="" disabled>Seleccionar perfil...</option>
                                    {roles.map(role => (
                                        <option key={role.id} value={role.id}>{role.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="col-span-full pt-2">
                            <label className="text-xs font-bold text-muted-foreground tracking-widest pl-1 mb-3 block">Ámbito del ecosistema SIATC:</label>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                {[
                                    { id: 'EBM', label: 'EBM' },
                                    { id: 'FSM', label: 'Gestor FSM' },
                                    { id: 'TCtrl', label: 'Tablero' },
                                    { id: 'Liq', label: 'Liquidaciones' },
                                    { id: 'VAL', label: 'Valorizaciones' }
                                ].map(app => {
                                    const isSelected = (editingUser?.apps || '').split(',').map(a => a.trim()).includes(app.id);
                                    return (
                                        <button
                                            key={app.id}
                                            type="button"
                                            onClick={() => toggleApp(app.id)}
                                            className={cn(
                                                "flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[10px] font-bold tracking-tight transition-all border shadow-sm",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                                    : "bg-background border-border text-muted-foreground hover:bg-muted"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 rounded-lg border flex items-center justify-center transition-all shrink-0",
                                                isSelected ? "bg-white text-primary border-white" : "bg-card border-border shadow-inner"
                                            )}>
                                                {isSelected && <Check className="w-2.5 h-2.5" />}
                                            </div>
                                            {app.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="col-span-full pt-1">
                             <button
                                type="button"
                                onClick={() => setEditingUser(prev => prev ? { ...prev, is_active: !prev.is_active } : null)}
                                className={cn(
                                    "w-full flex items-center justify-between px-5 py-3.5 rounded-xl text-xs font-bold transition-all border shadow-sm",
                                    editingUser?.is_active
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                                        : "bg-rose-50 text-rose-700 border-rose-200/50"
                                )}
                            >
                                <span className="tracking-widest">Estado operativo:</span>
                                <div className="flex items-center gap-3">
                                    {editingUser?.is_active ? 'Habilitado' : 'Suspendido'}
                                    <div className={cn(
                                        "w-9 h-4.5 rounded-full relative transition-colors",
                                        editingUser?.is_active ? "bg-emerald-500" : "bg-rose-500"
                                    )}>
                                        <div className={cn(
                                            "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all",
                                            editingUser?.is_active ? "left-5" : "left-0.5"
                                        )} />
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-border mt-2">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1 px-4 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted rounded-xl transition-all tracking-widest active:scale-95"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-2.5 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/25 active:scale-95 transition-all tracking-widest flex items-center justify-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            {editingUser?.id ? 'Guardar cambios' : 'Confirmar usuario'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
