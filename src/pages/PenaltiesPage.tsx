import React from 'react';
import { SIATC_THEME } from '../utils/siatc-theme';
import { cn } from '../utils/cn';

export default function PenaltiesPage() {
    return (
        <div className={SIATC_THEME.LAYOUT.PAGE_WRAPPER}>
            <div className={SIATC_THEME.LAYOUT.HEADER_WRAPPER}>
                <div>
                    <h1 className={SIATC_THEME.TYPOGRAPHY.PAGE_TITLE}>Gestión de Penalidades</h1>
                    <p className={SIATC_THEME.TYPOGRAPHY.PAGE_SUBTITLE}>Listado de infracciones y descargos del CAS.</p>
                </div>
            </div>
            <div className={cn("p-6", SIATC_THEME.COMPONENTS.CARD_CONTAINER)}>
                <p className="text-cb-text-secondary">Este módulo se gestiona directamente en las valorizaciones quincenales.</p>
            </div>
        </div>
    );
}
