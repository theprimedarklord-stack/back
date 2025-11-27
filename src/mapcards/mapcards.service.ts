import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { MapCard, CreateMapCardData, UpdateMapCardData } from './entities/mapcard.entity';

@Injectable()
export class MapcardsService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(userId: string, createMapCardData: CreateMapCardData): Promise<MapCard> {
    try {
      const now = new Date().toISOString();

      const newMapCard = {
        user_id: userId,
        data_core: createMapCardData.data_core,
        card_id: createMapCardData.card_id || null,
        created_at: now,
        updated_at: now,
      };

      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('map_cards')
        .insert(newMapCard)
        .select()
        .single();

      if (error) {
        throw new InternalServerErrorException(`Ошибка создания карты знаний: ${error.message}`);
      }

      return data;
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка создания карты знаний: ${error.message}`);
    }
  }

  async findAll(userId: string): Promise<MapCard[]> {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('map_cards')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new InternalServerErrorException(`Ошибка получения карт знаний: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка получения карт знаний: ${error.message}`);
    }
  }

  async findOne(userId: string, id: number): Promise<MapCard> {
    try {
      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('map_cards')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Карта знаний не найдена');
        }
        throw new InternalServerErrorException(`Ошибка получения карты знаний: ${error.message}`);
      }

      return data;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка получения карты знаний: ${error.message}`);
    }
  }

  async update(userId: string, id: number, updateMapCardData: UpdateMapCardData): Promise<MapCard> {
    try {
      // Проверяем существование карты перед обновлением
      await this.findOne(userId, id);

      const now = new Date().toISOString();
      const updateData: any = {
        updated_at: now,
      };

      // Копируем только переданные поля
      if (updateMapCardData.data_core !== undefined) {
        updateData.data_core = updateMapCardData.data_core;
      }
      if (updateMapCardData.card_id !== undefined) {
        updateData.card_id = updateMapCardData.card_id;
      }

      const { data, error } = await this.supabaseService
        .getAdminClient()
        .from('map_cards')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new NotFoundException('Карта знаний не найдена');
        }
        throw new InternalServerErrorException(`Ошибка обновления карты знаний: ${error.message}`);
      }

      return data;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка обновления карты знаний: ${error.message}`);
    }
  }

  async remove(userId: string, id: number): Promise<void> {
    try {
      // Проверяем существование карты перед удалением
      await this.findOne(userId, id);

      const { error } = await this.supabaseService
        .getAdminClient()
        .from('map_cards')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        throw new InternalServerErrorException(`Ошибка удаления карты знаний: ${error.message}`);
      }
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException(`Ошибка удаления карты знаний: ${error.message}`);
    }
  }
}

