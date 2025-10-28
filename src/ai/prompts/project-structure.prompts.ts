/**
 * Промпты для генерации структуры проектов через AI
 */

export function buildGenerateGoalsPrompt(
  project: any,
  existingGoals: any[] = [],
  count: number = 5,
  settings: any = {}
): string {
  let prompt = `Ти - експерт з проектного менеджменту та декомпозиції задач.\n\n`;

  prompt += `ПРОЕКТ:\n`;
  prompt += `Назва: ${project.title}\n`;
  if (project.description) prompt += `Опис: ${project.description}\n`;
  prompt += `Категорія: ${project.category}\n`;
  prompt += `Пріоритет: ${project.priority}\n`;
  if (project.deadline) prompt += `Дедлайн: ${new Date(project.deadline).toLocaleDateString('uk-UA')}\n`;
  if (project.keywords?.length) prompt += `Ключові слова: ${project.keywords.join(', ')}\n`;

  if (existingGoals.length > 0) {
    prompt += `\nІСНУЮЧІ ЦІЛІ (НЕ ДУБЛЮЙ):\n`;
    existingGoals.forEach(g => {
      prompt += `- ${g.title}\n`;
    });
  }

  prompt += `\nЗАВДАННЯ:\n`;
  prompt += `Згенеруй ${count} високорівневих цілей для цього проекту.\n`;
  prompt += `Кожна ціль повинна бути:\n`;
  prompt += `- Конкретною та вимірюваною\n`;
  prompt += `- Досяжною в рамках проекту\n`;
  prompt += `- Релевантною категорії проекту\n\n`;

  prompt += `ФОРМАТ ВІДПОВІДІ (лише JSON, без markdown):\n`;
  prompt += `[\n`;
  prompt += `  {\n`;
  prompt += `    "title": "Назва цілі (до 100 символів)",\n`;
  prompt += `    "description": "Детальний опис цілі (2-3 речення)",\n`;
  prompt += `    "category": "technical|organizational|personal|learning|business",\n`;
  prompt += `    "priority": "low|medium|high|critical",\n`;
  prompt += `    "keywords": ["ключове слово 1", "ключове слово 2"],\n`;
  prompt += `    "confidence": 0.85\n`;
  prompt += `  }\n`;
  prompt += `]\n\n`;

  prompt += `Відповідай ТІЛЬКИ JSON масивом. Без пояснень, без markdown.\n`;

  return prompt;
}

export function buildGenerateTasksForGoalPrompt(
  goal: any,
  project: any,
  settings: any = {}
): string {
  const count = settings.count || 3;
  const includeSubgoals = settings.include_subgoals || false;

  let prompt = `Ти - експерт з декомпозиції цілей на конкретні задачі.\n\n`;

  prompt += `ПРОЕКТ:\n`;
  prompt += `Назва: ${project.title}\n`;
  if (project.description) prompt += `Опис: ${project.description}\n`;
  prompt += `Категорія: ${project.category}\n\n`;

  prompt += `ЦІЛЬ:\n`;
  prompt += `Назва: ${goal.title}\n`;
  prompt += `Опис: ${goal.description}\n`;
  prompt += `Категорія: ${goal.category}\n`;
  prompt += `Пріоритет: ${goal.priority}\n`;
  if (goal.deadline) prompt += `Дедлайн: ${new Date(goal.deadline).toLocaleDateString('uk-UA')}\n`;

  if (goal.goal_subgoals?.length > 0) {
    prompt += `\nПОДЦІЛІ (вже є):\n`;
    goal.goal_subgoals.forEach(s => {
      prompt += `- ${s.text}\n`;
    });
  }

  prompt += `\nЗАВДАННЯ:\n`;
  prompt += `Згенеруй ${count} конкретних виконуваних задач для досягнення цієї цілі.\n`;
  prompt += `Кожна задача повинна бути:\n`;
  prompt += `- Конкретною та actionable\n`;
  prompt += `- Вимірюваною (clear definition of done)\n`;
  prompt += `- Реалістичною для виконання\n\n`;

  prompt += `ФОРМАТ ВІДПОВІДІ (лише JSON, без markdown):\n`;
  prompt += `{\n`;
  prompt += `  "tasks": [\n`;
  prompt += `    {\n`;
  prompt += `      "topic": "Коротка назва задачі (до 80 символів)",\n`;
  prompt += `      "description": "Детальний опис що треба зробити",\n`;
  prompt += `      "priority": "low|medium|high|critical",\n`;
  prompt += `      "confidence": 0.9`;

  if (includeSubgoals) {
    prompt += `,\n`;
    prompt += `      "subgoals": [\n`;
    prompt += `        { "text": "Підціль 1", "completed": false },\n`;
    prompt += `        { "text": "Підціль 2", "completed": false }\n`;
    prompt += `      ]`;
  }

  prompt += `\n    }\n`;
  prompt += `  ]\n`;
  prompt += `}\n\n`;

  prompt += `Відповідай ТІЛЬКИ JSON об'єктом. Без пояснень, без markdown.\n`;

  return prompt;
}

export function buildGenerateFullStructurePrompt(
  project: any,
  settings: any
): string {
  let prompt = `Ти - експерт з проектного менеджменту. Проаналізуй проект і створи повну структуру цілей і задач.\n\n`;

  prompt += `ПРОЕКТ:\n`;
  prompt += `Назва: ${project.title}\n`;
  if (project.description) prompt += `Опис: ${project.description}\n`;
  prompt += `Категорія: ${project.category}\n`;
  prompt += `Пріоритет: ${project.priority}\n`;
  if (project.deadline) prompt += `Дедлайн: ${new Date(project.deadline).toLocaleDateString('uk-UA')}\n`;
  if (project.keywords?.length) prompt += `Ключові слова: ${project.keywords.join(', ')}\n\n`;

  prompt += `НАЛАШТУВАННЯ ГЕНЕРАЦІЇ:\n`;
  if (settings.generate_goals) {
    prompt += `- Кількість цілей: ${settings.goals_count.min}-${settings.goals_count.max}\n`;
  }
  if (settings.generate_tasks) {
    prompt += `- Задач на ціль: ${settings.tasks_per_goal.min}-${settings.tasks_per_goal.max}\n`;
  }
  if (settings.generate_subgoals) {
    prompt += `- Генерувати підцілі для складних задач: так\n`;
  }
  if (settings.calculate_deadlines) {
    prompt += `- Розрахувати орієнтовні дедлайни: так\n`;
  }
  if (settings.determine_priorities) {
    prompt += `- Визначити пріоритети: так\n`;
  }
  prompt += `- Рівень деталізації: ${settings.detail_level}\n\n`;

  prompt += `ЗАВДАННЯ:\n`;
  prompt += `Створи повну ієрархічну структуру проекту:\n`;
  prompt += `1. Визнач ${settings.goals_count.min}-${settings.goals_count.max} ключових цілей\n`;
  prompt += `2. Для кожної цілі створи ${settings.tasks_per_goal.min}-${settings.tasks_per_goal.max} конкретних задач\n`;
  if (settings.generate_subgoals) {
    prompt += `3. Для складних задач додай 2-4 підцілі\n`;
  }
  if (settings.determine_priorities) {
    prompt += `4. Визнач пріоритет для кожної цілі та задачі\n`;
  }
  if (settings.calculate_deadlines && project.deadline) {
    prompt += `5. Розподіли дедлайни пропорційно часу до ${new Date(project.deadline).toLocaleDateString('uk-UA')}\n`;
  }

  prompt += `\nФОРМАТ ВІДПОВІДІ (лише JSON, без markdown):\n`;
  prompt += `{\n`;
  prompt += `  "goals": [\n`;
  prompt += `    {\n`;
  prompt += `      "title": "Назва цілі",\n`;
  prompt += `      "description": "Опис цілі",\n`;
  prompt += `      "category": "technical|organizational|personal|learning|business",\n`;
  prompt += `      "priority": "low|medium|high|critical",\n`;
  prompt += `      "keywords": ["ключове слово"],\n`;
  if (settings.calculate_deadlines) {
    prompt += `      "deadline": "YYYY-MM-DD",\n`;
  }
  prompt += `      "confidence": 0.85,\n`;
  prompt += `      "tasks": [\n`;
  prompt += `        {\n`;
  prompt += `          "topic": "Назва задачі",\n`;
  prompt += `          "description": "Опис задачі",\n`;
  prompt += `          "priority": "low|medium|high|critical",\n`;
  if (settings.calculate_deadlines) {
    prompt += `          "deadline": "YYYY-MM-DD",\n`;
  }
  prompt += `          "confidence": 0.9`;
  
  if (settings.generate_subgoals) {
    prompt += `,\n`;
    prompt += `          "subgoals": [\n`;
    prompt += `            { "text": "Підціль", "completed": false }\n`;
    prompt += `          ]`;
  }
  
  prompt += `\n        }\n`;
  prompt += `      ]\n`;
  prompt += `    }\n`;
  prompt += `  ]\n`;
  prompt += `}\n\n`;

  if (settings.detail_level === 'detailed') {
    prompt += `Рівень деталізації ДЕТАЛЬНИЙ: надай повні описи, конкретні кроки виконання, корисні поради.\n`;
  } else if (settings.detail_level === 'brief') {
    prompt += `Рівень деталізації КОРОТКИЙ: лише назви та мінімальні описи.\n`;
  }

  prompt += `\nВідповідай ТІЛЬКИ JSON об'єктом. Без пояснень, без markdown.\n`;

  return prompt;
}

