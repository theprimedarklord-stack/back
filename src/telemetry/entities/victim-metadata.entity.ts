// src/telemetry/entities/victim-metadata.entity.ts
export interface VictimMetadata {
  id: string;
  client_id: string;
  hostname: string;
  ip: string;
  mac: string;
  os: string;
  first_seen: string;
  last_updated: string;
}
