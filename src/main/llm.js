const OpenAI = require('openai');

class LLMHelper {
  constructor(settings = {}) {
    const baseURL = (settings.base_url || 'https://api.openai.com/v1').replace(/\/+$/, '');
    this.client = new OpenAI({
      apiKey: settings.api_key || '',
      baseURL,
    });
    this.model = settings.model || 'gpt-4o-mini';
  }

  async categorize(text) {
    const messages = [
      {
        role: 'system',
        content: `你是一个工作分类助手。请根据用户的工作任务描述，判断其所属的工作类别。
只返回一个类别名称，不要返回其他内容。
常见的工作类别包括：开发、设计、测试、文档、会议、沟通、运维、学习、管理、其他。
如果没有明确的类别，返回"其他"。`,
      },
      {
        role: 'user',
        content: `请判断以下工作任务的类别：${text}`,
      },
    ];

    console.log('[LLM] Request:', JSON.stringify({ baseURL: this.client.baseURL, model: this.model, text }, null, 2));

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: 10000,
        temperature: 0.1,
      });

      const result = response.choices[0]?.message?.content?.trim() || '其他';
      console.log('[LLM] Response:', JSON.stringify(response.choices?.[0], null, 2));
      return result;
    } catch (error) {
      console.error('[LLM] Error:', error.status, error.message);
      if (error.error) console.error('[LLM] Error detail:', JSON.stringify(error.error));
      return '其他';
    }
  }

  async analyzeWork(data) {
    try {
      const prompt = `你是一个工作效率分析助手。请根据以下工作数据，给出简洁的分析和建议。

工作周期：${data.period}
总任务数：${data.totalItems}
分类分布：${JSON.stringify(data.categoryDistribution, null, 2)}
每日分布：${JSON.stringify(data.dailyDistribution, null, 2)}
完成统计：${JSON.stringify(data.completionStats, null, 2)}

请用中文回答，格式要求：
1. 先总结工作重点（哪些类别投入最多）
2. 分析工作节奏（哪天最忙等）
3. 给出1-3条具体建议
简洁明了，总共不超过300字。`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: '你是一个专业的工作效率分析顾问。' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content?.trim() || '暂无分析';
    } catch (error) {
      console.error('LLM analysis error:', error.message);
      return `分析生成失败：${error.message}`;
    }
  }
}

module.exports = LLMHelper;
