// Normaliza el campo Apps (lista separada por comas) quitando duplicados y espacios.
export const cleanApps = (str: string) => [...new Set((str || '').split(',').map(s => s.trim()).filter(Boolean))].join(', ');
