/** Runtime session status. */
export type RuntimeSessionStatus = 'creating' | 'active' | 'paused' | 'disconnected' | 'terminated' | 'error';

/** Runtime type discriminator. */
export type RuntimeType = 'terminal' | 'browser' | 'code' | 'file';

/** Persisted runtime session row from `rt_runtime_sessions` table. */
export interface RuntimeSession {
  id: string;
  node_id: string;
  user_id: string;
  device_id: string;
  agent_id: string | null;
  runtime_kind: RuntimeType;
  runtime_provider: string;
  runtime_config: Record<string, any>;
  status: RuntimeSessionStatus;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, any> | null;
  map_card_id: number | null;
  organization_id: string | null;
}

/** Payload to create a runtime session. */
export interface CreateRuntimeSessionDto {
  nodeId: string;
  deviceId: string;
  mapCardId?: number;
  organizationId?: string | null;
  agentId?: string;
  runtimeType: RuntimeType;
  runtimeProvider: string;
  runtimeConfig?: Record<string, any>;
  metadata?: Record<string, any>;
}

/** WebSocket events emitted by the runtime gateway. */
export type RuntimeEvent =
  | 'runtime.created'
  | 'runtime.destroyed'
  | 'runtime.output'
  | 'runtime.input'
  | 'runtime.resize'
  | 'runtime.error';

/** Generic runtime WS message envelope. */
export interface RuntimeMessage<T = any> {
  event: RuntimeEvent;
  sessionId: string;
  data: T;
  timestamp: number;
}
