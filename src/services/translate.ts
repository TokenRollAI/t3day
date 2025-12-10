// 翻译服务 - 使用 OpenAI SDK 进行多语言翻译
import OpenAI from 'openai';

// 支持的目标语言
export const TARGET_LANGUAGES = ['en', 'ja', 'ko', 'es', 'ru', 'pt'] as const;
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

// 需要翻译的字段
export const TRANSLATABLE_FIELDS = ['title', 'description', 'location_name', 'source_event'] as const;
export type TranslatableField = (typeof TRANSLATABLE_FIELDS)[number];

// 单语言翻译结果
export interface LanguageTranslation {
  title: string;
  description: string;
  location_name: string;
  source_event: string;
}

// 完整翻译结果
export type Translations = {
  [K in TargetLanguage]?: LanguageTranslation;
};

// 语言名称映射
const LANGUAGE_NAMES: Record<TargetLanguage, string> = {
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  es: 'Spanish',
  ru: 'Russian',
  pt: 'Portuguese',
};

// 翻译使用的模型
const TRANSLATE_MODEL = 'gpt-5-mini';

/**
 * 翻译内容到所有目标语言
 */
export async function translateContent(
  apiKey: string,
  baseUrl: string,
  content: {
    title: string;
    description: string;
    location_name: string;
    source_event: string;
  }
): Promise<Translations> {
  const openai = new OpenAI({
    apiKey,
    baseURL: baseUrl || 'https://api.openai.com/v1',
  });

  const translations: Translations = {};

  // 并行翻译所有语言
  const results = await Promise.allSettled(
    TARGET_LANGUAGES.map(async (lang) => {
      const translation = await translateToLanguage(openai, content, lang);
      return { lang, translation };
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      translations[result.value.lang] = result.value.translation;
    } else {
      console.error(`Translation failed for ${result.reason}`);
    }
  }

  return translations;
}

/**
 * 翻译到单个目标语言
 */
async function translateToLanguage(
  openai: OpenAI,
  content: {
    title: string;
    description: string;
    location_name: string;
    source_event: string;
  },
  targetLang: TargetLanguage
): Promise<LanguageTranslation> {
  const langName = LANGUAGE_NAMES[targetLang];

  const prompt = `You are a professional translator. Translate the following Chinese content to ${langName}.

Keep the same tone and style - the description is playful and humorous, like chatting with a friend.

Input (Chinese):
{
  "title": "${content.title}",
  "description": "${content.description}",
  "location_name": "${content.location_name}",
  "source_event": "${content.source_event}"
}

Output ONLY a valid JSON object with the translated content:
{
  "title": "...",
  "description": "...",
  "location_name": "...",
  "source_event": "..."
}`;

  const response = await openai.chat.completions.create({
    model: TRANSLATE_MODEL,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const resultText = response.choices[0]?.message?.content;
  if (!resultText) {
    throw new Error(`No response from model for ${targetLang}`);
  }

  return JSON.parse(resultText) as LanguageTranslation;
}
