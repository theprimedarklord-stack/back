export interface DataCore {
  nodes: any[];
  edges: any[];
  metadata: any;
  views: any;
}

export interface MapCard {
  id: number;
  user_id: string;
  card_id?: number | null;
  data_core: DataCore;
  created_at: string;
  updated_at: string;
}

export interface CreateMapCardData {
  data_core: DataCore;
  card_id?: number | null;
}

export interface UpdateMapCardData {
  data_core?: DataCore;
  card_id?: number | null;
}

