import { useTranslation } from 'react-i18next';
import { SIATC_THEME } from '../utils/siatc-theme';
import { cn } from '../utils/cn';

export default function PenaltiesPage() {
    const { t } = useTranslation();
    return (
        <div className={SIATC_THEME.LAYOUT.PAGE_WRAPPER}>
            <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                <div>
                    <h1 className={SIATC_THEME.TYPOGRAPHY.PAGE_TITLE}>{t('penalties.title')}</h1>
                    <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>{t('penalties.subtitle')}</p>
                </div>
            </div>
            <div className={cn("p-6", SIATC_THEME.COMPONENTS.CARD_CONTAINER)}>
                <p className="text-cb-text-secondary">{t('penalties.redirectMessage')}</p>
            </div>
        </div>
    );
}
