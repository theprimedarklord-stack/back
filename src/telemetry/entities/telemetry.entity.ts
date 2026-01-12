/**
 * TypeScript интерфейсы для типизации телеметрии
 */

export interface TelemetryClient {
  id: string;
  client_public_key_hash: string;
  client_public_key: string;
  response_key_encrypted: Buffer;
  first_seen: string;
  last_seen: string;
  is_active: boolean;
}

export interface TelemetryEntry {
  id: string;
  client_id: string;
  timestamp: string;
  encrypted_payload: Buffer; // AES-GCM зашифрованные данные (весь JSON payload)
  payload_size: number;
  received_at: string;
}
