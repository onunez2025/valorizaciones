import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Search, Edit2, Save, Users, ChevronUp, ChevronDown } from 'lucide-react';
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
    const { confirm } = useDialog();
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
        email: 200,
        rol: 150,
        apps: 200
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

    const handleSave = async () => {
        if (!editingUser) return;
        setError('');
        try {
            await UsersService.saveUser(editingUser);
            setIsModalOpen(false);
            setEditingUser(null);
            loadData();
        } catch (err: any) {
            setError(err.message || 'Error al guardar');
        }
    };

    const handleDelete = async (id: string) => {
        confirm({
            title: 'Eliminar Usuario',
            message: '¿Está seguro de eliminar este usuario?',
            onConfirm: async () => {
                try {
                    await UsersService.deleteUser(id);
                    loadData();
                } catch (err) { console.error(err); }
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
        <div className="flex flex-col h-full bg-background animate-in fade-in zoom-in duration-300">
            {/* Header */}
            <div className="p-6 bg-card border border-border rounded-t-lg flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-foreground">
                        <Users className="w-6 h-6 text-primary" /> Gestión de Usuarios
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Administra los accesos y perfiles del sistema VAL</p>
                </div>
                {hasPermission('val.config.users') && (
                    <button 
                        onClick={openNew}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium shadow-sm shrink-0"
                    >
                        <Plus className="w-4 h-4" /> Nuevo Usuario
                    </button>
                )}
            </div>

            {/* Toolbar */}
            <div className="p-4 bg-muted/30 border-x border-border flex flex-col sm:flex-row gap-4 shrink-0">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, usuario o email..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-md focus:ring-2 focus:ring-primary outline-none transition-all text-sm"
                    />
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto bg-card border-x border-b border-border rounded-b-lg scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {isLoading ? (
                    <div className="h-full flex items-center justify-center text-muted-foreground italic">
                        Cargando usuarios...
                    </div>
                ) : (
                    <table className="w-full text-sm text-left border-separate border-spacing-0">
                        <thead className="sticky top-0 z-20 bg-muted text-muted-foreground font-medium border-b border-border shadow-sm">
                            <tr>
                                <ResizableHeader columnId="usuario" width={widths.usuario} onResizeStart={onResizeStart} className="px-6 py-3 bg-muted border-b border-border group/header">
                                    <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                                        <span className="truncate pr-1 font-bold">Usuario</span>
                                        <button onClick={(e) => { e.stopPropagation(); handleSort('username'); }} className="p-1 hover:bg-primary/10 rounded-md transition-colors shrink-0"><SortIcon column="username" /></button>
                                    </div>
                                </ResizableHeader>
                                <ResizableHeader columnId="email" width={widths.email} onResizeStart={onResizeStart} className="px-6 py-3 bg-muted border-b border-border group/header">
                                    <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                                        <span className="truncate pr-1 font-bold">Email</span>
                                        <button onClick={(e) => { e.stopPropagation(); handleSort('email'); }} className="p-1 hover:bg-primary/10 rounded-md transition-colors shrink-0"><SortIcon column="email" /></button>
                                    </div>
                                </ResizableHeader>
                                <ResizableHeader columnId="rol" width={widths.rol} onResizeStart={onResizeStart} className="px-6 py-3 bg-muted border-b border-border group/header">
                                    <div className="flex items-center justify-between gap-1 w-full overflow-hidden">
                                        <span className="truncate pr-1 font-bold">Rol</span>
                                        <button onClick={(e) => { e.stopPropagation(); handleSort('rol'); }} className="p-1 hover:bg-primary/10 rounded-md transition-colors shrink-0"><SortIcon column="rol" /></button>
                                    </div>
                                </ResizableHeader>
                                <ResizableHeader columnId="apps" width={widths.apps} onResizeStart={onResizeStart} className="px-6 py-3 bg-muted border-b border-border">
                                    <span className="font-bold">Aplicaciones</span>
                                </ResizableHeader>
                                <th className="px-6 py-3 text-right bg-muted border-b border-border font-bold">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filtered.map(u => (
                                <tr key={u.id} className="hover:bg-muted/30 transition-colors group">
                                    <td style={{ width: widths.usuario }} className="px-6 py-4 truncate text-foreground">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs shrink-0 border border-primary/20">
                                                {u.username?.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="truncate">
                                                <p className="font-medium text-foreground truncate">{u.full_name || u.username}</p>
                                                <p className="text-[11px] text-muted-foreground truncate">@{u.username}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ width: widths.email }} className="px-6 py-4 text-foreground truncate">{u.email}</td>
                                    <td style={{ width: widths.rol }} className="px-6 py-4 truncate text-foreground">
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary text-secondary-foreground border border-border/50 uppercase tracking-tight">
                                            {u.role_name || 'Sin Rol'}
                                        </span>
                                    </td>
                                    <td style={{ width: widths.apps }} className="px-6 py-4 truncate">
                                        <div className="flex flex-wrap gap-1">
                                            {(u.apps || APP_IDENTIFIER).split(',').map(app => (
                                                <span key={app} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/5 text-primary border border-primary/10 uppercase tracking-tighter">
                                                    {app.trim()}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right whitespace-nowrap">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {hasPermission('val.config.users') && (
                                                <>
                                                    <button onClick={() => openEdit(u)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors" title="Editar">
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => handleDelete(u.id)} className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-colors" title="Eliminar">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser?.id ? 'Configuración de Usuario' : 'Nuevo Usuario'} size="lg">
                <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-muted-foreground uppercase pl-1">Nombre Completo *</label>
                            <input type="text" required value={editingUser?.full_name || ''} onChange={e => setEditingUser(prev => prev ? { ...prev, full_name: e.target.value } : null)}
                                className="w-full h-10 px-3 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-muted-foreground uppercase pl-1">Usuario *</label>
                            <input type="text" required value={editingUser?.username || ''} onChange={e => setEditingUser(prev => prev ? { ...prev, username: e.target.value } : null)}
                                className="w-full h-10 px-3 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-muted-foreground uppercase pl-1">Correo Electrónico *</label>
                            <input type="email" required value={editingUser?.email || ''} onChange={e => setEditingUser(prev => prev ? { ...prev, email: e.target.value } : null)}
                                className="w-full h-10 px-3 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-muted-foreground uppercase pl-1">{editingUser?.id ? 'Actualizar Contraseña' : 'Contraseña *'}</label>
                            <input type="password" required={!editingUser?.id} value={editingUser?.password_hash || ''} onChange={e => setEditingUser(prev => prev ? { ...prev, password_hash: e.target.value } : null)}
                                className="w-full h-10 px-3 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all" placeholder={editingUser?.id ? 'Dejar vacío para mantener' : ''} />
                        </div>
                        <div className="space-y-1 col-span-full">
                            <label className="text-xs font-bold text-muted-foreground uppercase pl-1">Rol del Sistema *</label>
                            <select required value={editingUser?.role_id || ''} onChange={e => setEditingUser(prev => prev ? { ...prev, role_id: e.target.value } : null)}
                                className="w-full h-10 px-3 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none pointer-cursor">
                                <option value="">Seleccionar rol</option>
                                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                            </select>
                        </div>
                        
                        <div className="col-span-full border-t border-border pt-4 mt-2">
                            <label className="block text-[11px] font-bold text-muted-foreground uppercase mb-4">Módulos Autorizados</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { id: 'EBM', label: 'EBM Core' },
                                    { id: 'FSM', label: 'Gestor FSM' },
                                    { id: 'TCtrl', label: 'Tablero' },
                                    { id: 'Liq', label: 'Liquidaciones' },
                                    { id: 'VAL', label: 'Valorizaciones' }
                                ].map(app => {
                                    const isSelected = (editingUser?.apps || '').split(',').map(a => a.trim()).includes(app.id);
                                    return (
                                        <button key={app.id} type="button" onClick={() => toggleApp(app.id)}
                                            className={cn(
                                                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all border",
                                                isSelected
                                                    ? 'bg-primary/5 border-primary/30 text-primary'
                                                    : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted'
                                            )}>
                                            <div className={cn(
                                                "w-3.5 h-3.5 rounded border flex items-center justify-center transition-all",
                                                isSelected ? 'bg-primary border-primary text-white' : 'border-input bg-background'
                                            )}>
                                                {isSelected && <Save className="w-2 h-2" /> }
                                            </div>
                                            {app.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex items-center gap-4 col-span-full border-t border-border pt-4">
                            <div className="flex items-center gap-2 cursor-pointer transition-colors" onClick={() => setEditingUser(prev => prev ? { ...prev, is_active: !prev.is_active } : null)}>
                                <div className={cn(
                                    "w-4 h-4 rounded border flex items-center justify-center transition-all",
                                    editingUser?.is_active ? 'bg-emerald-500 border-emerald-600 text-white' : 'border-input bg-background'
                                )}>
                                    {editingUser?.is_active && <Save className="w-2.5 h-2.5" />}
                                </div>
                                <label className="text-xs font-bold text-foreground cursor-pointer uppercase">Estado: {editingUser?.is_active ? 'Activo' : 'Inactivo'}</label>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-xs font-bold text-muted-foreground hover:bg-accent rounded-lg transition-all uppercase">Cerrar</button>
                        <button type="submit" className="px-5 py-2 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg shadow-md transition-all uppercase flex items-center gap-2">
                            <Save className="w-3.5 h-3.5" /> Guardar Cambios
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
