import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    User, Mail, Lock, Camera, Save, CheckCircle, AlertCircle,
    Shield, Building2, BadgeCheck, Loader2
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { ApiClient } from '../services/apiClient';
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
    const { t } = useTranslation();
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
            setMessage(t('profile.errors.imageProcessing'));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        // Validate passwords match
        if (formData.password && formData.password !== formData.confirmPassword) {
            setStatus('error');
            setMessage(t('profile.errors.passwordMismatch'));
            return;
        }

        if (formData.password && formData.password.length < 4) {
            setStatus('error');
            setMessage(t('profile.errors.passwordTooShort'));
            return;
        }

        setIsSaving(true);
        try {
            const savedUser = await ApiClient.request('/profile', {
                method: 'PUT',
                body: JSON.stringify({
                    avatar_url: formData.avatar_url,
                    password_hash: formData.password || undefined
                })
            });

            // Merge only visual/profile fields — preserve session state
            const mergedUser = {
                ...user,
                avatar_url: savedUser.avatar_url,
                full_name: savedUser.full_name,
                requires_password_change: savedUser.requires_password_change
            };
            login(mergedUser);

            setStatus('success');
            setMessage(t('profile.success.updated'));
            setFormData(prev => ({ ...prev, password: '', confirmPassword: '' }));
            setTimeout(() => setStatus('idle'), 4000);
        } catch (error) {
            console.error('Profile update error:', error);
            setStatus('error');
            setMessage(t('profile.errors.updateFailed'));
        } finally {
            setIsSaving(false);
        }
    };

    if (!user) return null;

    const initials = (user.full_name || user.username || '??')
        .split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    const layout = SIATC_THEME.PROFILE_LAYOUT;

    return (
        <div className={layout.PAGE_WRAPPER}>
            <div className={layout.INNER_CONTAINER}>
                {/* Header */}
                <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                    <div>
                        <h1 className={SIATC_THEME.TYPOGRAPHY.PAGE_TITLE}>{t('profile.title')}</h1>
                        <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>{t('profile.subtitle')}</p>
                    </div>
                </div>

                <div className={layout.GRID}>

                    {/* Left Column: Profile Card */}
                    <div className={layout.LEFT_COLUMN}>
                        <div className={cn(SIATC_THEME.COMPONENTS.CARD_CONTAINER, "overflow-hidden hover:-translate-y-0.5 transition-all duration-300")}>
                            {/* Gradient banner */}
                            <div className={layout.BANNER}>
                                <div className={layout.BANNER_OVERLAY} />
                            </div>

                            {/* Avatar */}
                            <div className={layout.AVATAR_CONTAINER}>
                                <div className="relative group">
                                    <div className={layout.AVATAR_RING}>
                                        {formData.avatar_url ? (
                                            <img src={formData.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-3xl font-bold text-cb-neutral select-none">{initials}</span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className={cn(layout.CAMERA_BUTTON, SIATC_THEME.MOBILE.TOUCH_TARGET)}
                                        title={t('profile.changeAvatar')}
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
                                <div className={layout.ROLE_BADGE}>
                                    <Shield className="w-3.5 h-3.5" />
                                    {user.role_name || t('profile.noRole')}
                                </div>
                            </div>
                        </div>

                        {/* Quick Info Card */}
                        <div className={cn(SIATC_THEME.COMPONENTS.CARD_CONTAINER, layout.QUICK_INFO_CARD)}>
                            <h3 className="text-xs font-bold text-cb-neutral uppercase tracking-wider">{t('profile.infoTitle')}</h3>

                            <div className={layout.INFO_LIST}>
                                <div className={layout.INFO_ITEM}>
                                    <div className={cn(layout.INFO_ITEM_ICON_BASE, layout.INFO_ITEM_ICON_PRIMARY)}>
                                        <Mail className="w-5 h-5" />
                                    </div>
                                    <div className={layout.INFO_ITEM_DETAILS}>
                                        <p className={layout.INFO_ITEM_LABEL}>{t('profile.emailLabel')}</p>
                                        <p className={layout.INFO_ITEM_VALUE}>{user.email}</p>
                                    </div>
                                </div>

                                <div className={layout.INFO_ITEM}>
                                    <div className={cn(layout.INFO_ITEM_ICON_BASE, layout.INFO_ITEM_ICON_PURPLE)}>
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div className={layout.INFO_ITEM_DETAILS}>
                                        <p className={layout.INFO_ITEM_LABEL}>{t('profile.managementLabel')}</p>
                                        <p className={layout.INFO_ITEM_VALUE}>{user.management_name || user.management_id || t('profile.noManagement')}</p>
                                    </div>
                                </div>

                                <div className={layout.INFO_ITEM}>
                                    <div className={cn(layout.INFO_ITEM_ICON_BASE, layout.INFO_ITEM_ICON_EMERALD)}>
                                        <BadgeCheck className="w-5 h-5" />
                                    </div>
                                    <div className={layout.INFO_ITEM_DETAILS}>
                                        <p className={layout.INFO_ITEM_LABEL}>{t('profile.statusLabel')}</p>
                                        <p className={layout.INFO_ITEM_VALUE_SUCCESS}>{t('profile.activeStatus')}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Edit Form */}
                    <div className={layout.RIGHT_COLUMN}>

                        {/* Account Settings Card */}
                        <div className={SIATC_THEME.COMPONENTS.CARD_CONTAINER}>
                            <div className={layout.FORM_SECTION_HEADER}>
                                <h3 className={layout.FORM_SECTION_TITLE}>
                                    <User className="w-4 h-4 text-primary" />
                                    {t('profile.accountTitle')}
                                </h3>
                                <p className={layout.FORM_SECTION_SUBTITLE}>{t('profile.accountSubtitle')}</p>
                            </div>

                            <div className="p-6 space-y-5">
                                <div className={layout.FORM_GRID}>
                                    <div>
                                        <label className={layout.FIELD_LABEL}>
                                            {t('profile.userLabel')}
                                        </label>
                                        <div className={layout.FIELD_WRAPPER}>
                                            <div className={layout.FIELD_ICON}>
                                                <User className="w-4 h-4" />
                                            </div>
                                            <input
                                                type="text"
                                                value={formData.username}
                                                disabled
                                                className={cn(layout.INPUT_DISABLED, SIATC_THEME.MOBILE.TOUCH_INPUT)}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className={layout.FIELD_LABEL}>
                                            {t('profile.emailLabel')}
                                        </label>
                                        <div className={layout.FIELD_WRAPPER}>
                                            <div className={layout.FIELD_ICON}>
                                                <Mail className="w-4 h-4" />
                                            </div>
                                            <input
                                                type="email"
                                                value={formData.email}
                                                disabled
                                                className={cn(layout.INPUT_DISABLED, SIATC_THEME.MOBILE.TOUCH_INPUT)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className={layout.READONLY_ALERT}>
                                    <p className={layout.READONLY_ALERT_TEXT}>
                                        <AlertCircle className="w-3.5 h-3.5 inline" />
                                        {t('profile.readOnlyNote')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Security Card */}
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className={SIATC_THEME.COMPONENTS.CARD_CONTAINER}>
                                <div className={layout.FORM_SECTION_HEADER}>
                                    <h3 className={layout.FORM_SECTION_TITLE}>
                                        <Lock className="w-4 h-4 text-primary" />
                                        {t('profile.securityTitle')}
                                    </h3>
                                    <p className={layout.FORM_SECTION_SUBTITLE}>{t('profile.securitySubtitle')}</p>
                                </div>

                                <div className="p-6 space-y-5">
                                    <div className={layout.FORM_GRID}>
                                        <div>
                                            <label className={layout.FIELD_LABEL}>
                                                {t('profile.newPasswordLabel')}
                                            </label>
                                            <div className={layout.FIELD_WRAPPER}>
                                                <div className={layout.FIELD_ICON}>
                                                    <Lock className="w-4 h-4" />
                                                </div>
                                                <input
                                                    type="password"
                                                    name="password"
                                                    value={formData.password}
                                                    onChange={handleChange}
                                                    placeholder="••••••••"
                                                    className={cn(layout.INPUT_ACTIVE, SIATC_THEME.MOBILE.TOUCH_INPUT)}
                                                    minLength={4}
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className={layout.FIELD_LABEL}>
                                                {t('profile.confirmPasswordLabel')}
                                            </label>
                                            <div className={layout.FIELD_WRAPPER}>
                                                <div className={layout.FIELD_ICON}>
                                                    <Shield className="w-4 h-4" />
                                                </div>
                                                <input
                                                    type="password"
                                                    name="confirmPassword"
                                                    value={formData.confirmPassword}
                                                    onChange={handleChange}
                                                    placeholder="••••••••"
                                                    className={cn(
                                                        layout.INPUT_ACTIVE,
                                                        SIATC_THEME.MOBILE.TOUCH_INPUT,
                                                        formData.confirmPassword && formData.password !== formData.confirmPassword && layout.INPUT_ERROR
                                                    )}
                                                    minLength={4}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <p className={layout.FORM_NOTE}>
                                        {t('profile.passwordHint')}
                                    </p>
                                </div>
                            </div>

                            {/* Status Message */}
                            {status !== 'idle' && (
                                <div className={cn(
                                    layout.STATUS_ALERT_BASE,
                                    status === 'success' ? layout.STATUS_ALERT_SUCCESS : layout.STATUS_ALERT_ERROR
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
                                        SIATC_THEME.MOBILE.TOUCH_TARGET,
                                        "px-8",
                                        isSaving && "opacity-60 cursor-not-allowed"
                                    )}
                                >
                                    {isSaving ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4" />
                                    )}
                                    {isSaving ? t('profile.saving') : t('profile.saveChanges')}
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
