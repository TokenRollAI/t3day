/**
 * 测试 Gemini 模型是否可用
 * 运行: npx tsx scripts/test-gemini.ts
 */

import OpenAI from 'openai';

const OPENAI_API_KEY = 'sk-iyCBEqVWPz2sRNHBA18b284537E14f298fDf215406295d87';
const OPENAI_BASE_URL = 'https://aihubmix.com/v1';

async function testGemini() {
  console.log('测试 Gemini 模型...');
  console.log(`Base URL: ${OPENAI_BASE_URL}`);
  console.log(`Model: gemini-3-pro-preview`);
  console.log('');

  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    baseURL: OPENAI_BASE_URL,
  });

  try {
    console.log('发送请求...');
    const startTime = Date.now();

    const response = await openai.chat.completions.create({
      model: 'gemini-3-pro-preview',
      messages: [
        {
          role: 'system',
          content: '你是一个助手，请用 JSON 格式回复。',
        },
        {
          role: 'user',
          content: '请生成一个测试 JSON，包含 title 和 description 字段。',
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const elapsed = Date.now() - startTime;

    console.log(`\n✅ 成功！耗时: ${elapsed}ms`);
    console.log('\n响应内容:');
    console.log(response.choices[0]?.message?.content);
    console.log('\n模型信息:');
    console.log(`- model: ${response.model}`);
    console.log(`- usage: ${JSON.stringify(response.usage)}`);
  } catch (error: any) {
    console.error('\n❌ 失败！');
    console.error(`错误: ${error.message}`);
    if (error.response) {
      console.error(`状态码: ${error.response.status}`);
      console.error(`响应: ${JSON.stringify(error.response.data)}`);
    }
    process.exit(1);
  }
}

testGemini();
