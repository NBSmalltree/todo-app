# TodoFloat — 桌面待办清单

[![GitHub Release](https://img.shields.io/github/v/release/NBSmalltree/todo-app?style=flat-square&logo=github)](https://github.com/NBSmalltree/todo-app/releases)
[![Build Status](https://img.shields.io/github/actions/workflow/status/NBSmalltree/todo-app/.github/workflows/build.yml?style=flat-square&logo=githubactions)](https://github.com/NBSmalltree/todo-app/actions)
[![License](https://img.shields.io/github/license/NBSmalltree/todo-app?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue?style=flat-square)](https://github.com/NBSmalltree/todo-app/releases)

> 一款轻量级桌面待办清单应用，**始终悬浮在所有窗口之上**。支持任务管理、AI 智能分类、工作分析与番茄钟专注，帮你高效管理每一天。

---

## 📋 目录

- [功能特性](#-功能特性)
- [界面预览](#-界面预览)
- [快速开始](#-快速开始)
- [下载安装](#-下载安装)
- [使用指南](#-使用指南)
  - [待办清单](#待办清单)
  - [历史归档](#历史归档)
  - [工作分析](#工作分析)
  - [设置](#设置)
- [技术栈](#-技术栈)
- [开发指南](#-开发指南)
  - [项目结构](#项目结构)
  - [开发命令](#开发命令)
  - [发布流程](#发布流程)
- [数据与配置](#-数据与配置)
- [常见问题](#-常见问题)
- [贡献指南](#-贡献指南)
- [许可证](#-许可证)

---

## ✨ 功能特性

### 📋 任务管理
- **悬浮窗口** — 始终置顶，支持四角拖拽调整大小，滚轮缩放（0.3×~2.5×）
- **快速添加** — 输入框 + 回车即添加；全局快捷键 `Cmd/Ctrl + Shift + Space` 快速添加
- **内联编辑** — 双击任务文本直接编辑，双击备注区域添加备注
- **子任务** — 支持多级子任务，实时显示完成进度条
- **颜色标签** — 点击任务左侧圆点循环切换红/橙/黄/绿/无，快速标记优先级
- **截止日期** — 精确到分钟的日期选择器，过期红色提醒、当天黄色提醒
- **未来安排** — 设定未来日期，到期前自动隐藏，到期后自动显示
- **拖拽排序** — 拖拽调整任务顺序，持久化保存

### 🎯 番茄钟专注
- 内置番茄钟计时器，专注时长、短休息 / 长休息时长均可配置
- 可关联到具体任务，运行时标题栏显示倒计时
- 圆形进度动画，支持暂停 / 继续 / 停止
- 专注结束后自动切换休息，系统通知提醒
- 所有窗口状态同步

### 📊 归档与分析
- **历史归档** — 已完成任务一键归档，自动触发 AI 分类
- **智能筛选** — 支持关键词、类别、时间范围多维度筛选
- **CSV 导出** — 可选待办 / 归档 / 全部，筛选条件同步生效，包含截止日期
- **批量操作** — 批量选择、批量删除、批量归档 / 恢复
- **工作分析** — 按周 / 月 / 年查看统计概览、类别饼图、每日柱状图
- **番茄钟统计** — 专注总时长、每日分布、最近记录一览
- **AI 智能分析** — 大模型生成 Markdown 格式工作建议，带缓存避免重复请求

### 🎨 外观设置
- **主题模式** — 浅色 / 深色 / 护眼三种主题，点击即切换
- **透明度调节** — 滑块调节 20%~100%，仅影响浮动窗口
- **独立设置窗口** — 系统托盘打开或 `Cmd/Ctrl + ,` 快捷键，不再嵌套

### ⚡ 效率工具
- **快速筛选栏** — 「全部 / 今天 / 过期 / 无截止日期」一键切换
- **搜索增强** — `Cmd/Ctrl + F` 切换搜索面板，支持关键词 + 分类 + 日期状态筛选
- **已完成折叠** — 已完成任务默认折叠为「已完成 N 项」，保持列表清爽
- **删除撤销** — 删除 / 归档操作后底部出现撤销按钮，5 秒内可恢复
- **窗口记忆** — 退出自动保存窗口位置、大小和缩放比例
- **快捷键自定义** — 支持录制自定义全局快捷键，覆盖默认值

### 🔗 系统集成
- **系统托盘** — 右键菜单直达待办清单、历史归档、设置
- **全局快捷键** — `Cmd/Ctrl + Shift + T` 显示 / 隐藏、`Cmd/Ctrl + Shift + Space` 快速添加（均支持自定义）
- **定时提醒** — 可配置提前时间（0~1440 分钟），系统通知提醒即将到期的任务，自动去重
- **跨平台** — 支持 macOS（Intel + Apple Silicon）和 Windows
- **CI/CD** — GitHub Actions 自动构建 macOS (.dmg) 和 Windows (.exe)

### 🤖 AI 集成
- 支持 OpenAI API 兼容协议 + Anthropic 协议
- 内置预设：OpenAI / DeepSeek / 智谱 / 通义千问 / Claude 等
- AI 配置页内置「测试连接」按钮，无需保存即可验证
- 归档时自动分类，工作分析按周 / 月 / 年生成差异化建议

---

## 🖼️ 界面预览

| 界面 | 说明 |
|------|------|
| ![待办清单](screenshots/todo.png) | 主窗口：任务列表、快速筛选、搜索、番茄钟 |
| ![归档视图](screenshots/archive.png) | 归档记录：筛选、批量操作、CSV 导出 |
| ![工作分析](screenshots/analysis.png) | 统计图表：概览、饼图、柱状图、AI 建议 |
| ![设置](screenshots/settings.png) | 系统设置：外观、AI、快捷键、番茄钟、数据管理 |

---

## 🚀 快速开始

### 环境要求
- **Node.js** 18+
- **npm**
- C++ 编译工具（编译 `better-sqlite3` 原生模块）
  - **macOS**：`xcode-select --install`
  - **Windows**：Visual Studio Build Tools

### 安装与运行

```bash
git clone https://github.com/NBSmalltree/todo-app.git
cd todo-app
npm install
npm run dev
```

`npm install` 会自动编译 `better-sqlite3` 原生模块。`npm run dev` 同时启动 Vite 开发服务器和 Electron，支持热重载。

### 构建安装包

```bash
npm run build    # 构建当前平台安装包
```

构建产物输出到 `dist-electron/` 目录。

---

## 📦 下载安装

### 当前版本：v1.4.1

> [查看所有版本](https://github.com/NBSmalltree/todo-app/releases)

| 平台 | 架构 | 下载文件 |
|------|------|----------|
| macOS | Apple Silicon | `TodoFloat-1.4.1-arm64.dmg` |
| macOS | Intel | `TodoFloat-1.4.1-x64.dmg` |
| Windows | x64 | `TodoFloat-1.4.1.exe` |

### 发布新版本

```bash
npm run release            # 使用 package.json 当前版本
npm run release -- 1.2.3   # 指定新版本号
```

自动执行：更新版本号 → 提交 → 推送 → 打 tag → 触发 GitHub Actions 构建。

---

## 📖 使用指南

### 待办清单

| 操作 | 方式 |
|------|------|
| 添加任务 | 输入框输入内容，按回车或点击「添加」 |
| 完成任务 | 点击任务左侧圆圈（带脉冲动画） |
| 标记优先级 | 点击颜色圆点，循环切换红 / 橙 / 黄 / 绿 / 无 |
| 编辑内容 | 双击任务文本，进入内联编辑模式 |
| 添加子任务 | 鼠标悬停任务，点击右侧「+」按钮展开子任务面板 |
| 设置截止日期 | 点击任务右侧日历图标，选择日期和时间 |
| 设置未来日期 | 选择未来日期，任务在到期前自动隐藏 |
| 添加备注 | 双击截止日期 / 备注区域 |
| 番茄钟专注 | 点击番茄钟图标，启动专注计时 |
| 拖拽排序 | 按住拖拽手柄，拖动到目标位置 |
| 批量操作 | 点击标题栏「选择」按钮，进入批量选择模式 |
| 搜索筛选 | `Cmd/Ctrl + F` 切换搜索面板；标题栏下方快速筛选按钮 |
| 窗口缩放 | `Cmd/Ctrl + 滚轮` 缩放；拖动四角调整比例 |
| 退出搜索 / 选中等 | 点击其他区域或按 `Esc` |

> 右键已完成任务可选择「归档」（未完成任务不允许归档）；操作后底部出现撤销按钮可恢复。已完成任务默认折叠，点击「已完成 N 项」展开。

### 历史归档

- 点击系统托盘 →「历史归档」，或点击标题栏归档按钮
- **筛选**：关键词搜索 + 类别下拉 + 时间范围
- **批量操作**：点击「选择」按钮，支持批量恢复、批量删除
- **操作**：AI 分类、恢复待办、删除
- **导出 CSV**：可选归档 / 待办 / 全部，筛选条件同步，含截止日期字段

### 工作分析

- 切换 **周 / 月 / 年** 维度查看统计
- **概览卡片**：待办任务数、归档任务数、工作类别数、完成率
- **图表**：类别分布饼图、每日任务柱状图
- **番茄钟统计**：专注总时长、每日专注分布折线图、最近专注记录列表
- **AI 分析**：大模型按周期生成差异化 Markdown 格式工作建议，支持选中复制，带缓存

### 设置

- 点击系统托盘 →「设置」，或按 `Cmd/Ctrl + ,` 快捷键
- **外观**：主题切换（浅色 / 深色 / 护眼）、透明度调节
- **AI 配置**：API Key、Base URL、模型名称，「测试连接」一键验证
- **快捷键**：录制自定义全局快捷键，点击输入框后按新键组合即可录入
- **定时提醒**：启用 / 禁用，设置提前时间（0~1440 分钟），支持测试通知
- **番茄钟**：专注时长、短休息、长休息（默认 25 / 5 / 15 分钟），长休息循环间隔
- **数据管理**：备份到指定位置 / 从备份恢复（会覆盖当前数据）

---

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 18 |
| 桌面框架 | Electron 33 |
| 构建工具 | Vite 6 + electron-builder |
| 样式方案 | Tailwind CSS 3 + PostCSS |
| 数据库 | SQLite（better-sqlite3），含版本化迁移系统 |
| AI 集成 | OpenAI SDK + Anthropic SDK |
| 图表 | Recharts |
| Markdown | react-markdown |
| CI/CD | GitHub Actions（macOS arm64/x64 + Windows 并行构建） |

---

## 🔧 开发指南

### 项目结构

```
todo-app/
├── src/
│   ├── main/                  # Electron 主进程
│   │   ├── main.js            # 窗口管理、IPC、托盘、快捷键、提醒、番茄钟
│   │   ├── database.js        # SQLite 数据库（CRUD、设置、迁移、备份恢复）
│   │   ├── llm.js             # LLM 集成（分类、工作分析）
│   │   └── preload.js         # 预加载脚本（IPC 桥接）
│   └── renderer/              # React 前端
│       ├── App.jsx            # 路由（/ 待办 /tray 归档 /settings 设置 /quickadd 快速添加）
│       ├── components/
│       │   ├── TodoWindow.jsx        # 悬浮待办窗口
│       │   ├── TrayView.jsx          # 归档视图
│       │   ├── ArchiveViewer.jsx     # 归档列表（筛选、导出、批量操作）
│       │   ├── WorkAnalysis.jsx      # 工作分析（图表、AI 建议、番茄钟统计）
│       │   ├── Settings.jsx          # 设置页面
│       │   ├── PomodoroPanel.jsx     # 番茄钟面板
│       │   ├── QuickAdd.jsx           # 快速添加窗口
│       │   └── DueDatePicker.jsx     # 日期时间选择器
│       └── styles/
│           └── index.css             # 全局样式、主题变量、动画
├── assets/
│   ├── icon.png                # 应用图标
│   └── tray-icon.png           # 系统托盘图标
├── scripts/
│   └── release.sh              # 发布脚本
├── .github/workflows/
│   └── build.yml               # CI/CD 构建流水线
└── package.json
```

### 开发命令

```bash
npm run dev              # 启动开发模式（Vite + Electron，热重载）
npm run build            # 构建当前平台安装包
npm run build:renderer   # 只构建前端
npm run release          # 发布（使用当前版本号）
npm run release -- x.x.x # 发布（指定新版本号）
```

### 发布流程

```bash
npm run release              # 自动更新版本 → 提交 → 打 tag → 推送 → 触发 CI
npm run release -- 1.1.0     # 指定版本号
```

构建完成后在 [GitHub Releases](https://github.com/NBSmalltree/todo-app/releases) 下载安装包。

---

## ⚙️ 数据与配置

### 存储位置

| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/todo-float/` |
| Windows | `%APPDATA%/todo-float/` |

数据库中存储所有设置（主题、透明度、AI 配置、快捷键、提醒、番茄钟等）和任务数据。

### 备份与恢复

> 建议定期备份数据目录下的 `.db` 文件。

- **备份**：设置页 →「备份数据」，选择保存位置
- **恢复**：设置页 →「恢复数据」，选择备份文件（操作前会确认，会覆盖当前数据）

---

## ❓ 常见问题

### 1. 依赖安装失败

```bash
rm -rf node_modules package-lock.json
npm install
```

### 2. 窗口关闭后打不开

窗口关闭后应用仍在系统托盘运行。右键点击系统托盘图标（Windows 可能在「^」展开区域），选择「待办清单」重新打开。如仍无法打开，删除数据库文件后重启。

### 3. macOS 提示"来自身份不明的开发者"

应用未经过 Apple 公证，属于正常现象。有两种解决方法：

**方法一**：在 Finder 中找到 `TodoFloat.app`，按住 `Control` 键点击，选择「打开」，然后点击「打开」。

**方法二**：打开「系统设置」→「隐私与安全性」，滚动到底部，点击「仍要打开」。

### 4. AI 分类 / 分析不工作

- 检查 API Key 是否正确
- 确认 Base URL 可访问（如 `https://api.deepseek.com/v1`）
- 点击「测试连接」按钮验证配置
- 查看终端日志中的 `[LLM]` 输出

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

- **报告 Bug**：请描述复现步骤、预期行为和实际行为
- **功能建议**：请说明使用场景和期望效果
- **Pull Request**：请确保代码风格一致，提交前测试可用

---

## 📄 许可证

[MIT License](LICENSE)
