import React, { useState, useEffect } from 'react';
import {
    Users as UsersIcon,
    Search,
    Plus,
    Edit2,
    Trash2,
    Check,
    ChevronUp,
    ChevronDown,
    ChevronRight,
    Activity,
    ShieldCheck,
    XCircle,
    Save
} from 'lucide-react';
import { ManagementsService } from '../../services/managementsService';
import { UsersService } from '../../services/usersService';
import { RolesService } from '../../services/rolesService';
import type { User, Management, Role } from '../../types';
import { Modal } from '../../components/common/Modal';
import { cn } from '../../utils/cn';
import { toTitleCase } from '../../utils/formatters';
import { useTableResizer } from '../../hooks/useTableResizer';
import { ResizableHeader } from '../../components/common/ResizableHeader';
import { useAuth } from '../../hooks/useAuth';
import { useDialog } from '../../context/DialogContext';
import { 
    SIATCTable, 
    SIATCTableRow, 
    SIATCTableCell, 
    SIATCTableFooter 
} from '../../components/siatc/table/SIATCTable';

// ==========================================
// SIATC CONFIGURATION MODULE VARIABLES
// ==========================================
const APP_IDENTIFIER = 'VAL';
const APP_LABEL = 'Valorizaciones';
const PERMISSION_PREFIX = 'val';
const CACHE_KEY = 'val_users_column_widths';
const APP_CODE_DEFAULT = 'VAL';

const getInitials = (fullName?: string, username?: string) => {
    if (fullName) {
        const parts = fullName.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        if (parts.length === 1 && parts[0].length > 0) {
            return parts[0].substring(0, 2).toUpperCase();
        }
    }
    if (username) {
        const letters = username.replace(/[^a-zA-Z]/g, '');
        if (letters.length >= 2) {
            return letters.substring(0, 2).toUpperCase();
        }
        return username.substring(0, 2).toUpperCase();
    }
    return 'US';
};

export default function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [managements, setManagements] = useState<Management[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { hasPermission } = useAuth();
    const { confirm, alert } = useDialog();

    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<string>('username');
    const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');
    const [currentPage, setCurrentPage] = useState(1);
    const recordsPerPage = 10;

    // Resizing logic
    const { widths, onResizeStart } = useTableResizer(CACHE_KEY, {
        usuario: 250,
        email: 220,
        rol: 160,
        apps: 220
    });

    // Form state
    const [formData, setFormData] = useState<Partial<User>>({
        full_name: '',
        username: '',
        email: '',
        role_id: '',
        management_id: '',
        is_active: true,
        password_hash: '',
        apps: APP_CODE_DEFAULT
    });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [usersData, mgmtData, rolesData] = await Promise.all([
                UsersService.getUsers(),
                ManagementsService.getManagements(),
                RolesService.getRoles()
            ]);
            setUsers(usersData);
            setManagements(mgmtData);
            setRoles(rolesData);
        } catch (error) {
            console.error("Failed to load users data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleApp = (appCode: string) => {
        const currentApps = (formData.apps || '').split(',').map((a: string) => a.trim()).filter(Boolean);
        const updatedApps = currentApps.includes(appCode)
            ? currentApps.filter((a: string) => a !== appCode)
            : [...currentApps, appCode];
        
        setFormData({ ...formData, apps: updatedApps.join(', ') });
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

    const filteredUsers = users
        .filter(user =>
            (user.apps || APP_CODE_DEFAULT).split(',').some(a => a.trim().toUpperCase() === APP_IDENTIFIER.toUpperCase()) &&
            (user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))
        )
        .sort((a, b) => {
            const factor = sortOrder === 'ASC' ? 1 : -1;
            if (sortBy === 'username') return (a.username || '').localeCompare(b.username || '') * factor;
            if (sortBy === 'email') return (a.email || '').localeCompare(b.email || '') * factor;
            if (sortBy === 'rol') return (a.role_name || '').localeCompare(b.role_name || '') * factor;
            return 0;
        });

    const handleCreate = () => {
        setEditingUser(null);
        setError(null);
        setFormData({
            full_name: '',
            username: '',
            email: '',
            role_id: roles.length > 0 ? roles[0].id : '',
            management_id: managements.length > 0 ? managements[0].id : '',
            is_active: true,
            password_hash: '',
            apps: APP_CODE_DEFAULT
        });
        setIsModalOpen(true);
    };

    const handleEdit = (user: User) => {
        setEditingUser(user);
        setError(null);
        setFormData({ ...user, password_hash: '' });
        setIsModalOpen(true);
    };

    const handleDelete = (id: string) => {
        confirm({
            title: 'Revocar Identidad de Acceso',
            message: `¿Estás seguro de que deseas eliminar este usuario? El ID de usuario será revocado permanentemente en el sistema de ${APP_LABEL}.`,
            type: 'danger',
            confirmText: 'Revocar acceso',
            onConfirm: async () => {
                try {
                    await UsersService.deleteUser(id);
                    await loadData();
                } catch (error: any) {
                    alert({ title: 'Error', message: error.message || 'No se pudo eliminar el usuario', type: 'error' });
                }
            }
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        try {
            if (editingUser) {
                await UsersService.saveUser({ ...editingUser, ...formData } as User);
            } else {
                await UsersService.saveUser(formData as User);
            }
            setIsModalOpen(false);
            await loadData();
        } catch (error: any) {
            setError(error.message || 'Error crítico al procesar la identidad');
        }
    };

    const totalPages = Math.ceil(filteredUsers.length / recordsPerPage);
    const paginatedUsers = filteredUsers.slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage);

    return (
        <div className="flex flex-col h-full space-y-4 min-h-0 animate-in fade-in duration-500">
            {/* Header: SIATC Standard */}
            <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm text-cb-text-secondary font-medium">
                        <UsersIcon className="w-4 h-4 text-cb-neutral" />
                        <span>Configuración</span>
                        <ChevronRight className="w-3 h-3 opacity-50" />
                        <span className="text-cb-text-primary">Gestión de Usuarios</span>
                    </div>
                    <h1 className={SIATC_THEME.TYPOGRAPHY.PAGE_TITLE}>Gestión de Usuarios</h1>
                    <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>{`Administra los permisos y accesos al ecosistema de ${APP_LABEL}`}</p>
                </div>
                {hasPermission(`${PERMISSION_PREFIX}.config.users` as any) && (
                    <button
                        onClick={handleCreate}
                        className={SIATC_THEME.COMPONENTS.BUTTON_PRIMARY}
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Usuario
                    </button>
                )}
            </div>

            {/* Content Container */}
            <div className={SIATC_THEME.LAYOUT.CONTENT_CONTAINER}>
                {/* Search / Filters Toolbar */}
                <div className={SIATC_THEME.LAYOUT.SEARCH_BAR_WRAPPER}>
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/60" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            placeholder="Buscar por nombre, usuario o email..."
                            className={SIATC_THEME.COMPONENTS.INPUT}
                        />
                    </div>
                </div>

                {/* Table Area */}
                <SIATCTable containerClassName="relative">
                    {isLoading ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/60 dark:bg-slate-955/60 backdrop-blur-sm z-50">
                            <div className="w-10 h-10 border-4 border-cb-blue border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-sm font-bold text-cb-text-secondary mt-4 tracking-widest animate-pulse">Sincronizando identidades...</span>
                        </div>
                    ) : (
                        <>
                            <thead className={SIATC_THEME.TABLE.HEADER_ROW}>
                                <tr>
                                    <ResizableHeader columnId="usuario" width={widths.usuario} onResizeStart={onResizeStart}>
                                        <div className="flex items-center justify-between gap-2 group/header cursor-pointer" onClick={() => handleSort('username')}>
                                            <span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Responsable / ID</span>
                                            <SortIcon column="username" />
                                        </div>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="email" width={widths.email} onResizeStart={onResizeStart}>
                                        <div className="flex items-center justify-between gap-2 group/header cursor-pointer" onClick={() => handleSort('email')}>
                                            <span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Correo Corporativo</span>
                                            <SortIcon column="email" />
                                        </div>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="rol" width={widths.rol} onResizeStart={onResizeStart}>
                                        <div className="flex items-center justify-between gap-2 group/header cursor-pointer" onClick={() => handleSort('rol')}>
                                            <span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Perfil de Seguridad</span>
                                            <SortIcon column="rol" />
                                        </div>
                                    </ResizableHeader>
                                    <ResizableHeader columnId="apps" width={widths.apps} onResizeStart={onResizeStart} className="text-center">
                                        <span className={SIATC_THEME.TYPOGRAPHY.TABLE_HEADER}>Alcance Ecosistema</span>
                                    </ResizableHeader>
                                    <th className="w-28 text-right px-6 py-2.5 font-sans font-semibold text-[11px] uppercase tracking-[0.06em] text-cb-neutral">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-cb-border/40">
                                {paginatedUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-20 text-center opacity-60">
                                            <div className="flex flex-col items-center gap-3">
                                                <Activity className="w-12 h-12 text-cb-neutral/20" />
                                                <p className="text-sm font-medium text-cb-neutral italic">No se encontraron identidades para el filtro seleccionado</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedUsers.map((user) => (
                                        <SIATCTableRow key={user.id}>
                                            <SIATCTableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center text-primary dark:text-primary-foreground font-bold text-xs border border-primary/20 shadow-inner shrink-0 group-hover:scale-[1.05] transition-transform">
                                                        {getInitials(user.full_name, user.username)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-cb-text-primary text-sm truncate tracking-tight">
                                                            {toTitleCase(user.full_name || user.username)}
                                                        </div>
                                                        <div className="text-[10px] text-cb-text-secondary font-mono truncate flex items-center gap-1.5 opacity-60 mt-0.5">
                                                            <Activity className="w-2.5 h-2.5 text-cb-neutral" /> ID: {user.username}
                                                        </div>
                                                    </div>
                                                </div>
                                            </SIATCTableCell>
                                            <SIATCTableCell>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="text-cb-text-secondary font-medium truncate">{user.email}</span>
                                                    {!user.is_active && (
                                                        <span className="text-[9px] font-bold text-[#DF2935] tracking-tight mt-0.5">Cuenta suspendida</span>
                                                    )}
                                                </div>
                                            </SIATCTableCell>
                                            <SIATCTableCell>
                                                <span className={cn(SIATC_THEME.STATES.BADGE_BASE, SIATC_THEME.STATES.PRIMARY, "gap-1")}>
                                                     <ShieldCheck className="w-3.5 h-3.5 text-primary/60" />
                                                    {user.role_name || 'Invitado'}
                                                </span>
                                            </SIATCTableCell>
                                            <SIATCTableCell>
                                                <div className="flex flex-wrap gap-1.5 justify-center">
                                                    {(user.apps || APP_CODE_DEFAULT).split(',').map((app: string) => (
                                                        <span key={app} className={cn("px-2 py-0.5 rounded-cb-chip text-[9px] font-bold tracking-tight border bg-cb-blue/5 text-cb-blue border-cb-blue/10", SIATC_THEME.TOKENS.TYPOGRAPHY.MONO_SMALL)}>
                                                            {app.trim()}
                                                        </span>
                                                    ))}
                                                </div>
                                            </SIATCTableCell>
                                            <SIATCTableCell>
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {hasPermission(`${PERMISSION_PREFIX}.config.users` as any) && (
                                                        <>
                                                            <button
                                                                onClick={() => handleEdit(user)}
                                                                className="p-1.5 text-cb-text-secondary hover:text-primary hover:bg-primary/10 rounded-cb-btn transition-all active:scale-90 cursor-pointer"
                                                                title="Editar"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(user.id)}
                                                                className="p-1.5 text-cb-text-secondary hover:text-[#DF2935] hover:bg-[#DF2935]/10 rounded-cb-btn transition-all active:scale-90 cursor-pointer"
                                                                title="Revocar"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </SIATCTableCell>
                                        </SIATCTableRow>
                                    ))
                                )}
                            </tbody>
                        </>
                    )}
                </SIATCTable>
                
                {/* Footer Stats */}
                <SIATCTableFooter 
                    totalRecords={filteredUsers.length} 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                />
            </div>

            {/* Modal de Usuario: SIATC Standard */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? 'Gestión de Identidad' : 'Nueva Identidad de Acceso'} size="lg">
                <form onSubmit={handleSubmit} className="p-6 pt-2 space-y-6">
                    {error && (
                        <div className="p-4 bg-rose-500/10 text-rose-700 rounded-xl border border-rose-500/20 text-xs font-bold tracking-tight flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
                            <XCircle className="w-5 h-5 shrink-0" />
                            {error}
                        </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider pl-1">Nombre completo del colaborador:</label>
                            <input
                                type="text"
                                required
                                value={formData.full_name || ''}
                                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                className={SIATC_THEME.COMPONENTS.INPUT}
                                placeholder="Ej: Juan Pérez"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider pl-1">ID de acceso / Usuario:</label>
                            <div className="relative">
                                <Activity className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/40" />
                                <input
                                    type="text"
                                    required
                                    value={formData.username || ''}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-10 font-mono")}
                                    placeholder="ej: jperez"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider pl-1">Correo corporativo:</label>
                            <input
                                type="email"
                                required
                                value={formData.email || ''}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className={SIATC_THEME.COMPONENTS.INPUT}
                                placeholder="ejemplo@siatc.com"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider pl-1">
                                {editingUser ? 'Actualizar credencial:' : 'Credencial de acceso:'}
                            </label>
                            <input
                                type="password"
                                required={!editingUser}
                                value={formData.password_hash || ''}
                                onChange={(e) => setFormData({ ...formData, password_hash: e.target.value })}
                                className={cn(SIATC_THEME.COMPONENTS.INPUT, "font-mono")}
                                placeholder={editingUser ? "Solo si desea cambiar" : "••••••••"}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider pl-1">Perfil de seguridad:</label>
                            <div className="relative">
                                <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/40" />
                                <select
                                    required
                                    value={formData.role_id || ''}
                                    onChange={(e) => setFormData({ ...formData, role_id: e.target.value })}
                                    className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-10 appearance-none cursor-pointer")}
                                >
                                    <option value="" disabled>Seleccionar perfil...</option>
                                    {roles.map(role => (
                                        <option key={role.id} value={role.id}>{role.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-1.5 md:col-span-2">
                            <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider pl-1">Gerencia / Sede asignada:</label>
                            <div className="relative">
                                <Activity className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/40 pointer-events-none" />
                                <select
                                    required
                                    value={formData.management_id || ''}
                                    onChange={(e) => setFormData({ ...formData, management_id: e.target.value })}
                                    className={cn(SIATC_THEME.COMPONENTS.INPUT, "pl-10 pr-10 appearance-none cursor-pointer")}
                                >
                                    <option value="" disabled>Seleccionar sede...</option>
                                    {managements.map(mgmt => (
                                        <option key={mgmt.id} value={mgmt.id}>{mgmt.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cb-neutral/40 pointer-events-none" />
                            </div>
                        </div>

                        <div className="col-span-full pt-4 border-t border-cb-border">
                            <label className="text-[11px] font-bold text-cb-neutral uppercase tracking-wider pl-1 mb-3 block">Ámbito del ecosistema SIATC:</label>
                            <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
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
                                                "flex items-center gap-2.5 px-3 py-2.5 rounded-cb-btn text-[10px] font-bold tracking-tight transition-all border shadow-sm cursor-pointer",
                                                isSelected
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "bg-white dark:bg-cb-bg border-cb-border text-cb-neutral hover:bg-cb-bg"
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 rounded-lg border flex items-center justify-center transition-all shrink-0",
                                                isSelected ? "bg-white text-primary border-white" : "bg-card border-border shadow-inner"
                                            )}>
                                                {isSelected && <Check className="w-2.5 h-2.5 stroke-[4]" />}
                                            </div>
                                            <span className="truncate">{app.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="col-span-full pt-2">
                             <button
                                type="button"
                                onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                                className={cn(
                                    "w-full flex items-center justify-between px-5 py-3.5 rounded-cb-card text-xs font-bold transition-all border shadow-sm cursor-pointer",
                                    formData.is_active
                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-500"
                                        : "bg-[#DF2935]/10 border-[#DF2935]/20 text-[#DF2935]"
                                )}
                            >
                                <span className="tracking-widest uppercase text-[10px] text-cb-neutral font-bold pl-1">Estado operativo:</span>
                                <div className="flex items-center gap-3">
                                    {formData.is_active ? 'Habilitado' : 'Suspendido'}
                                    <div className={cn(
                                        "w-9 h-4.5 rounded-full relative transition-colors",
                                        formData.is_active ? "bg-emerald-500" : "bg-[#DF2935]"
                                    )}>
                                        <div className={cn(
                                            "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all",
                                            formData.is_active ? "left-5" : "left-0.5"
                                        )} />
                                    </div>
                                </div>
                            </button>
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
                            {editingUser ? 'Guardar cambios' : 'Crear identidad'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
