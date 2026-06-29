const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

class LLMHelper {
  constructor(settings = {}) {
    this.apiFormat = settings.api_format || 'openai';
    this.model = settings.model || (this.apiFormat === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o-mini');
    this.categorizeMaxTokens = settings.categorize_max_tokens || 2048;
    this.analyzeMaxTokens = settings.analyze_max_tokens || 10000;

    if (this.apiFormat === 'anthropic') {
      const baseURL = (settings.base_url || 'https://api.anthropic.com').replace(/\/+$/, '');
      this.anthropic = new Anthropic({
        apiKey: settings.api_key || '',
        baseURL,
      });
    } else {
      const baseURL = (settings.base_url || 'https://api.openai.com/v1').replace(/\/+$/, '');
      this.openai = new OpenAI({
        apiKey: settings.api_key || '',
        baseURL,
      });
    }
  }

  async categorize(text) {
    const systemPrompt = `你是一个工作分类助手。请根据用户的工作任务描述，判断其所属的工作类别。
只返回一个类别名称，不要返回其他内容。
常见的工作类别包括：开发、设计、测试、文档、会议、沟通、运维、学习、管理、其他。
如果没有明确的类别，返回"其他"。`;
    const userPrompt = `请判断以下工作任务的类别：${text}`;

    console.log('[LLM] Request:', JSON.stringify({ format: this.apiFormat, model: this.model, text }, null, 2));

    try {
      let result;
      if (this.apiFormat === 'anthropic') {
        const response = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: this.categorizeMaxTokens,
          temperature: 0.1,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });
        result = response.content[0]?.text?.trim() || '其他';
        console.log('[LLM] Response:', JSON.stringify(response.content?.[0], null, 2));
      } else {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: this.categorizeMaxTokens,
          temperature: 0.1,
        });
        result = response.choices[0]?.message?.content?.trim() || '其他';
        console.log('[LLM] Response:', JSON.stringify(response.choices?.[0], null, 2));
      }
      return result;
    } catch (error) {
      console.error('[LLM] Error:', error.status, error.message);
      if (error.error) console.error('[LLM] Error detail:', JSON.stringify(error.error));
      return '其他';
    }
  }

  async analyzeWork(data) {
    const systemPrompt = '你是一个专业的工作效率分析顾问。';
    const userPrompt = `你是一个工作效率分析助手。请根据以下工作数据，给出针对性的工作分析。

工作周期：${data.period}
总归档任务数：${data.totalItems}
待办任务数：${data.completionStats?.active || 0}
已完成未归档：${data.completionStats?.completed || 0}
已归档：${data.completionStats?.archived || 0}
分类分布：${JSON.stringify(data.categoryDistribution, null, 2)}
每日分布：${JSON.stringify(data.dailyDistribution, null, 2)}

请用中文回答，格式要求：
1. 分析工作重点和时间分配（哪些类别投入最多，是否合理）
2. 分析工作节奏（哪天最忙，是否有规律）
3. 给出 1-3 条优化建议（如是否需要加大学习投入、减少会议时间等）
总共不超过500字。`;

    try {
      let result;
      if (this.apiFormat === 'anthropic') {
        const response = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: this.analyzeMaxTokens,
          temperature: 0.7,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        });
        result = response.content[0]?.text?.trim() || '暂无分析';
      } else {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: this.analyzeMaxTokens,
          temperature: 0.7,
        });
        result = response.choices[0]?.message?.content?.trim() || '暂无分析';
      }
      return result;
    } catch (error) {
      console.error('LLM analysis error:', error.message);
      return `分析生成失败：${error.message}`;
    }
  }
}

module.exports = LLMHelper;
