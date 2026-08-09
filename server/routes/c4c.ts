import { Router } from 'express';
import type { Request, Response } from 'express';
import axios from 'axios';
import { C4C_AUTH, C4C_BASE_URL } from '../lib/config.js';
import { safeError } from '../lib/security.js';
import { verifyToken } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la misma posicion en que se
// definian en index.ts. Comprobado con scripts/verificar-orden-rutas.py que ningun par de rutas
// de esta app puede casar la misma URL, asi que el orden no es critico, pero se conserva.

const router = Router();

// --- C4C INTEGRATION ---
router.get('/api/c4c/report/:ticketId', verifyToken, async (req: Request, res: Response) => {
    try {
        const { ticketId } = req.params;

        if (!C4C_BASE_URL || !process.env.C4C_USER || !process.env.C4C_PASSWORD) {
            return res.status(500).json({ 
                error: 'C4C Integration not configured', 
                details: 'Missing C4C_BASE_URL or credentials in environment variables' 
            });
        }
        
        // 1. Find the Service Request
        const searchUrl = `${C4C_BASE_URL}/ServiceRequestCollection?$filter=ID eq '${ticketId}'`;
        const searchResponse = await axios.get(searchUrl, {
            headers: { 'Authorization': `Basic ${C4C_AUTH}` }
        });

        const ticket = searchResponse.data.d.results[0];
        if (!ticket) {
            return res.status(404).json({ error: `Ticket ${ticketId} no encontrado en C4C` });
        }

        // 2. Fetch Attachments using the ObjectID
        // We try to get from the expanded folder or fetch it directly
        let attachments = ticket.ServiceRequestAttachmentFolder?.results;
        
        if (!attachments || attachments.length === 0) {
            const attachmentUrl = `${C4C_BASE_URL}/ServiceRequestCollection('${ticket.ObjectID}')/ServiceRequestAttachmentFolder`;
            try {
                const attachResponse = await axios.get(attachmentUrl, {
                    headers: { 'Authorization': `Basic ${C4C_AUTH}` }
                });
                attachments = attachResponse.data.d.results;
            } catch (attachErr) {
                console.warn('Could not fetch attachments directly:', attachErr);
            }
        }

        if (!attachments || attachments.length === 0) {
            return res.status(404).json({ 
                error: `No se encontraron adjuntos para el ticket ${ticketId}`,
                details: 'El ticket existe pero no tiene archivos asociados en la pestaña de Adjuntos de C4C.'
            });
        }

        // 3. Look for the technical report PDF
        // We prioritize PDFs with "Informe" or "Report" in the name
        let report = attachments.find((a: { MimeType: string; Name: string }) =>
            a.MimeType === 'application/pdf' &&
            (a.Name.toLowerCase().includes('informe') || a.Name.toLowerCase().includes('report'))
        );

        // Fallback: take any PDF if no specific name match
        if (!report) {
            report = attachments.find((a: { MimeType: string; Name: string }) => a.MimeType === 'application/pdf');
        }

        if (!report) {
            return res.status(404).json({ error: `No se encontró un informe en PDF para el ticket ${ticketId}` });
        }

        // 4. Fetch the actual PDF binary content
        // In C4C OData, the content is in the /Binary/$value endpoint of the attachment
        const downloadUrl = `${C4C_BASE_URL}/ServiceRequestAttachmentFolderCollection('${report.ObjectID}')/Binary/$value`;
        
        const pdfResponse = await axios.get(downloadUrl, {
            headers: { 'Authorization': `Basic ${C4C_AUTH}` },
            responseType: 'arraybuffer'
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${report.Name}"`);
        res.send(pdfResponse.data);

    } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: { message?: { value?: string } } }; status?: number }; message?: string };
        console.error('C4C Proxy Error:', axiosErr.response?.data || (safeError(err)));
        res.status(axiosErr.response?.status || 500).json({
            error: 'Failed to retrieve report from C4C',
            details: axiosErr.response?.data?.error?.message?.value || (safeError(err))
        });
    }
});

export default router;
