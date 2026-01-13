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

/**
 * Информация о жертве из метаданных
 */
export interface VictimInfo {
  hostname?: string;
  ip?: string;
  mac?: string;
  os?: string;
  [key: string]: any; // Дополнительные поля могут быть динамическими
}

/**
 * Техническая информация о логе
 */
export interface TechnicalInfo {
  has_payload: boolean;
  payload_length: number;
  processing_success: boolean;
  processed_at?: string;
  error?: string;
}

/**
 * Различные типы расшифрованных данных телеметрии
 */
export type DecryptedTelemetryData =
  | {
      // Успешно распарсенный JSON
      type?: string;
      data?: any;
      victim_info?: VictimInfo;
      server_data?: {
        victim_info?: VictimInfo;
        [key: string]: any;
      };
      [key: string]: any; // Дополнительные поля JSON объекта
    }
  | {
      // Raw данные (не удалось распарсить)
      raw_utf8: string;
      raw_hex: string;
      original_length: number;
      error: string;
    }
  | {
      // Binary данные (не UTF-8)
      raw_hex: string;
      original_length: number;
      error: string;
    }
  | {
      // Пустой payload
      error: string;
    }
  | {
      // Ошибка обработки
      error: string;
      error_stack?: string;
      raw_payload_available?: boolean;
      raw_payload_length?: number;
    };

/**
 * Полная структура лога с расшифрованными данными
 */
export interface TelemetryLogResponse {
  id: string;
  client_id: string;
  timestamp: string | null;
  received_at: string | Date;
  payload_size: number | null;
  data_type: string;
  encrypted: boolean;
  full_decrypted_data: DecryptedTelemetryData;
  original_data: string | null;
  victim_info: VictimInfo;
  display_data: any;
  technical_info: TechnicalInfo;
}