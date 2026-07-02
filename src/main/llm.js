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
    // Compute additional stats from raw items
    const items = data.items || [];
    const completedItems = items.filter((i) => i.completed_at);

    // Completion efficiency: days from created to completed
    let totalDays = 0;
    const categoryDays = {};
    completedItems.forEach((i) => {
      const created = new Date(i.created_at);
      const completed = new Date(i.completed_at);
      const days = (completed - created) / (1000 * 60 * 60 * 24);
      if (days >= 0) {
        totalDays += days;
        const cat = i.category || '未分类';
        if (!categoryDays[cat]) categoryDays[cat] = { sum: 0, count: 0 };
        categoryDays[cat].sum += days;
        categoryDays[cat].count += 1;
      }
    });
    const avgDays = completedItems.length > 0 ? (totalDays / completedItems.length).toFixed(1) : 'N/A';
    const avgDaysByCat = Object.entries(categoryDays).map(([cat, d]) => ({
      cat,
      avg: (d.sum / d.count).toFixed(1),
      count: d.count,
    }));

    // Deadline adherence
    const tasksWithDeadline = items.filter((i) => i.due_date);
    const onTimeCount = tasksWithDeadline.filter((i) => i.completed_at && i.completed_at <= i.due_date).length;
    const deadlineRate = tasksWithDeadline.length > 0
      ? Math.round((onTimeCount / tasksWithDeadline.length) * 100) : null;

    // Task samples: pick 2-3 most recent items from top categories
    const topCats = Object.entries(data.categoryDistribution || {})
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 3);
    const samples = [];
    topCats.forEach(([cat]) => {
      const catItems = items.filter((i) => (i.category || '未分类') === cat).slice(0, 2);
      catItems.forEach((i) => {
        samples.push(`  - [${cat}] ${i.text}${i.due_date ? ' (截止:' + i.due_date.slice(0, 10) + ')' : ''}${i.completed_at ? ' ✓' : ' ○'}`);
      });
    });

    // Build efficiency detail string
    let efficiencyStr = '';
    if (avgDaysByCat.length > 0) {
      efficiencyStr = '\n各类别平均完成耗时：\n' + avgDaysByCat.map((d) => `  ${d.cat}: ${d.avg}天（${d.count}项）`).join('\n');
    }

    const periodLabel = { week: '本周', month: '本月', year: '本年' }[data.period] || data.period;

    // Period-specific analysis framework
    let analysisFramework = '';
    if (data.period === 'week') {
      analysisFramework = `使用 Markdown 格式，按以下结构输出：

### 📊 本周概览
总结本周工作总量、主要集中在哪些类别、日均完成任务数。

### ⏱ 效率与节奏
分析每天的工作量分布（哪天最忙/最轻松），各类别完成效率差异。${avgDays !== 'N/A' ? '评估本周完成速度是否合理。' : ''}

### 🎯 截止日期
${deadlineRate !== null ? '分析截止日期遵守情况。' : '（本周期无截止日期任务）'}

### 💡 下周建议
给出 2-3 条针对下周的改进建议，具体可执行。`;

    } else if (data.period === 'month') {
      analysisFramework = `使用 Markdown 格式，按以下结构输出：

### 📊 本月概览
总结本月工作总量、各类别任务占比、相比前几周的趋势变化。

### ⏱ 效率分析
分析各类别的完成效率和耗时差异。${avgDays !== 'N/A' ? '评估哪些类别效率高、哪些拖沓。' : ''}

### ⚖️ 工作平衡
分析各项工作类别的占比是否合理，是否存在某类任务占用过多时间的问题。

### 🎯 时间管理
${deadlineRate !== null ? '分析截止日期遵守情况，识别时间管理薄弱环节。' : ''}

### 💡 优化建议
给出 2-3 条下月的改进方向。`;

    } else {
      analysisFramework = `使用 Markdown 格式，按以下结构输出：

### 📊 年度概览
总结本年工作总量、主要工作领域、整体完成情况。

### 📈 趋势分析
分析各工作类别的占比变化趋势，识别哪些领域投入增加、哪些减少。

### 🏆 亮点与不足
基于数据指出本年度做得好的方面和需要改进的方面。${deadlineRate !== null ? '包含截止日期遵守率的评估。' : ''}

### 💡 战略建议
给出 2-3 条针对下一季度的战略性建议。`;
    }

    const userPrompt = `请根据以下工作数据，对${periodLabel}的工作效率进行分析。

## 基本数据
- 周期：${data.period}
- ${periodLabel}归档任务数：${data.totalItems}
- 当前待办：${data.completionStats?.active || 0} 项
- 已完成(未归档)：${data.completionStats?.completed || 0} 项
- 截止日期任务：${tasksWithDeadline.length} 项${deadlineRate !== null ? '（按时完成率 ' + deadlineRate + '%）' : ''}

## 分类分布
${JSON.stringify(data.categoryDistribution, null, 2)}

## 每日分布
${JSON.stringify(data.dailyDistribution, null, 2)}

## 完成效率
- 平均完成耗时：${avgDays} 天${efficiencyStr}

## 任务样例
${samples.length > 0 ? samples.join('\n') : '（暂无）'}

${analysisFramework}

总长度不超过 600 字。不要编造数据，基于以上数据做合理分析。`;

    const systemPrompt = `你是一个专业的工作效率分析专家。你擅长从任务数据中挖掘洞察，给出有针对性的改进建议。

分析原则：
- 基于数据说话，不编造事实
- 指出亮点也指出问题
- 建议要具体可执行，而非笼统的"提高效率"
- 输出使用 Markdown 格式，清晰易读`;

    try {
      let result;
      if (this.apiFormat === 'anthropic') {
        const response = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: this.analyzeMaxTokens,
          temperature: 0.4,
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
          temperature: 0.4,
        });
        result = response.choices[0]?.message?.content?.trim() || '暂无分析';
      }
      return result;
    } catch (error) {
      console.error('LLM analysis error:', error.message);
      return `分析生成失败：${error.message}`;
    }
  }

  async test() {
    try {
      if (this.apiFormat === 'anthropic') {
        const response = await this.anthropic.messages.create({
          model: this.model,
          max_tokens: 10,
          messages: [{ role: 'user', content: '请回复"OK"' }],
        });
        const text = response.content[0]?.text || '';
        return { success: true, message: `连接成功！模型响应：${text.slice(0, 50)}` };
      } else {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [{ role: 'user', content: '请回复"OK"' }],
          max_tokens: 10,
        });
        const text = response.choices[0]?.message?.content || '';
        return { success: true, message: `连接成功！模型响应：${text.slice(0, 50)}` };
      }
    } catch (error) {
      let errorMsg = error.message;
      if (error.status) errorMsg = `HTTP ${error.status} - ${errorMsg}`;
      if (error.error?.message) errorMsg = error.error.message;
      return { success: false, error: errorMsg };
    }
  }
}

module.exports = LLMHelper;
