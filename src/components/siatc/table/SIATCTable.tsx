import React from 'react';
import { cn } from '../../../utils/cn';
import { SIATC_THEME } from '../../../utils/siatc-theme';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// SIATC PREMIUM MASTER - SIATCTable v2.0 (Platinum)
// Sincronizado para PARIDAD ABSOLUTA y COMPATIBILIDAD RETROACTIVA.

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
 * Soporta 'isActive' para resaltado visual compatible con lógica de selección.
 */
interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
    isActive?: boolean;
}

export const SIATCTableRow: React.FC<RowProps> = ({ className, children, isActive, ...props }) => (
    <tr 
        className={cn(
            SIATC_THEME.TABLE.BODY_ROW, 
            isActive && "bg-primary/10 border-l-4 border-l-primary shadow-sm", // Resaltado visual Opción 1
            className
        )} 
        {...props}
    >
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
 * Soporta props maestras y alias legados (page, total, limit) para evitar errores de build.
 */
interface FooterProps {
    totalRecords?: number;
    currentPage?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
    showPaging?: boolean;
    label?: string;
    
    // Alias para compatibilidad
    page?: number;     // Alias de currentPage
    total?: number;    // Alias de totalRecords
    limit?: number;    // Aceptado pero no usado visualmente en este componente simple
    onLimitChange?: (limit: number) => void;
}

export const SIATCTableFooter: React.FC<FooterProps> = ({
    totalRecords,
    currentPage,
    totalPages = 1,
    onPageChange,
    showPaging = true,
    label = 'Total de registros',
    
    page,
    total,
}) => {
    // Resolver valores (Prioridad a alias si el valor maestro es undefined)
    const activeRecords = totalRecords ?? total ?? 0;
    const activePage = currentPage ?? page ?? 1;

    return (
        <div className={SIATC_THEME.TABLE.FOOTER}>
            <p className={SIATC_THEME.TYPOGRAPHY.FOOTER_STATS}>
                {label}:&nbsp;<span className="text-foreground font-black opacity-100">{activeRecords}</span>
            </p>

            {/* Paginación Platinum */}
            {showPaging && totalPages > 1 && (
                <div className="flex items-center gap-2">
                    <button
                        disabled={activePage === 1}
                        onClick={() => onPageChange?.(activePage - 1)}
                        className="p-1.5 rounded-xl border border-border bg-background text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 active:scale-95"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1.5 px-4 py-1.5 bg-background rounded-xl border border-border shadow-inner">
                        <span className={SIATC_THEME.TYPOGRAPHY.FOOTER_STATS}>
                            Pág. <span className="text-primary opacity-100">{activePage}</span> / {totalPages}
                        </span>
                    </div>
                    <button
                        disabled={activePage === totalPages}
                        onClick={() => onPageChange?.(activePage + 1)}
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
