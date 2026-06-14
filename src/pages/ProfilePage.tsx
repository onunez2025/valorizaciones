import { useState, useEffect, useRef } from 'react';
import {
    User, Mail, Lock, Camera, Save, CheckCircle, AlertCircle,
    Shield, Building2, BadgeCheck, Loader2
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { UsersService } from '../services/usersService';
import { cn } from '../utils/cn';
import { SIATC_THEME } from '../utils/siatc-theme';

/**
 * Compresses and resizes an image file to a base64 DataURL.
 * Max dimension: 256px, JPEG quality: 0.8 → typically 10–30KB.
 */
function compressImage(file: File, maxSize = 256, quality = 0.8): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;

                // Scale down to maxSize while maintaining aspect ratio
                if (w > h) {
                    if (w > maxSize) { h = Math.round((h * maxSize) / w); w = maxSize; }
                } else {
                    if (h > maxSize) { w = Math.round((w * maxSize) / h); h = maxSize; }
                }

                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
            img.src = reader.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export function ProfilePage() {
    const { user, login } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        avatar_url: ''
    });

    const [isSaving, setIsSaving] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (user) {
            setFormData({
                username: user.username,
                email: user.email,
                password: '',
                confirmPassword: '',
                avatar_url: user.avatar_url || ''
            });
        }
    }, [user]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        setStatus('idle');
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const compressed = await compressImage(file);
            setFormData(prev => ({ ...prev, avatar_url: compressed }));
            setStatus('idle');
        } catch {
            setStatus('error');
            setMessage('Error al procesar la imagen');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        // Validate passwords match
        if (formData.password && formData.password !== formData.confirmPassword) {
            setStatus('error');
            setMessage('Las contraseñas no coinciden');
            return;
        }

        if (formData.password && formData.password.length < 4) {
            setStatus('error');
            setMessage('La contraseña debe tener al menos 4 caracteres');
            return;
        }

        setIsSaving(true);
        try {
            const updatedUser = {
                ...user,
                avatar_url: formData.avatar_url,
                password_hash: formData.password || undefined
            };

            const savedUser = await UsersService.saveUser(updatedUser);

            // Merge only visual/profile fields — preserve session state
            const mergedUser = {
                ...user,
                avatar_url: savedUser.avatar_url,
                full_name: savedUser.full_name,
                requires_password_change: formData.password ? false : user.requires_password_change
            };
            login(mergedUser);

            setStatus('success');
            setMessage('Perfil actualizado correctamente');
            setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
            setTimeout(() => setStatus('idle'), 4000);
        } catch (error) {
            console.error('Profile update error:', error);
            setStatus('error');
            setMessage('Error al actualizar el perfil');
        } finally {
            setIsSaving(false);
        }
    };

    if (!user) return null;

    const initials = (user.full_name || user.username || '??')
        .split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const t = SIATC_THEME.PROFILE_LAYOUT;

    return (
        <div className={t.PAGE_WRAPPER}>
            <div className={t.INNER_CONTAINER}>
                {/* Header */}
                <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                    <div>
                        <h1 className={SIATC_THEME.TYPOGRAPHY.PAGE_TITLE}>Mi Perfil</h1>
                        <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>Gestiona tu información personal y credenciales.</p>
                    </div>
                </div>

                <div className={t.GRID}>

                    {/* Left Column: Profile Card */}
                    <div className={t.LEFT_COLUMN}>
                        <div className={cn(SIATC_THEME.COMPONENTS.CARD_CONTAINER, "overflow-hidden hover:-translate-y-0.5 transition-all duration-300")}>
                            {/* Gradient banner */}
                            <div className={t.BANNER}>
                                <div className={t.BANNER_OVERLAY} />
                            </div>

                            {/* Avatar */}
                            <div className={t.AVATAR_CONTAINER}>
                                <div className="relative group">
                                    <div className={t.AVATAR_RING}>
                                        {formData.avatar_url ? (
                                            <img src={formData.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-3xl font-bold text-cb-neutral select-none">{initials}</span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className={t.CAMERA_BUTTON}
                                        title="Cambiar foto de perfil"
                                    >
                                        <Camera className="w-4 h-4" />
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        accept="image/*"
                                        onChange={handleAvatarChange}
                                    />
                                </div>

                                <h2 className="mt-4 text-xl font-bold tracking-tight text-cb-text-primary">{user.full_name || user.username}</h2>
                                <p className="text-sm text-primary font-medium">@{user.username}</p>

                                {/* Role badge */}
                                <div className={t.ROLE_BADGE}>
                                    <Shield className="w-3.5 h-3.5" />
                                    {user.role_name || 'Sin rol'}
                                </div>
                            </div>
                        </div>

                        {/* Quick Info Card */}
                        <div className={cn(SIATC_THEME.COMPONENTS.CARD_CONTAINER, t.QUICK_INFO_CARD)}>
                            <h3 className="text-xs font-bold text-cb-neutral uppercase tracking-wider">Información</h3>

                            <div className={t.INFO_LIST}>
                                <div className={t.INFO_ITEM}>
                                    <div className={cn(t.INFO_ITEM_ICON_BASE, t.INFO_ITEM_ICON_PRIMARY)}>
                                        <Mail className="w-5 h-5" />
                                    </div>
                                    <div className={t.INFO_ITEM_DETAILS}>
                                        <p className={t.INFO_ITEM_LABEL}>Email</p>
                                        <p className={t.INFO_ITEM_VALUE}>{user.email}</p>
                                    </div>
                                </div>

                                <div className={t.INFO_ITEM}>
                                    <div className={cn(t.INFO_ITEM_ICON_BASE, t.INFO_ITEM_ICON_PURPLE)}>
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div className={t.INFO_ITEM_DETAILS}>
                                        <p className={t.INFO_ITEM_LABEL}>Gerencia</p>
                                        <p className={t.INFO_ITEM_VALUE}>{(user as Record<string, unknown>).management_name as string || user.management_id || 'Sin gerencia'}</p>
                                    </div>
                                </div>

                                <div className={t.INFO_ITEM}>
                                    <div className={cn(t.INFO_ITEM_ICON_BASE, t.INFO_ITEM_ICON_EMERALD)}>
                                        <BadgeCheck className="w-5 h-5" />
                                    </div>
                                    <div className={t.INFO_ITEM_DETAILS}>
                                        <p className={t.INFO_ITEM_LABEL}>Estado</p>
                                        <p className={t.INFO_ITEM_VALUE_SUCCESS}>Activo</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Edit Form */}
                    <div className={t.RIGHT_COLUMN}>

                        {/* Account Settings Card */}
                        <div className={SIATC_THEME.COMPONENTS.CARD_CONTAINER}>
                            <div className={t.FORM_SECTION_HEADER}>
                                <h3 className={t.FORM_SECTION_TITLE}>
                                    <User className="w-4 h-4 text-primary" />
                                    Cuenta
                                </h3>
                                <p className={t.FORM_SECTION_SUBTITLE}>Tu nombre de usuario y correo electrónico.</p>
                            </div>

                            <div className="p-6 space-y-5">
                                <div className={t.FORM_GRID}>
                                    <div>
                                        <label className={t.FIELD_LABEL}>
                                            Usuario
                                        </label>
                                        <div className={t.FIELD_WRAPPER}>
                                            <div className={t.FIELD_ICON}>
                                                <User className="w-4 h-4" />
                                            </div>
                                            <input
                                                type="text"
                                                value={formData.username}
                                                disabled
                                                className={t.INPUT_DISABLED}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={t.FIELD_LABEL}>
                                            Email
                                        </label>
                                        <div className={t.FIELD_WRAPPER}>
                                            <div className={t.FIELD_ICON}>
                                                <Mail className="w-4 h-4" />
                                            </div>
                                            <input
                                                type="email"
                                                value={formData.email}
                                                disabled
                                                className={t.INPUT_DISABLED}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className={t.READONLY_ALERT}>
                                    <p className={t.READONLY_ALERT_TEXT}>
                                        <AlertCircle className="w-3.5 h-3.5 inline" />
                                        Estos campos son de solo lectura. Si necesitas un cambio, contacta al administrador del sistema.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Security Card */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className={SIATC_THEME.COMPONENTS.CARD_CONTAINER}>
                                <div className={t.FORM_SECTION_HEADER}>
                                    <h3 className={t.FORM_SECTION_TITLE}>
                                        <Lock className="w-4 h-4 text-primary" />
                                        Seguridad
                                    </h3>
                                    <p className={t.FORM_SECTION_SUBTITLE}>Cambia tu contraseña de acceso.</p>
                                </div>

                                <div className="p-6 space-y-5">
                                    <div className={t.FORM_GRID}>
                                        <div>
                                            <label className={t.FIELD_LABEL}>
                                                Nueva Contraseña
                                            </label>
                                            <div className={t.FIELD_WRAPPER}>
                                                <div className={t.FIELD_ICON}>
                                                    <Lock className="w-4 h-4" />
                                                </div>
                                                <input
                                                    type="password"
                                                    name="password"
                                                    value={formData.password}
                                                    onChange={handleChange}
                                                    placeholder="••••••••"
                                                    className={t.INPUT_ACTIVE}
                                                    minLength={4}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className={t.FIELD_LABEL}>
                                                Confirmar Contraseña
                                            </label>
                                            <div className={t.FIELD_WRAPPER}>
                                                <div className={t.FIELD_ICON}>
                                                    <Shield className="w-4 h-4" />
                                                </div>
                                                <input
                                                    type="password"
                                                    name="confirmPassword"
                                                    value={formData.confirmPassword}
                                                    onChange={handleChange}
                                                    placeholder="••••••••"
                                                    className={cn(
                                                        t.INPUT_ACTIVE,
                                                        formData.confirmPassword && formData.password !== formData.confirmPassword && t.INPUT_ERROR
                                                    )}
                                                    minLength={4}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <p className={t.FORM_NOTE}>
                                        Deja los campos vacíos para mantener tu contraseña actual. Mínimo 4 caracteres.
                                    </p>
                                </div>
                            </div>

                            {/* Status Message */}
                            {status !== 'idle' && (
                                <div className={cn(
                                    t.STATUS_ALERT_BASE,
                                    status === 'success' ? t.STATUS_ALERT_SUCCESS : t.STATUS_ALERT_ERROR
                                )}>
                                    {status === 'success' ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
                                    {message}
                                </div>
                            )}

                            {/* Save Button */}
                            <div className="flex justify-end">
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className={cn(
                                        SIATC_THEME.COMPONENTS.BUTTON_PRIMARY,
                                        "px-8",
                                        isSaving && "opacity-60 cursor-not-allowed"
                                    )}
                                >
                                    {isSaving ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4" />
                                    )}
                                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default ProfilePage;
