export type AuditEntityType =
  'Client' | 'Reservation' | 'Treatment' | 'CapacityPool';

export type AuditAction =
  | 'CREATE_CLIENT'
  | 'UPDATE_CLIENT'
  | 'DELETE_CLIENT'
  | 'CREATE_RESERVATION'
  | 'UPDATE_RESERVATION'
  | 'CANCEL_RESERVATION'
  | 'CREATE_TREATMENT'
  | 'UPDATE_TREATMENT'
  | 'DELETE_TREATMENT'
  | 'UPDATE_CAPACITY_POOL';

export interface AuditConfig {
  action: AuditAction;
  entityType: AuditEntityType;
  getEntityId: (req: Request) => string | undefined;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
  };
}
