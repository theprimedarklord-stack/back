import {
  IsArray,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MapNodeRowDto {
  @IsString()
  id: string;

  /** Тип вузла з DataCore дослівно: multinode, zone, table, … */
  @IsString()
  kind: string;

  @IsOptional()
  @IsNumber()
  position?: number;

  @IsOptional()
  @IsString()
  title?: string;

  /** Блоки BlockNote. `null` — у вузла контенту немає (зона, якір). */
  @IsOptional()
  content?: any[] | null;

  /** Плаский текст для пошуку. */
  @IsOptional()
  @IsString()
  content_text?: string | null;

  /** `{position:{x,y}, size:{w,h}}` — розкладка на канвасі картки. */
  @IsOptional()
  @IsObject()
  layout?: Record<string, any> | null;

  /** Усе інше з `node.data`, окрім blocks і canvasNodeData. */
  @IsOptional()
  @IsObject()
  props?: Record<string, any>;

  /**
   * Куди цей вузол посилається — id інших вузлів (`[[wiki]]`).
   *
   * Картка теж вузол, тож посилання на картку приїжджає як `mapcard-<N>` і
   * ніяк не відрізняється від посилання на ноду. Відсутність поля означає
   * «посилання не рахували, не чіпати»; порожній масив — «посилань немає».
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  refs?: string[];

  /**
   * Версія рядка, яку клієнт вважає поточною.
   *
   * Збігається — запис проходить і версія зростає. Не збігається — рядок
   * чіпати не можна: його встигла змінити інша вкладка, і мовчазний запис
   * стер би її правку.
   *
   * Тільки для `mode: 'partial'`; повна синхронізація авторитетна за
   * визначенням і версію не звіряє.
   */
  @IsOptional()
  @IsNumber()
  expected_version?: number;
}

export class MapNodeLinkDto {
  @IsString()
  from_node: string;

  @IsString()
  to_node: string;

  /** Тип ребра з DataCore: arrow, parent, reference, zone, semantic, ai. */
  @IsString()
  kind: string;

  @IsOptional()
  @IsObject()
  props?: Record<string, any>;
}

export class MapNodeContainerDto {
  @IsOptional()
  @IsString()
  title?: string;

  /** views / metadata / activeModes — те, що описує карту, а не її вузли. */
  @IsOptional()
  @IsObject()
  props?: Record<string, any>;
}

export class SyncMapNodesDto {
  @IsNumber()
  map_card_id: number;

  /**
   * `full` — тіло описує картку цілком: усе, чого немає в `nodes`, вважається
   * видаленим, ребра перезаписуються. Так синхронізується картка, про стан
   * рядків якої клієнт нічого не знає.
   *
   * `partial` — тіло описує тільки зміни: `nodes` — те, що правилося,
   * `removed_node_ids` — те, що прибрали, `links` без значення означає «ребра
   * не чіпати». За замовчуванням `full` — щоб старий клієнт поводився як
   * раніше.
   */
  @IsOptional()
  @IsString()
  mode?: 'full' | 'partial';

  @IsOptional()
  @ValidateNested()
  @Type(() => MapNodeContainerDto)
  container?: MapNodeContainerDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MapNodeRowDto)
  nodes: MapNodeRowDto[];

  /** Тільки для `partial`: вузли, які зникли з картки. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removed_node_ids?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MapNodeLinkDto)
  links?: MapNodeLinkDto[];
}
