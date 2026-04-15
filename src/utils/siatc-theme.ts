/**
 * SIATC PREMIUM MASTER DESIGN SYSTEM (v2.0 - Platinum)
 * Source of Truth (Molde Maestro) para todo el ecosistema SIATC.
 */

export const SIATC_THEME = {
    // ---- TOKENS DE DECISIÓN (CAPA A) ----
    TOKENS: {
        MASTER_ROUNDNESS: "rounded-[2rem]",
        COMPONENT_ROUNDNESS: "rounded-xl",
        BUTTON_ROUNDNESS: "rounded-xl",
        SIDEBAR_BG: "bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl",
        MODAL_OVERLAY: "bg-slate-900/60 backdrop-blur-md",
        TABLE_ROW_HOVER: "hover:bg-primary/5",
        PRIMARY_ACCENT: "bg-primary text-primary-foreground",
        MASTER_SHADOW: "shadow-xl shadow-slate-200/20 dark:shadow-none",
        GLASS_PANEL: "bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl",
    },

    // 1. FUNDAMENTOS DE LAYOUT
    LAYOUT: {
        PAGE_WRAPPER: "flex flex-col h-full space-y-4 min-h-0 animate-in fade-in duration-500",
        HEADER_WRAPPER: "flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 px-1",
        CONTENT_CONTAINER: "flex-1 min-h-0 flex flex-col bg-card rounded-[2rem] border border-border shadow-xl shadow-slate-200/20 dark:shadow-none overflow-hidden backdrop-blur-sm",
        MAX_WIDTH: "mx-auto max-w-7xl w-full",
        SECTION_SPACING: "space-y-4",
    },

    // 2. TIPOGRAFÍA Y TEXTO
    TYPOGRAPHY: {
        PAGE_TITLE: "text-2xl font-black tracking-tight text-foreground",
        PAGE_SUBTITLE: "text-sm font-medium text-muted-foreground",
        SECTION_TITLE: "text-base font-black text-white tracking-tight leading-none",
        TABLE_HEADER: "px-6 py-4 font-black text-[13px] uppercase tracking-wider text-muted-foreground",
        BADGE_TEXT: "text-[10px] font-black tracking-widest uppercase",
        FOOTER_STATS: "text-[10px] font-black text-muted-foreground tracking-[0.2em] uppercase opacity-60",
        TINY_MONO: "text-[10px] font-mono font-black tracking-tight",
    },

    // 3. TABLAS (DENSIDAD Y ESTILOS PLATINUM)
    TABLE: {
        TABLE_ELEMENT: "w-full text-sm text-left border-collapse min-w-[1000px]",
        HEADER_ROW: "sticky top-0 z-20 bg-muted/90 backdrop-blur-md border-b border-border shadow-sm",
        HEADER_TH: "px-6 py-4 font-black text-[13px] uppercase tracking-wider text-muted-foreground whitespace-nowrap text-left",
        BODY_ROW: "group hover:bg-primary/5 transition-all duration-200 border-b border-border/50",
        CELL: "px-6 py-4 align-top font-medium",
        SCROLL_AREA: "flex-1 overflow-auto relative custom-scrollbar",
        FOOTER: "px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between shrink-0 rounded-b-[2rem]",
    },

    // 4. EFECTOS ESPECIALES
    EFFECTS: {
        GLASS_PANEL: "bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl shadow-xl shadow-slate-200/20 dark:shadow-none border border-white dark:border-white/5",
    },

    // 5. COMPONENTES DE INTERACCIÓN
    COMPONENTS: {
        BUTTON_PRIMARY: "inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-all active:scale-95 font-bold text-sm shadow-lg shadow-primary/25 border border-primary/20",
        BUTTON_SECONDARY: "inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95 font-bold text-sm shadow-sm border border-slate-200 dark:border-slate-700",
        BUTTON_SUCCESS: "inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-all active:scale-95 font-bold text-sm shadow-lg shadow-emerald-500/25 border border-emerald-500/20",
        BUTTON_DANGER: "inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-all active:scale-95 font-bold text-sm shadow-lg shadow-rose-500/25 border border-rose-500/20",
        BUTTON_INFO: "inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all active:scale-95 font-bold text-sm shadow-lg shadow-blue-500/25 border border-blue-500/20",
        BUTTON_GHOST: "inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all active:scale-95 font-bold text-sm",

        INPUT: "w-full pl-10 pr-4 py-2.5 h-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-medium shadow-sm hover:border-slate-300 dark:hover:border-slate-700",
        MODAL_CONTENT: "bg-white dark:bg-slate-950 rounded-[2rem] border border-slate-200 dark:border-slate-800 shadow-2xl p-8 overflow-hidden",
    },

    // 6. ESTADOS Y BADGES
    STATES: {
        BADGE_BASE: "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border shadow-sm font-black text-[10px] uppercase tracking-widest transition-all",
        SUCCESS: "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
        WARNING: "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
        ERROR: "bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
        INFO: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
        PRIMARY: "bg-primary/5 text-primary border-primary/20 dark:bg-primary/10",
        SECONDARY: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    }
};
