import React from 'react';
import { cn } from '../../../utils/cn';
import { SIATC_THEME } from '../../../utils/siatc-theme';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// SIATC PREMIUM MASTER - SIATCTable v2.0 (Platinum)
// Componente bloqueado: NO modificar estilos directamente.

/**
 * Celda estándar SIATC Platinum
 */
export const SIATCTableCell: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ className, children, ...props }) => (
    <td className={cn(SIATC_THEME.TABLE.CELL, className)} {...props}>
        {children}
    </td>
);

/**
 * Fila estándar SIATC Platinum
 */
interface SIATCTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
    isActive?: boolean;
}

export const SIATCTableRow: React.FC<SIATCTableRowProps> = ({ className, children, isActive, ...props }) => (
    <tr className={cn(
        SIATC_THEME.TABLE.BODY_ROW,
        isActive && 'bg-primary/10',
        className
    )} {...props}>
        {children}
    </tr>
);

/**
 * Encabezado estándar SIATC Platinum
 */
export const SIATCTableHeader: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({ className, children, ...props }) => (
    <th className={cn(SIATC_THEME.TABLE.HEADER_TH, className)} {...props}>
        {children}
    </th>
);

/**
 * Footer estándar SIATC Platinum (con Paginación)
 * Retrocompatible con la API antigua (page, limit, total, onLimitChange)
 */
interface FooterProps {
    // API nueva (semántica)
    totalRecords?: number;
    currentPage?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
    showPaging?: boolean;
    label?: string;
    // API antigua (retrocompatibilidad)
    total?: number;
    page?: number;
    limit?: number;
    onLimitChange?: (limit: number) => void;
}

export const SIATCTableFooter: React.FC<FooterProps> = ({
    totalRecords,
    currentPage,
    totalPages,
    onPageChange,
    showPaging = true,
    label = 'Total de registros',
    total,
    page,
    onLimitChange: _onLimitChange,
}) => {
    const resolvedTotal = totalRecords ?? total ?? 0;
    const resolvedCurrentPage = currentPage ?? page ?? 1;
    const resolvedTotalPages = totalPages ?? 1;

    return (
        <div className={SIATC_THEME.TABLE.FOOTER}>
            <p className={SIATC_THEME.TYPOGRAPHY.FOOTER_STATS}>
                {label}:&nbsp;<span className="text-foreground font-black opacity-100">{resolvedTotal}</span>
            </p>

            {showPaging && resolvedTotalPages > 1 && (
                <div className="flex items-center gap-2">
                    <button
                        disabled={resolvedCurrentPage === 1}
                        onClick={() => onPageChange?.(resolvedCurrentPage - 1)}
                        className="p-1.5 rounded-xl border border-border bg-background text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1.5 px-4 py-1.5 bg-background rounded-xl border border-border shadow-inner">
                        <span className={SIATC_THEME.TYPOGRAPHY.FOOTER_STATS}>
                            Pág. <span className="text-primary opacity-100">{resolvedCurrentPage}</span> / {resolvedTotalPages}
                        </span>
                    </div>
                    <button
                        disabled={resolvedCurrentPage === resolvedTotalPages}
                        onClick={() => onPageChange?.(resolvedCurrentPage + 1)}
                        className="p-1.5 rounded-xl border border-border bg-background text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

/**
 * Tabla Maestra SIATC Platinum
 */
interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
    containerClassName?: string;
}

export const SIATCTable: React.FC<TableProps> = ({ children, className, containerClassName, ...props }) => (
    <div className={cn(SIATC_THEME.TABLE.SCROLL_AREA, containerClassName)}>
        <table className={cn(SIATC_THEME.TABLE.TABLE_ELEMENT, className)} {...props}>
            {children}
        </table>
    </div>
);
