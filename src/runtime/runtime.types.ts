/** Runtime session status. */
export type RuntimeSessionStatus = 'active' | 'terminated' | 'error' | 'pending';

/** Runtime type discriminator. */
export type RuntimeType = 'terminal' | 'browser' | 'code' | 'file';

/** Persisted runtime session row from `rt_runtime_sessions` table. */
export interface RuntimeSession {
  id: string;
  node_id: number;
  user_id: string;
  device_id: string | null;
  agent_id: string | null;
  runtime_kind: RuntimeType;
  runtime_config: Record<string, any>;
  status: RuntimeSessionStatus;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, any> | null;
}

/** Payload to create a runtime session. */
export interface CreateRuntimeSessionDto {
  nodeId: string;
  deviceId?: string;
  agentId?: string;
  runtimeType: RuntimeType;
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
