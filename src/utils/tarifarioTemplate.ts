import ExcelJS from 'exceljs';

export async function downloadTarifarioTemplate() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Tarifario');
    const headers = ['CAS_Nombre', 'Categoria', 'Servicio', 'Fecha_inicio', 'Fecha_fin', 'Importe', 'Estado'];
    worksheet.columns = headers.map(h => ({ header: h, width: Math.max(h.length + 4, 20) }));
    worksheet.addRow(['Black', 'CALENTADORES A GAS', 'Instalación', '01/01/2025', '31/12/2026', 42, 'A']);
    worksheet.addRow(['Silar', 'TERMAS ELECTRICAS -50LT', 'Revisión', '01/01/2025', '31/12/2026', 35, 'A']);
    const buf = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Plantilla_Tarifario.xlsx';
    a.click();
    URL.revokeObjectURL(url);
}
