use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

pub struct LLMHelper {
    api_format: String,
    model: String,
    api_key: String,
    base_url: String,
    categorize_max_tokens: u32,
    analyze_max_tokens: u32,
    client: Client,
}

#[derive(Serialize)]
struct OpenAIChatRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    max_tokens: u32,
    temperature: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_format: Option<Value>,
}

#[derive(Serialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    max_tokens: u32,
    temperature: f64,
    system: String,
    messages: Vec<AnthropicMessage>,
}

#[derive(Serialize)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Deserialize)]
struct OpenAIChoice {
    message: OpenAIResponseMessage,
}

#[derive(Deserialize)]
struct OpenAIResponseMessage {
    content: String,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[derive(Deserialize)]
struct AnthropicContent {
    text: String,
    #[serde(rename = "type")]
    content_type: String,
}

impl LLMHelper {
    pub fn new(settings: &Value) -> Self {
        let api_format = settings["api_format"].as_str().unwrap_or("openai").to_string();
        let default_model = if api_format == "anthropic" {
            "claude-sonnet-4-20250514"
        } else {
            "gpt-4o-mini"
        };
        let model = settings["model"].as_str().unwrap_or(default_model).to_string();
        let api_key = settings["api_key"].as_str().unwrap_or("").to_string();
        let default_base = if api_format == "anthropic" {
            "https://api.anthropic.com"
        } else {
            "https://api.openai.com/v1"
        };
        let base_url = settings["base_url"].as_str().unwrap_or(default_base).to_string();
        let categorize_max_tokens = settings["categorize_max_tokens"].as_u64().unwrap_or(2048) as u32;
        let analyze_max_tokens = settings["analyze_max_tokens"].as_u64().unwrap_or(10000) as u32;

        LLMHelper {
            api_format, model, api_key, base_url,
            categorize_max_tokens, analyze_max_tokens,
            client: Client::new(),
        }
    }

    // Helper: send OpenAI-format request
    async fn send_openai_request(&self, system: &str, user: &str, max_tokens: u32, temperature: f64) -> Result<String, String> {
        let req = OpenAIChatRequest {
            model: self.model.clone(),
            messages: vec![
                OpenAIMessage { role: "system".to_string(), content: system.to_string() },
                OpenAIMessage { role: "user".to_string(), content: user.to_string() },
            ],
            max_tokens,
            temperature,
            response_format: None,
        };

        let resp = self.client
            .post(format!("{}/chat/completions", self.base_url.trim_end_matches('/')))
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&req)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("HTTP {} - {}", status, body));
        }

        let body: OpenAIResponse = resp.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        Ok(body.choices.first()
            .map(|c| c.message.content.trim().to_string())
            .unwrap_or_default())
    }

    // Helper: send Anthropic-format request
    async fn send_anthropic_request(&self, system: &str, user: &str, max_tokens: u32, temperature: f64) -> Result<String, String> {
        let req = AnthropicRequest {
            model: self.model.clone(),
            max_tokens,
            temperature,
            system: system.to_string(),
            messages: vec![AnthropicMessage {
                role: "user".to_string(),
                content: user.to_string(),
            }],
        };

        let resp = self.client
            .post(format!("{}/v1/messages", self.base_url.trim_end_matches('/')))
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&req)
            .send()
            .await
            .map_err(|e| format!("HTTP error: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("HTTP {} - {}", status, body));
        }

        let body: AnthropicResponse = resp.json().await
            .map_err(|e| format!("Parse error: {}", e))?;

        Ok(body.content.iter()
            .find(|c| c.content_type == "text")
            .map(|c| c.text.trim().to_string())
            .unwrap_or_default())
    }

    // Helper: dispatch to correct format
    async fn send_request(&self, system: &str, user: &str, max_tokens: u32, temperature: f64) -> Result<String, String> {
        if self.api_format == "anthropic" {
            self.send_anthropic_request(system, user, max_tokens, temperature).await
        } else {
            self.send_openai_request(system, user, max_tokens, temperature).await
        }
    }

    pub async fn categorize(&self, text: &str) -> Result<String, String> {
        let system_prompt = "你是一个工作分类助手。请根据用户的工作任务描述，判断其所属的工作类别。\n只返回一个类别名称，不要返回其他内容。\n常见的工作类别包括：开发、设计、测试、文档、会议、沟通、运维、学习、管理、其他。\n如果没有明确的类别，返回\"其他\"。";
        let user_prompt = format!("请判断以下工作任务的类别：{}", text);

        self.send_request(system_prompt, &user_prompt, self.categorize_max_tokens, 0.1)
            .await
            .map(|s| if s.is_empty() { "其他".to_string() } else { s })
            .or_else(|_| Ok("其他".to_string()))
    }

    pub async fn analyze_work(&self, data: &Value) -> Result<String, String> {
        let items = data["items"].as_array().cloned().unwrap_or_default();
        let period = data["period"].as_str().unwrap_or("week");
        let total_items = data["total_items"].as_i64().unwrap_or(0);
        let active = data["completion_stats"]["active"].as_i64().unwrap_or(0);
        let completed = data["completion_stats"]["completed"].as_i64().unwrap_or(0);
        let _archived = data["completion_stats"]["archived"].as_i64().unwrap_or(0);

        // Compute tasks with deadline and on-time rate
        let tasks_with_deadline: Vec<&Value> = items.iter()
            .filter(|i| i.get("due_date").and_then(|v| v.as_str()).map_or(false, |s| !s.is_empty()))
            .collect();
        let on_time = tasks_with_deadline.iter()
            .filter(|i| {
                let cd = i.get("completed_at").and_then(|v| v.as_str()).unwrap_or("");
                let dd = i.get("due_date").and_then(|v| v.as_str()).unwrap_or("");
                !cd.is_empty() && cd <= dd
            })
            .count();
        let deadline_rate = if !tasks_with_deadline.is_empty() {
            format!("{}%", (on_time * 100 / tasks_with_deadline.len()))
        } else { "N/A".to_string() };

        // Compute average completion time (Issue #3)
        let completed_items: Vec<&Value> = items.iter()
            .filter(|i| i.get("completed_at").and_then(|v| v.as_str()).map_or(false, |s| !s.is_empty()))
            .collect();

        let mut total_days = 0.0f64;
        let mut category_days: HashMap<String, (f64, usize)> = HashMap::new();

        for item in &completed_items {
            if let (Some(created), Some(completed)) = (
                item.get("created_at").and_then(|v| v.as_str()),
                item.get("completed_at").and_then(|v| v.as_str()),
            ) {
                // Parse dates (format: "YYYY-MM-DD HH:MM:SS")
                if let (Ok(c), Ok(d)) = (
                    chrono::NaiveDateTime::parse_from_str(created, "%Y-%m-%d %H:%M:%S"),
                    chrono::NaiveDateTime::parse_from_str(completed, "%Y-%m-%d %H:%M:%S"),
                ) {
                    let days = (d - c).num_days() as f64;
                    if days >= 0.0 {
                        total_days += days;
                        let cat = item.get("category").and_then(|v| v.as_str()).unwrap_or("未分类").to_string();
                        let entry = category_days.entry(cat).or_insert((0.0, 0));
                        entry.0 += days;
                        entry.1 += 1;
                    }
                }
            }
        }

        let avg_days = if !completed_items.is_empty() {
            format!("{:.1}", total_days / completed_items.len() as f64)
        } else {
            "N/A".to_string()
        };

        let mut avg_days_by_cat: Vec<String> = category_days.iter()
            .map(|(cat, (sum, count))| format!("  {}: {:.1}天（{}项）", cat, sum / *count as f64, count))
            .collect();
        avg_days_by_cat.sort();

        let efficiency_str = if !avg_days_by_cat.is_empty() {
            format!("\n各类别平均完成耗时：\n{}", avg_days_by_cat.join("\n"))
        } else {
            String::new()
        };

        // Compute category distribution for prompt
        let cat_str = serde_json::to_string_pretty(&data["category_distribution"]).unwrap_or_default();
        let day_str = serde_json::to_string_pretty(&data["daily_distribution"]).unwrap_or_default();

        // Task samples
        let mut samples = Vec::new();
        if let Some(cats) = data["category_distribution"].as_object() {
            let mut sorted_cats: Vec<_> = cats.iter().collect();
            sorted_cats.sort_by(|a, b| b.1["count"].as_i64().unwrap_or(0).cmp(&a.1["count"].as_i64().unwrap_or(0)));
            for (cat, _) in sorted_cats.iter().take(3) {
                let cat_items: Vec<_> = items.iter()
                    .filter(|i| i.get("category").and_then(|v| v.as_str()).unwrap_or("未分类") == *cat)
                    .take(2).collect();
                for item in cat_items {
                    let text = item["text"].as_str().unwrap_or("");
                    let due = item["due_date"].as_str().unwrap_or("");
                    let done = if item["completed_at"].as_str().map_or(false, |s| !s.is_empty()) {
                        " ✓"
                    } else { " ○" };
                    let due_str = if !due.is_empty() {
                        format!(" (截止:{})", &due[..10.min(due.len())])
                    } else { String::new() };
                    samples.push(format!("  - [{}] {}{}{}", cat, text, due_str, done));
                }
            }
        }

        let period_label = match period {
            "week" => "本周", "month" => "本月", "year" => "本年", _ => "本周期",
        };

        let avg_days_context = if avg_days != "N/A" {
            format!("（平均完成耗时 {} 天）", avg_days)
        } else {
            String::new()
        };

        let analysis_framework = match period {
            "week" => format!(
                "使用 Markdown 格式，按以下结构输出：\n\n### 📊 本周概览\n总结本周工作总量、主要集中在哪些类别、日均完成任务数。\n\n### ⏱ 效率与节奏\n分析每天的工作量分布（哪天最忙/最轻松），各类别完成效率差异{}。\n\n### 🎯 截止日期\n分析截止日期遵守情况（按时完成率 {}）。\n\n### 💡 下周建议\n给出 2-3 条针对下周的改进建议，具体可执行。",
                avg_days_context, deadline_rate
            ),
            "month" => format!(
                "使用 Markdown 格式，按以下结构输出：\n\n### 📊 本月概览\n总结本月工作总量、各类别任务占比、相比前几周的趋势变化。\n\n### ⏱ 效率分析\n分析各类别的完成效率和耗时差异{}。\n\n### ⚖️ 工作平衡\n分析各项工作类别的占比是否合理，是否存在某类任务占用过多时间的问题。\n\n### 🎯 时间管理\n分析截止日期遵守情况（按时完成率 {}）。\n\n### 💡 优化建议\n给出 2-3 条下月的改进方向。",
                avg_days_context, deadline_rate
            ),
            _ => format!(
                "使用 Markdown 格式，按以下结构输出：\n\n### 📊 年度概览\n总结本年工作总量、主要工作领域、整体完成情况。\n\n### 📈 趋势分析\n分析各工作类别的占比变化趋势，识别哪些领域投入增加、哪些减少。\n\n### 🏆 亮点与不足\n基于数据指出本年度做得好的方面和需要改进的方面。\n\n### 💡 战略建议\n给出 2-3 条针对下一季度的战略性建议。",
            ),
        };

        let user_prompt = format!(
            "请根据以下工作数据，对{}的工作效率进行分析。\n\n## 基本数据\n- 周期：{}\n- {}归档任务数：{}\n- 当前待办：{} 项\n- 已完成(未归档)：{} 项\n- 截止日期任务：{} 项，按时完成率 {}\n- 平均完成耗时：{} 天{}\n\n## 分类分布\n{}\n\n## 每日分布\n{}\n\n## 任务样例\n{}\n\n{}\n\n总长度不超过 600 字。不要编造数据，基于以上数据做合理分析。",
            period_label, period, period_label, total_items,
            active, completed,
            tasks_with_deadline.len(), deadline_rate,
            avg_days, efficiency_str,
            cat_str, day_str,
            if samples.is_empty() { "（暂无）".to_string() } else { samples.join("\n") },
            analysis_framework,
        );

        let system_prompt = "你是一个专业的工作效率分析专家。你擅长从任务数据中挖掘洞察，给出有针对性的改进建议。\n\n分析原则：\n- 基于数据说话，不编造事实\n- 指出亮点也指出问题\n- 建议要具体可执行，而非笼统的\"提高效率\"\n- 输出使用 Markdown 格式，清晰易读";

        self.send_request(system_prompt, &user_prompt, self.analyze_max_tokens, 0.4)
            .await
            .map(|s| if s.is_empty() { "暂无分析".to_string() } else { s })
            .or_else(|e| Err(format!("分析生成失败：{}", e)))
    }

    pub async fn test(&self) -> Result<String, String> {
        let result = self.send_request("", "请回复\"OK\"", 10, 0.0).await
            .map_err(|e| format!("连接失败：{}", e))?;

        if result.is_empty() {
            Ok("连接成功（无可读响应）".to_string())
        } else {
            Ok(format!("连接成功！模型响应：{}", result))
        }
    }
}
