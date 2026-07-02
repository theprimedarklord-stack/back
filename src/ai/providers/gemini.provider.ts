// src/ai/providers/gemini.provider.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, AIProviderResponse } from './ai-provider.interface';
import { AISettings } from '../entities/ai-settings.entity';

// Опис read-only інструментів пам'яті проекту
const MEMORY_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'get_memory_context',
        description: 'Отримує зкомпільовану markdown-пам\'ять останніх змін проекту (корисно для отримання загального контексту проекту).',
        parameters: {
          type: 'OBJECT',
          properties: {
            limit: { type: 'INTEGER', description: 'Кількість останніх чейнджлогів для читання' }
          }
        }
      },
      {
        name: 'search_memories',
        description: 'Виконує нечіткий пошук у каталозі пам\'яті проекту за ключовими словами.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Слово або фраза для пошуку (наприклад, "admin", "virtualization")' }
          },
          required: ['query']
        }
      }
    ]
  }
];

@Injectable()
export class GeminiProvider implements AIProvider {
  constructor(private readonly configService: ConfigService) {}

  async generateContent(
    prompt: string,
    settings: AISettings
  ): Promise<AIProviderResponse> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY не настроен');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: settings.model || 'gemini-2.5-flash',
      systemInstruction: {
        parts: [{
          text: `Ти — інтелектуальний помічник розробника SmartMemory. 
Тобі доступна локальна пам'ять проекту (чейнджлоги, історія змін, контекст). 
Якщо користувач запитує про останні зміни, версії, оновлення, історію проекту або просить знайти якусь інформацію про хід розробки, ти ПОВИНЕН викликати відповідні інструменти (get_memory_context або search_memories) для отримання точних даних. 
Ніколи не вигадуй інформацію про проект. Якщо інструменти не повернули даних, чесно поясни це користувачу.`
        }]
      }
    });

    const generationConfig = {
      temperature: settings.temperature || 0.7,
      maxOutputTokens: settings.max_tokens || 2048,
    };

    // Добавляем таймаут 60 секунд
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Gemini API request timeout after 60 seconds'));
      }, 60000);
    });

    try {
      const contents = [
        { role: 'user', parts: [{ text: prompt }] }
      ];

      let depth = 0;
      const maxDepth = 5;
      let keepRunning = true;
      let finalResponse: any;

      const memoryApiKey = this.configService.get<string>('MEMORY_API_KEY') || 'adwar';
      const isProd = process.env.NODE_ENV === 'production';
      const clientUrl = isProd
        ? (this.configService.get<string>('PROD_CLIENT_URL') || 'https://smartmemory.vercel.app')
        : (this.configService.get<string>('CLIENT_URL') || 'http://localhost:3000');

      console.log(`[Gemini Provider] Target Next.js client URL for memory: ${clientUrl}`);

      while (keepRunning && depth < maxDepth) {
        depth++;
        console.log(`[Gemini Provider] Execution loop - Round ${depth}`);

        const requestPromise = model.generateContent({
          contents,
          tools: MEMORY_TOOLS,
          generationConfig,
        });

        const result = await Promise.race([requestPromise, timeoutPromise]);
        const response = result.response;
        const functionCalls = response.functionCalls ? response.functionCalls() : undefined;

        if (functionCalls && functionCalls.length > 0) {
          console.log(`[Gemini Provider] Gemini requested function calls:`, JSON.stringify(functionCalls, null, 2));

          // 1. Додаємо запит моделі (functionCall) в історію діалогу
          contents.push({
            role: 'model',
            parts: functionCalls.map((call) => ({ functionCall: call }))
          });

          // 2. Виконуємо всі виклики паралельно (батчинг)
          const responseParts = [];
          for (const call of functionCalls) {
            let functionResult = '';
            try {
              console.log(`[Gemini Provider] Executing tool: ${call.name} with args:`, call.args);
              
              if (call.name === 'get_memory_context') {
                const limit = call.args?.limit || 15;
                const res = await fetch(`${clientUrl}/api/memory/context?limit=${limit}`, {
                  headers: {
                    'Authorization': `Bearer ${memoryApiKey}`,
                  }
                });
                if (!res.ok) {
                  throw new Error(`HTTP error! status: ${res.status}`);
                }
                functionResult = await res.text();
                console.log(`[Gemini Provider] Successfully fetched context. Length: ${functionResult.length} characters.`);
              } else if (call.name === 'search_memories') {
                const query = call.args?.query || '';
                const res = await fetch(`${clientUrl}/api/memory/search?query=${encodeURIComponent(String(query))}`, {
                  headers: {
                    'Authorization': `Bearer ${memoryApiKey}`,
                  }
                });
                if (!res.ok) {
                  throw new Error(`HTTP error! status: ${res.status}`);
                }
                const data: any = await res.json();
                functionResult = JSON.stringify(data, null, 2);
                console.log(`[Gemini Provider] Search completed. Found ${data.length || 0} entries.`);
              } else {
                functionResult = `Error: Tool '${call.name}' is not supported.`;
                console.warn(`[Gemini Provider] Unsupported tool call: ${call.name}`);
              }
            } catch (err: any) {
              functionResult = `Error executing tool: ${err.message || err}`;
              console.error(`[Gemini Provider] Error executing tool ${call.name}:`, err);
            }

            responseParts.push({
              functionResponse: {
                name: call.name,
                response: { result: functionResult }
              }
            });
          }

          // 3. Додаємо відповіді функцій (functionResponse) в історію діалогу єдиним повідомленням (user)
          contents.push({
            role: 'user',
            parts: responseParts
          });

        } else {
          // Якщо викликів функцій немає, це фінальна текстова відповідь
          console.log(`[Gemini Provider] Final text response received in round ${depth}.`);
          finalResponse = response;
          keepRunning = false;
        }
      }

      if (depth >= maxDepth && keepRunning) {
        throw new Error('Maximum tool execution depth exceeded');
      }

      const text = finalResponse.text();
      const tokensUsed = finalResponse.usageMetadata?.totalTokenCount || 0;

      return { text, tokensUsed };
    } catch (error: any) {
      console.error('[Gemini Provider] Error:', error);
      
      // Обработка таймаута
      if (error.message && error.message.includes('timeout')) {
        throw new Error('Gemini API request timeout');
      }
      
      // Обработка ошибки 429 (Quota Exceeded)
      const status = error?.status || error?.statusCode || error?.response?.status;
      if (status === 429) {
        throw new Error('Gemini API quota exceeded. Please try again later or use a different model.');
      }
      
      // Проверка сообщения об ошибке квоты (на случай если статус не определен)
      if (error.message && (
        error.message.toLowerCase().includes('quota') ||
        error.message.toLowerCase().includes('rate limit') ||
        error.message.toLowerCase().includes('429')
      )) {
        throw new Error('Gemini API quota exceeded. Please try again later or use a different model.');
      }
      
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }
}

