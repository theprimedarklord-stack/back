# Анализ Endpoint `/ai/chat` - Ответы на вопросы

## 1. Формат ответа

**Вопрос**: Возвращает ли endpoint `/ai/chat` SSE stream (`text/event-stream`) или JSON (`application/json`)?

**Ответ**: ✅ **JSON (`application/json`)**

Endpoint использует стандартный NestJS POST handler, который возвращает JSON ответ. SSE stream не используется.

**Код**: `src/ai/ai.controller.ts:99-130`

---

## 2. Структура ответа

**Вопрос**: Какая полная структура ответа от `/ai/chat`?

**Ответ**: Текущая структура ответа:

```json
{
  "success": true,
  "message": "текст ответа от AI",
  "tokensUsed": 150,
  "modelUsed": "gemini-2.5-flash"
}
```

**Проблема**: ❌ Структура **НЕ соответствует** ожиданиям frontend!

Frontend ожидает:
```json
{
  "message": "...",
  "metadata": {
    "promptTokens": 100,
    "responseTokens": 200,
    "totalTokens": 300,
    "responseTime": "1.23",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "modelName": "Gemini 2.5 Flash"
  }
}
```

**Код**: `src/ai/ai.controller.ts:114-119`

---

## 3. Токены (Tokens)

**Вопрос**: В каком формате возвращаются токены?

**Ответ**: ❌ **Проблема найдена!**

### Текущая ситуация:

1. **Где находятся**: В корне ответа как `tokensUsed` (число)
2. **Название поля**: `tokensUsed` (только общее количество)
3. **Разделение**: ❌ **НЕТ разделения на prompt/response токены**

### Что доступно в провайдерах:

- **Gemini**: Только `totalTokenCount` (общее количество)
  - Код: `src/ai/providers/gemini.provider.ts:48`
  - `response.usageMetadata?.totalTokenCount`

- **OpenAI**: ✅ Есть разделение!
  - `completion.usage?.prompt_tokens` - токены промпта
  - `completion.usage?.completion_tokens` - токены ответа
  - `completion.usage?.total_tokens` - общее количество
  - Код: `src/ai/providers/openai.provider.ts:38-39`

- **Anthropic**: ✅ Есть разделение!
  - `message.usage.input_tokens` - токены промпта
  - `message.usage.output_tokens` - токены ответа
  - Код: `src/ai/providers/anthropic.provider.ts:43`

### Проблема:

1. Интерфейс `AIProviderResponse` возвращает только `tokensUsed` (общее количество)
2. Провайдеры не извлекают раздельные токены (кроме OpenAI и Anthropic, где они доступны)
3. Endpoint не возвращает `promptTokens`, `responseTokens`, `totalTokens` в `metadata`

**Код**: 
- Интерфейс: `src/ai/providers/ai-provider.interface.ts:4-7`
- Endpoint: `src/ai/ai.controller.ts:117`

---

## 4. Время обработки (Response Time)

**Вопрос**: В каком формате возвращается время обработки?

**Ответ**: ❌ **Время обработки НЕ измеряется и НЕ возвращается!**

### Текущая ситуация:

- Время обработки **НЕ измеряется** в методе `sendChatMessage`
- Время обработки **НЕ возвращается** в ответе endpoint

### Что нужно:

Frontend ожидает:
- `metadata.responseTime` (строка в секундах, например "1.23")

### Где измеряется время в других методах:

В методе `generateRecommendations` время измеряется:
```typescript
const startTime = Date.now();
// ... код ...
const duration = Date.now() - startTime;
```
Но это только для логирования, не возвращается в ответе.

**Код**: `src/ai/ai.service.ts:193-263` (метод `sendChatMessage`)

---

## 5. Метаданные в SSE

**Вопрос**: Если используется SSE stream, в каком формате отправляется событие `done` с метаданными?

**Ответ**: ⚠️ **SSE НЕ используется**

Endpoint возвращает обычный JSON ответ, не SSE stream. Этот вопрос не применим к текущей реализации.

---

## 6. Метаданные в JSON

**Вопрос**: Если используется JSON, где находятся метаданные?

**Ответ**: ❌ **Метаданные НЕ возвращаются в ожидаемом формате!**

### Текущая ситуация:

Метаданные находятся в корне ответа:
```json
{
  "success": true,
  "message": "...",
  "tokensUsed": 150,  // в корне, не в metadata
  "modelUsed": "gemini-2.5-flash"  // в корне, не в metadata
}
```

### Что ожидает frontend:

```json
{
  "message": "...",
  "metadata": {
    "promptTokens": 100,
    "responseTokens": 200,
    "totalTokens": 300,
    "responseTime": "1.23",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "modelName": "Gemini 2.5 Flash"
  }
}
```

**Код**: `src/ai/ai.controller.ts:114-119`

---

## Резюме проблем

### ❌ Что не работает:

1. **Формат ответа**: Структура не соответствует ожиданиям frontend
2. **Токены**: 
   - Нет разделения на `promptTokens` / `responseTokens`
   - Только `tokensUsed` в корне ответа
   - Gemini не предоставляет раздельные токены (только общее количество)
3. **Время обработки**: Не измеряется и не возвращается
4. **Метаданные**: Нет объекта `metadata` с нужными полями
5. **Provider**: Не возвращается в ответе
6. **ModelName**: Не возвращается (только `model`)

### ✅ Что работает:

1. Endpoint возвращает JSON (не SSE)
2. Токены возвращаются (но в неправильном формате)
3. Модель возвращается (но как `modelUsed`, не в `metadata`)

---

## Рекомендации по исправлению

### 1. Обновить интерфейс `AIProviderResponse`

Добавить раздельные токены:
```typescript
export interface AIProviderResponse {
  text: string;
  tokensUsed: number;
  promptTokens?: number;  // новое
  responseTokens?: number; // новое
}
```

### 2. Обновить провайдеры

- **Gemini**: Оставить только `totalTokenCount` (разделение недоступно)
- **OpenAI**: Извлекать `prompt_tokens` и `completion_tokens`
- **Anthropic**: Извлекать `input_tokens` и `output_tokens`

### 3. Добавить измерение времени в `sendChatMessage`

```typescript
const startTime = Date.now();
// ... код ...
const responseTime = ((Date.now() - startTime) / 1000).toFixed(2);
```

### 4. Обновить формат ответа endpoint

```typescript
return {
  message: result.text,
  metadata: {
    promptTokens: result.promptTokens || 0,
    responseTokens: result.responseTokens || 0,
    totalTokens: result.tokensUsed,
    responseTime: responseTime.toString(),
    provider: result.providerUsed,
    model: result.modelUsed,
    modelName: getModelDisplayName(result.modelUsed, result.providerUsed)
  }
};
```

---

## Файлы для изменения

1. `src/ai/providers/ai-provider.interface.ts` - добавить раздельные токены
2. `src/ai/providers/gemini.provider.ts` - попытаться извлечь раздельные токены (если доступно)
3. `src/ai/providers/openai.provider.ts` - извлечь `prompt_tokens` и `completion_tokens`
4. `src/ai/providers/anthropic.provider.ts` - извлечь `input_tokens` и `output_tokens`
5. `src/ai/ai.service.ts` - обновить `sendChatMessage` для измерения времени
6. `src/ai/ai.controller.ts` - обновить формат ответа endpoint

