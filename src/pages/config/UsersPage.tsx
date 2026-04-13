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
    Layout 
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
    const [editingUser, setEditingUser] = useState<Partial<User> & { password_hash?: string } | null>(null);
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
            title: 'Eliminar Identidad de Acceso',
            message: '¿Estás seguro de que deseas eliminar este usuario? El ID de usuario será revocado permanentemente en el sistema de Valorizaciones.',
            type: 'danger',
            confirmText: 'Revocar Acceso',
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
        <div className="flex flex-col h-full space-y-4 min-h-0 animate-in fade-in duration-500">
            {/* Header: SIATC Standard */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                        <Users className="w-4 h-4" />
                        <span>Configuración</span>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                        <span className="text-foreground">Gestión de Usuarios</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Identidades de Usuario</h1>
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
                <div className="p-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row items-center gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filtrar por nombre, usuario o email..."
                            className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium"
                        />
                    </div>
                </div>

                {/* Table Area */}
                <div className="flex-1 overflow-auto relative custom-scrollbar">
                    {isLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/50 backdrop-blur-sm z-50">
                            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-medium text-muted-foreground mt-4 uppercase tracking-[0.2em]">Sincronizando identidades...</span>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left border-collapse table-fixed min-w-[1000px]">
                            <thead className="sticky top-0 z-20 bg-muted/90 backdrop-blur-md">
                                <tr className="border-b border-border">
                                    <ResizableHeader columnId="usuario" width={widths.usuario} onResizeStart={onResizeStart} className="px-6 py-4">
                                        <div className="flex items-center justify-between gap-2 group/header cursor-pointer" onClick={() => handleSort('username')}>
                                            <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Responsable / ID</span>
                                            <SortIcon column="username" />
                                        </div>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="email" width={widths.email} onResizeStart={onResizeStart} className="px-6 py-4">
                                        <div className="flex items-center justify-between gap-2 group/header cursor-pointer" onClick={() => handleSort('email')}>
                                            <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Correo Corporativo</span>
                                            <SortIcon column="email" />
                                        </div>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="rol" width={widths.rol} onResizeStart={onResizeStart} className="px-6 py-4">
                                        <div className="flex items-center justify-between gap-2 group/header cursor-pointer" onClick={() => handleSort('rol')}>
                                            <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Perfil Escupido</span>
                                            <SortIcon column="rol" />
                                        </div>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="apps" width={widths.apps} onResizeStart={onResizeStart} className="px-6 py-4">
                                        <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground text-center">Alcance Ecosistema</span>
                                    </ResizableHeader>
                                    <th className="px-6 py-4 w-28 bg-muted/30 text-right italic font-medium text-xs text-muted-foreground">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filtered.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-20 text-center opacity-60">
                                            <div className="flex flex-col items-center gap-3">
                                                <Activity className="w-12 h-12 text-muted-foreground/20" />
                                                <p className="text-sm font-medium text-muted-foreground italic">No se encontraron identidades para el filtro seleccionado</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filtered.map((user) => (
                                        <tr key={user.id} className="group hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-xs border border-primary/20 shadow-inner shrink-0">
                                                        {user.username?.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-foreground text-sm uppercase truncate tracking-tight">{user.full_name || user.username}</div>
                                                        <div className="text-[10px] text-muted-foreground font-mono truncate uppercase flex items-center gap-1.5 opacity-60 mt-0.5">
                                                            <Activity className="w-2.5 h-2.5" /> ID: {user.username}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-muted-foreground font-medium truncate">{user.email}</span>
                                                    {!user.is_active && (
                                                        <span className="text-[9px] font-black text-destructive uppercase tracking-widest mt-0.5">Cuenta Suspendida</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="inline-flex items-center px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-primary/5 text-primary border border-primary/20 shadow-sm whitespace-nowrap">
                                                        <ShieldCheck className="w-3 h-3 mr-1.5 opacity-60" />
                                                        {user.role_name || 'SIN PERFIL'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-1.5 justify-center">
                                                    {(user.apps || APP_IDENTIFIER).split(',').map((app: string) => (
                                                        <span key={app} className="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black bg-muted text-muted-foreground border border-border/50 uppercase tracking-widest group-hover:bg-primary/5 group-hover:text-primary group-hover:border-primary/20 transition-all">
                                                            {app.trim()}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {hasPermission('val.config.users') && (
                                                        <>
                                                            <button
                                                                onClick={() => openEdit(user)}
                                                                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all active:scale-90"
                                                                title="Configurar Identidad"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(user.id)}
                                                                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all active:scale-90"
                                                                title="Revocar Acceso"
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
                <div className="px-6 py-3 border-t border-border bg-muted/30 flex items-center justify-between shrink-0">
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                        Total identidades activas en valorizaciones: <span className="text-foreground ml-1">{filtered.length}</span>
                    </p>
                </div>
            </div>

            {/* Modal de Usuario: SIATC Standard */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser?.id ? 'GESTIÓN DE IDENTIDAD' : 'NUEVO USUARIO ECOSISTEMA'} size="lg">
                <form onSubmit={handleSave} className="p-6 pt-2 space-y-6">
                    {error && (
                        <div className="p-4 bg-rose-500/10 text-rose-700 rounded-2xl border border-rose-500/20 text-xs font-black uppercase tracking-widest flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                            <XCircle className="w-5 h-5 shrink-0" />
                            {error}
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">Nombre Completo:</label>
                            <input
                                type="text"
                                required
                                value={editingUser?.full_name || ''}
                                onChange={(e) => setEditingUser(prev => prev ? { ...prev, full_name: e.target.value.toUpperCase() } : null)}
                                className="w-full h-12 px-4 bg-background border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/30"
                                placeholder="EJ: JUAN PÉREZ"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">ID de Acceso / Usuario:</label>
                            <div className="relative">
                                <Activity className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                <input
                                    type="text"
                                    required
                                    value={editingUser?.username || ''}
                                    onChange={(e) => setEditingUser(prev => prev ? { ...prev, username: e.target.value } : null)}
                                    className="w-full h-12 pl-10 pr-4 bg-background border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/30 font-mono"
                                    placeholder="ej: jperez"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">Correo Corporativo:</label>
                            <input
                                type="email"
                                required
                                value={editingUser?.email || ''}
                                onChange={(e) => setEditingUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                                className="w-full h-12 px-4 bg-background border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/30"
                                placeholder="ejemplo@siatc.com"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">
                                {editingUser?.id ? 'Actualizar Credencial:' : 'Credencial de Acceso:'}
                            </label>
                            <input
                                type="password"
                                required={!editingUser?.id}
                                value={editingUser?.password_hash || ''}
                                onChange={(e) => setEditingUser(prev => prev ? { ...prev, password_hash: e.target.value } : null)}
                                className="w-full h-12 px-4 bg-background border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all placeholder:text-muted-foreground/30 font-mono"
                                placeholder={editingUser?.id ? "SOLO SI DESEA CAMBIAR" : "••••••••"}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1">Perfil de Seguridad:</label>
                            <div className="relative">
                                <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                                <select
                                    required
                                    value={editingUser?.role_id || ''}
                                    onChange={(e) => setEditingUser(prev => prev ? { ...prev, role_id: e.target.value } : null)}
                                    className="w-full h-12 pl-10 pr-4 bg-background border border-border rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all appearance-none cursor-pointer"
                                >
                                    <option value="" disabled>Seleccionar perfil...</option>
                                    {roles.map(role => (
                                        <option key={role.id} value={role.id}>{role.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="col-span-full pt-4">
                            <label className="text-xs font-black text-muted-foreground uppercase tracking-widest pl-1 mb-4 block">Alcance del Ecosistema SIATC:</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    { id: 'EBM', label: 'EBM' },
                                    { id: 'FSM', label: 'GESTOR FSM' },
                                    { id: 'TCtrl', label: 'TABLERO' },
                                    { id: 'Liq', label: 'LIQUIDACIONES' },
                                    { id: 'VAL', label: 'VALORIZACIONES' }
                                ].map(app => {
                                    const isSelected = (editingUser?.apps || '').split(',').map(a => a.trim()).includes(app.id);
                                    return (
                                        <button
                                            key={app.id}
                                            type="button"
                                            onClick={() => toggleApp(app.id)}
                                            className={cn(
                                                "flex items-center gap-3 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground border-primary shadow-primary/20"
                                                    : "bg-background border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 rounded-lg border flex items-center justify-center transition-all",
                                                isSelected ? "bg-white text-primary border-white" : "bg-card border-border shadow-inner"
                                            )}>
                                                {isSelected && <AppWindow className="w-2.5 h-2.5" />}
                                            </div>
                                            {app.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="col-span-full pt-2">
                             <button
                                type="button"
                                onClick={() => setEditingUser(prev => prev ? { ...prev, is_active: !prev.is_active } : null)}
                                className={cn(
                                    "w-full flex items-center justify-between px-6 py-4 rounded-2xl text-xs font-black uppercase transition-all border shadow-sm",
                                    editingUser?.is_active
                                        ? "bg-emerald-50 text-emerald-700 border-emerald-200/50"
                                        : "bg-rose-50 text-rose-700 border-rose-200/50"
                                )}
                            >
                                <span className="tracking-widest">Estado Operativo de Identidad:</span>
                                <div className="flex items-center gap-3">
                                    {editingUser?.is_active ? 'HABILITADO' : 'SUSPENDIDO'}
                                    <div className={cn(
                                        "w-10 h-5 rounded-full relative transition-colors",
                                        editingUser?.is_active ? "bg-emerald-500" : "bg-rose-500"
                                    )}>
                                        <div className={cn(
                                            "absolute top-1 w-3 h-3 rounded-full bg-white transition-all",
                                            editingUser?.is_active ? "left-6" : "left-1"
                                        )} />
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-6 border-t border-border mt-2">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="flex-1 px-4 py-3 text-xs font-black text-muted-foreground hover:bg-muted rounded-2xl transition-all uppercase tracking-widest active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Layout className="w-4 h-4" />
                            DESCARTAR
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-3 text-xs font-black text-primary-foreground bg-primary hover:bg-primary/90 rounded-2xl shadow-xl shadow-primary/25 active:scale-95 transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                        >
                            <Check className="w-4 h-4 stroke-[3]" />
                            {editingUser?.id ? 'CONFIRMAR CAMBIOS' : 'ALTA DE USUARIO'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
