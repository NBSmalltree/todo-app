# TodoFloat - 桌面待办清单

一款轻量级的桌面待办清单应用，漂浮在所有窗口顶端，支持任务管理、历史归档和 AI 工作分析。

## ✨ 功能特性

### 核心功能
- **悬浮窗口**：始终置顶，可自由调整大小（支持四角拖动和滚轮缩放）
- **任务管理**：快速添加、完成、删除待办事项
- **完成状态**：左侧圆形按钮，点击后显示灰色+删除线
- **状态恢复**：已完成任务可一键恢复为待办状态
- **右键菜单**：支持标记完成、归档、删除操作

### 归档与分析
- **历史归档**：归档任务不在悬浮窗口显示，保存在系统托盘
- **智能筛选**：支持按时间范围、类别、关键词筛选
- **备注编辑**：双击归档记录可添加备注
- **AI 自动分类**：归档时自动调用大模型判断工作类别
- **工作分析**：按周/月/年查看工作内容分布和完成情况

### 系统集成
- **系统托盘**：常驻状态栏，快速访问归档和分析
- **跨平台**：支持 macOS 和 Windows
- **数据持久化**：SQLite 本地存储，数据安全可靠

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm 或 yarn

### 安装步骤

```bash
# 1. 进入项目目录
cd todo-app

# 2. 运行设置脚本（可选）
chmod +x setup.sh
./setup.sh

# 3. 或者手动安装依赖
npm install

# 4. 启动开发模式
npm run dev
```

### 构建应用

```bash
# 构建可分发的应用包
npm run build
```

构建完成后，应用将输出到 `dist-electron` 目录。

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

### 查看归档
1. 点击系统托盘图标
2. 选择"历史归档 & 工作分析"
3. 在归档标签页查看所有归档记录

### 编辑备注
1. 在归档列表中双击备注列
2. 输入备注内容
3. 按回车键或点击"保存"按钮

### AI 自动分类
1. 在设置页面配置 API Key、Base URL 和模型名称
2. 在归档列表中，对未分类的任务点击"AI分类"按钮
3. 系统自动调用大模型判断类别

### 工作分析
1. 切换到"工作分析"标签页
2. 选择查看周期：本周/本月/本年
3. 查看工作类别分布、每日任务统计和完成率

### 窗口缩放
- **快捷键**：Ctrl/Cmd + 滚轮上下滚动
- **鼠标拖动**：拖动窗口四角调整大小
- **窗口控制**：标题栏的关闭和归档按钮

## ⚙️ 配置说明

### AI 模型配置
在应用设置页面配置以下参数：

- **API Key**：大模型服务的 API 密钥
- **Base URL**：API 服务地址（默认：https://api.openai.com/v1）
- **模型名称**：使用的模型（如：gpt-4o-mini、gpt-4、claude-3-haiku）

支持所有 OpenAI 兼容的 API 服务：
- OpenAI (GPT-4o, GPT-4, GPT-4o-mini)
- DeepSeek
- 智谱 AI (GLM)
- 通义千问
- Claude (Anthropic)
- 其他兼容服务

### 数据存储
数据存储在用户数据目录：
- **macOS**: `~/Library/Application Support/todofloat/todofloat.db`
- **Windows**: `%APPDATA%/todofloat/todofloat.db`

## 🎨 界面说明

### 悬浮窗口
- 顶部：标题栏（可拖动）+ 窗口控制按钮
- 中部：任务输入框 + 任务列表
- 底部：任务统计

### 归档窗口
- 顶部：Tab 导航（归档/分析/设置）
- 归档：筛选栏 + 归档列表表格
- 分析：周期选择 + 统计卡片 + 图表
- 设置：API 配置表单

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
│       ├── App.jsx        # 根组件
│       ├── components/    # 组件
│       │   ├── TodoWindow.jsx      # 悬浮窗口
│       │   ├── TrayView.jsx        # 托盘视图
│       │   ├── ArchiveViewer.jsx   # 归档查看器
│       │   ├── WorkAnalysis.jsx    # 工作分析
│       │   └── Settings.jsx        # 设置页面
│       └── styles/        # 样式
│           └── index.css
├── package.json           # 项目配置
├── vite.config.js         # Vite 配置
├── tailwind.config.js     # Tailwind 配置
└── postcss.config.js      # PostCSS 配置
```

### 技术栈
- **前端**：React 18 + Tailwind CSS
- **后端**：Electron 33
- **数据库**：SQLite (better-sqlite3)
- **图表**：Recharts
- **AI 集成**：OpenAI API
- **构建工具**：Vite 6

### 开发命令
```bash
npm run dev          # 启动开发模式（带热重载）
npm run build        # 构建生产版本
npm run build:renderer  # 只构建前端
```

## 📝 注意事项

1. **首次运行**：首次启动需要安装原生依赖（better-sqlite3），可能需要编译工具
2. **Windows 用户**：确保已安装 Visual Studio Build Tools 或 Python
3. **macOS 用户**：确保已安装 Xcode Command Line Tools
4. **数据备份**：定期备份 `todofloat.db` 文件
5. **API 配置**：使用第三方 API 时，请确保网络连接正常

## 🐛 常见问题

### 1. 依赖安装失败
```bash
# 清除缓存重试
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

### 3. 应用无法启动
检查 Node.js 版本：
```bash
node -v  # 应该是 18+
```

### 4. AI 分类不工作
- 检查 API Key 是否正确
- 确认 Base URL 可访问
- 查看控制台错误信息

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📧 联系方式

如有问题，请通过 GitHub Issues 反馈。
