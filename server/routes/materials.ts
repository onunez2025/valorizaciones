import { Router } from 'express';
import crypto from 'crypto';
import type { Request, Response } from 'express';
import sql from 'mssql';
import { getReadPool, getWritePool } from '../db.js';
import { addInput } from '../lib/db.js';
import { safeError } from '../lib/security.js';
import { verifyToken } from '../middleware/auth.js';

// Este router se monta en `/` conservando las rutas completas y en la misma posicion en que se
// definian en index.ts. Comprobado con scripts/verificar-orden-rutas.py que ningun par de rutas
// de esta app puede casar la misma URL, asi que el orden no es critico, pero se conserva.

const router = Router();

// --- MATERIALES ---
router.get('/api/materials', verifyToken, async (_req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const t0 = Date.now();
        const result = await db.request().query("SELECT ID_Material, ID_Externo, Nombre, Categoria, Estado, Sector FROM [dbo].[GAC_APP_TB_MATERIALES] ORDER BY Categoria, Nombre");
        // Devuelve el catalogo ENTERO sin paginar (mas de 14.000 productos). Se cronometra
        // para separar el coste de la consulta del de transportar y pintar tantas filas.
        console.log(`[MATERIALES] ${result.recordset.length} productos en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

// ── Portado de main (097047c) ──────────────────────────────────────────────────────
// Catalogo de tipos de servicio FSM. Lo necesita la pantalla de Casos Especiales para
// elegir Servicio Inicial y Servicio Final por codigo en vez de por descripcion.
// En main vivia en el monolito; aqui va con materiales por ser tambien un maestro.
router.get('/api/services', verifyToken, async (_req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query("SELECT Id, Descripcion FROM [SIATC].[FSM_TipoServicio] ORDER BY Descripcion");
        res.json(result.recordset);
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.get('/api/materials/categories', verifyToken, async (_req: Request, res: Response) => {
    try {
        const db = await getReadPool();
        const result = await db.request().query("SELECT DISTINCT Categoria FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE Categoria IS NOT NULL AND Categoria != '' ORDER BY Categoria");
        res.json(result.recordset.map(r => r.Categoria));
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

router.post('/api/materials', verifyToken, async (req: Request, res: Response) => {
    const { idExterno, nombre, categoria, sector } = req.body;
    try {
        const db = await getWritePool();
        const checkReq = db.request();
        addInput(checkReq, 'ext', sql.VarChar(50), idExterno);
        const check = await checkReq.query("SELECT ID_Material FROM [dbo].[GAC_APP_TB_MATERIALES] WHERE ID_Externo = @ext");

        if (check.recordset.length > 0) {
            const id = check.recordset[0].ID_Material;
            const matUpdReq = db.request();
            addInput(matUpdReq, 'id', sql.VarChar(8), id);
            addInput(matUpdReq, 'nombre', sql.NVarChar(255), nombre);
            addInput(matUpdReq, 'cat', sql.NVarChar(100), categoria);
            addInput(matUpdReq, 'sec', sql.NVarChar(50), sector || 'GAC');
            await matUpdReq.query(`UPDATE [dbo].[GAC_APP_TB_MATERIALES] SET Nombre = @nombre, Categoria = @cat, Sector = @sec WHERE ID_Material = @id`);
            res.json({ success: true, id, action: 'updated' });
        } else {
            const newId = crypto.randomBytes(4).toString('hex');
            const matInsReq = db.request();
            addInput(matInsReq, 'id', sql.VarChar(8), newId);
            addInput(matInsReq, 'ext', sql.VarChar(50), idExterno);
            addInput(matInsReq, 'nombre', sql.NVarChar(255), nombre);
            addInput(matInsReq, 'cat', sql.NVarChar(100), categoria);
            addInput(matInsReq, 'sec', sql.NVarChar(50), sector || 'GAC');
            await matInsReq.query(`INSERT INTO [dbo].[GAC_APP_TB_MATERIALES] (ID_Material, ID_Externo, Nombre, Categoria, Sector, Estado, EstadoEnCatalogo) VALUES (@id, @ext, @nombre, @cat, @sec, 'Activo', 'Publicado')`);
            res.json({ success: true, id: newId, action: 'created' });
        }
    } catch (err: unknown) { res.status(500).json({ error: safeError(err) }); }
});

export default router;
