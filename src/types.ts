export type Permission =
  | 'val.dashboard.view'
  | 'val.valuations.view'
  | 'val.valuations.edit'
  | 'val.valuations.close'
  | 'val.penalties.view'
  | 'val.penalties.create'
  | 'val.penalties.rebuttal'
  | 'val.tarifario.view'
  | 'val.tarifario.edit'
  | 'val.config.view'
  | 'val.config.users'
  | 'val.config.roles'
  | 'val.config.audit';

export interface User {
  id: string;
  full_name: string;
  username: string;
  email: string;
  role_id: string;
  role_name?: string;
  management_id: string;
  management_name?: string;
  is_active: boolean;
  created_at: string;
  theme: string;
  permissions?: Permission[];
  requires_password_change?: boolean;
}

export interface CAS {
  RUC: string;
  Nombre_CAS: string;
  ID_CAS: string;
  Zona_atencion: string;
  Correo: string;
}

export interface ValuationTicket {
  Ticket: string;
  Fecha: string;
  FechaVisita?: string;
  FechaCierre?: string;
  DiasDiferencia?: number;
  Servicio: string;
  Categoria: string;
  TarifaBase: number;
  Adicionales: number;
  Total: number;
  Estado: string;
  ServicioNombre?: string;
  CodigoEquipo?: string;
  NombreEquipo?: string;
  NombreTecnico?: string;
  ApellidoTecnico?: string;
  ComentarioTecnico?: string;
  Distrito?: string;
  Departamento?: string;
}

export interface Material {
  ID_Material: string;
  ID_Externo: string;
  Nombre: string;
  Categoria: string;
  Estado: string;
  Sector?: string;
}

export interface Penalty {
  Id: string;
  Ticket?: string;
  Fecha: string;
  Motivo: string;
  Descripcion: string;
  Importe: number;
  Estado: string;
  CreadoPor?: string;
  Sustento_CAS?: string;
  Respuesta_Analista?: string;
}


export interface ValuationAdicional {
  Id: string;
  Ticket?: string;
  Motivo: string;
  Importe: number;
}

export interface PenaltyMotive {
  IdMotivo: string;
  Motivo: string;
}

export interface TarifarioEntry {
  Id: string;
  Categoria: string;
  ServicioCode: string;
  ServicioNombre?: string;
  Fecha_inicio: string;
  Fecha_fin: string | null;
  Importe: number;
  Estado: string;
}
