# TodoFloat - 桌面待办清单

一款轻量级的桌面待办清单应用，漂浮在所有窗口顶端，支持任务管理、历史归档和 AI 工作分析。

## ✨ 功能特性

### 核心功能
- **悬浮窗口**：始终置顶，可自由调整大小（支持四角拖动和滚轮缩放）
- **任务管理**：快速添加、完成、删除待办事项
- **完成状态**：左侧圆形按钮，点击后显示灰色+删除线
- **状态恢复**：已完成任务可一键恢复为待办状态
- **右键菜单**：支持标记完成、归档、删除操作
- **窗口记忆**：退出时保存窗口位置和大小，下次打开自动恢复

### 归档与分析
- **历史归档**：归档任务不在悬浮窗口显示，保存在归档窗口
- **智能筛选**：支持按时间范围、类别、关键词筛选
- **备注编辑**：双击归档记录可添加备注
- **AI 自动分类**：归档时自动调用大模型判断工作类别，也支持手动重新分类
- **工作分析**：按周/月/年查看工作内容分布、完成率和 AI 智能建议

### 外观设置
- **主题模式**：浅色模式 / 深色模式 / 护眼模式
- **窗口透明度**：可调节悬浮窗口透明度（20%~100%）
- **AI 模型配置**：支持自定义 API Key、Base URL 和模型名称

### 系统集成
- **系统托盘**：常驻状态栏，快速访问归档、设置和退出
- **跨平台**：支持 macOS 和 Windows
- **数据持久化**：SQLite 本地存储，数据安全可靠
- **CI/CD**：GitHub Actions 自动构建 macOS (.dmg) 和 Windows (.exe) 安装包

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/NBSmalltree/todo-app.git
cd todo-app

# 2. 安装依赖
npm install

# 3. 启动开发模式
npm run dev
```

### 构建应用

```bash
# 构建当前平台的安装包
npm run build
```

构建完成后，应用将输出到 `dist-electron` 目录。

## 📦 发布新版本

使用一条命令完成提交、打标签、推送并触发 GitHub Actions 自动打包：

```bash
# 使用 package.json 中的版本号
npm run release

# 或指定新版本号
npm run release -- 1.1.0
```

该命令会自动执行：
1. 提交所有更改
2. 推送到远程仓库
3. 删除旧 tag 并创建新 tag
4. 推送 tag 触发 GitHub Actions 构建

构建完成后，在 [GitHub Releases](https://github.com/NBSmalltree/todo-app/releases) 页面下载安装包。

## 📖 使用指南

### 添加待办
1. 在悬浮窗口顶部输入框输入任务内容
2. 按回车键或点击"添加"按钮

### 完成任务
- 点击任务左侧的圆形按钮，标记为已完成
- 已完成任务显示灰色+删除线
- 再次点击可恢复为待办状态

### 归档任务
1. 右键点击任务
2. 选择"归档"选项
3. 任务将从悬浮窗口移除，保存到归档记录
4. 归档时自动触发 AI 分类（需配置 API Key）

### 查看归档
1. 点击系统托盘图标，选择"历史归档"
2. 或点击悬浮窗口标题栏的归档按钮
3. 在归档列表查看、筛选、编辑备注
4. 支持 AI 分类、恢复待办、删除操作

### AI 工作分析
1. 在归档窗口切换到"工作分析"标签页
2. 选择查看周期：本周/本月/本年
3. 查看工作类别分布、每日任务统计和完成率
4. 底部 AI 分析给出针对性的工作建议

### 外观设置
1. 点击系统托盘图标，选择"设置"
2. 切换主题：浅色/深色/护眼模式
3. 调节待办清单窗口透明度
4. 配置 AI 模型参数

### 窗口缩放
- **快捷键**：Ctrl/Cmd + 滚轮上下滚动
- **鼠标拖动**：拖动窗口四角调整大小

## ⚙️ 配置说明

### AI 模型配置
在设置页面配置以下参数：

- **API Key**：大模型服务的 API 密钥
- **Base URL**：API 服务地址（默认：https://api.openai.com/v1）
- **模型名称**：使用的模型（如：gpt-4o-mini、mimo-v2.5-pro）

支持所有 OpenAI 兼容的 API 服务：
- OpenAI (GPT-4o, GPT-4, GPT-4o-mini)
- DeepSeek
- 智谱 AI (GLM)
- 通义千问
- Claude (Anthropic)
- 其他兼容服务

### 数据存储
数据存储在用户数据目录：
- **macOS**: `~/Library/Application Support/todo-float/`
- **Windows**: `%APPDATA%/todo-float/`

## 🔧 开发说明

### 项目结构
```
todo-app/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── main.js        # 主进程入口
│   │   ├── database.js    # SQLite 数据库
│   │   ├── llm.js         # LLM 集成
│   │   └── preload.js     # 预加载脚本
│   └── renderer/          # React 前端
│       ├── index.html     # HTML 入口
│       ├── index.jsx      # React 入口
│       ├── App.jsx        # 根组件（路由）
│       ├── components/    # 组件
│       │   ├── TodoWindow.jsx      # 悬浮窗口
│       │   ├── TrayView.jsx        # 归档视图
│       │   ├── ArchiveViewer.jsx   # 归档列表
│       │   ├── WorkAnalysis.jsx    # 工作分析
│       │   └── Settings.jsx        # 设置页面
│       └── styles/
│           └── index.css
├── assets/
│   └── icon.png           # 应用图标
├── scripts/
│   └── release.sh         # 发布脚本
├── .github/workflows/
│   └── build.yml          # GitHub Actions CI/CD
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

### 技术栈
- **前端**：React 18 + Tailwind CSS + ReactMarkdown
- **后端**：Electron 33
- **数据库**：SQLite (better-sqlite3)
- **图表**：Recharts
- **AI 集成**：OpenAI API
- **构建工具**：Vite 6 + electron-builder
- **CI/CD**：GitHub Actions

### 开发命令
```bash
npm run dev              # 启动开发模式（带热重载）
npm run build            # 构建当前平台安装包
npm run build:renderer   # 只构建前端
npm run release          # 发布新版本（提交+打标签+触发CI）
npm run release -- 1.1.0 # 指定版本号发布
```

## 📝 注意事项

1. **首次运行**：首次启动需要安装原生依赖（better-sqlite3），可能需要编译工具
2. **Windows 用户**：确保已安装 Visual Studio Build Tools 或 Python
3. **macOS 用户**：确保已安装 Xcode Command Line Tools
4. **数据备份**：定期备份用户数据目录下的 `.db` 文件

## 🐛 常见问题

### 1. 依赖安装失败
```bash
rm -rf node_modules package-lock.json
npm install
```

### 2. 原生模块编译失败
```bash
# macOS
xcode-select --install

# Windows
npm install -g windows-build-tools
```

### 3. Windows 上关闭窗口后打不开
窗口关闭后应用仍在系统托盘运行。右键点击系统托盘图标（可能在「^」展开区域），选择"待办清单"重新打开。

如果仍然打不开，可能是保存的窗口位置在屏幕外。删除数据库文件后重启：
- 删除 `%APPDATA%/todo-float/` 目录

### 4. AI 分类不工作
- 检查 API Key 是否正确
- 确认 Base URL 可访问
- 查看终端日志中的 `[LLM]` 输出

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！
