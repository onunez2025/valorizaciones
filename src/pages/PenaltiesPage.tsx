import React from 'react';

export default function PenaltiesPage() {
    return (
        <div className="flex-1 overflow-y-auto p-1 space-y-6 animate-in fade-in duration-500 custom-scrollbar">
            <h1 className="text-2xl font-bold tracking-tight">Gestión de Penalidades</h1>
            <div className="bg-card p-6 rounded-lg border border-border shadow-sm">
                <p className="text-muted-foreground">Listado de infracciones y descargos del CAS.</p>
            </div>
        </div>
    );
}
