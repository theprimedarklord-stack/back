export interface MapCardHistory {
  id: number;
  map_card_id: number;
  user_id: string;
  version: number;
  operation_type: string;
  operation_data: any;
  created_at: string;
}

export interface CreateMapCardHistoryData {
  map_card_id: number;
  user_id: string;
  version: number;
  operation_type: string;
  operation_data: any;
}
