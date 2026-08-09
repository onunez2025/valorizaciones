import type { Request } from 'express';
import sql from 'mssql';
import { getWritePool } from '../db.js';
import { addInput } from './db.js';
import type { AuthRequest } from '../middleware/auth.js';

// Helper for Auditing
export async function logAudit(req: Request, action: string, entity: string, entityId: string, details: Record<string, unknown>) {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return;
    const db = await getWritePool();
    const auditReq = db.request();
    addInput(auditReq, 'uid', sql.UniqueIdentifier, user.id);
    addInput(auditReq, 'un', sql.NVarChar(255), user.full_name || user.username);
    addInput(auditReq, 'acc', sql.NVarChar(100), action);
    addInput(auditReq, 'ent', sql.NVarChar(100), entity);
    addInput(auditReq, 'eid', sql.NVarChar(100), entityId);
    addInput(auditReq, 'det', sql.NVarChar(4000), JSON.stringify(details));
    addInput(auditReq, 'app', sql.VarChar(20), 'VAL');
    addInput(auditReq, 'ip', sql.VarChar(50), req.ip || null);
    await auditReq.query(`INSERT INTO [dbo].[GAC_APP_TB_AUDIT_LOG] (UsuarioID, UsuarioNombre, Accion, Entidad, EntidadID, Detalle, ApplicationCode, IPAddress, Fecha)
              VALUES (@uid, @un, @acc, @ent, @eid, @det, @app, @ip, GETDATE())`);
  } catch (err) {
    console.error('❌ Falla en Log de Auditoría VAL:', err);
  }
}
