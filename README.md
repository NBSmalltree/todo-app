# TodoFloat - 桌面待办清单

一款轻量级的桌面待办清单应用，漂浮在所有窗口顶端，支持任务管理、历史归档、AI 工作分析和数据导出。

## ✨ 功能特性

### 核心功能
- **悬浮窗口**：始终置顶，可自由调整大小（支持四角拖动和滚轮缩放）
- **任务管理**：快速添加、完成、删除待办事项
- **截止日期**：为任务设置截止日期，过期红色提醒、当天黄色提醒
- **动画效果**：任务添加滑入、勾选脉冲、删除滑出等平滑动画
- **右键菜单**：标记完成、归档（仅限已完成任务）、删除
- **窗口记忆**：退出时自动保存窗口位置、大小和长宽比，下次启动恢复
- **跨窗口同步**：归档/恢复操作后，待办清单和归档窗口自动刷新
- **批量操作**：支持批量选择、批量删除、批量归档/恢复

### 归档与分析
- **历史归档**：已完成任务可归档，归档后自动触发 AI 分类
- **智能筛选**：支持按时间范围、类别、关键词筛选
- **备注编辑**：双击归档记录可添加备注
- **AI 分类**：归档时自动分类，也支持手动重新分类
- **恢复待办**：归档记录可一键恢复到待办清单
- **数据导出**：支持导出为 CSV 文件（可选待办/归档/全部，支持筛选条件，包含截止日期字段）
- **工作分析**：按周/月/年查看工作分布、完成率，AI 生成 Markdown 格式的智能建议

### 外观设置
- **主题模式**：浅色 / 深色 / 护眼三种主题，实时切换（本地立即生效）
- **窗口透明度**：CSS 实现，滑块调节 20%~100%
- **独立设置窗口**：通过系统托盘打开，不再嵌套在归档页面中
- **高分辨率托盘图标**：支持 Retina 显示，图标更清晰

### 数据管理
- **手动备份**：在设置页一键备份数据库到指定位置
- **数据恢复**：从备份文件恢复数据（会覆盖当前数据）
- **数据持久化**：SQLite 本地存储

### AI 模型集成
- 支持自定义 API Key、Base URL 和模型名称
- 兼容所有 OpenAI 协议的 API 服务（OpenAI、DeepSeek、智谱、通义千问、Claude 等）
- 归档时自动分类、工作分析智能建议均通过大模型实现

### 系统集成
- **系统托盘**：点击弹出下拉菜单（待办清单、历史归档、设置、退出）
- **跨平台**：支持 macOS（Intel + Apple Silicon）和 Windows
- **快捷键**：Ctrl/Cmd + Shift + T 快速显示/隐藏窗口
- **CI/CD**：GitHub Actions 自动构建 macOS (.dmg) 和 Windows (.exe) 安装包

## 🚀 快速开始

### 环境要求
- Node.js 18+
- npm

### 安装与运行

```bash
git clone https://github.com/NBSmalltree/todo-app.git
cd todo-app
npm install
npm run dev
```

### 构建安装包

```bash
npm run build
```

构建产物输出到 `dist-electron` 目录。

## 📦 发布新版本

```bash
# 自动更新 package.json 版本号、提交、打 tag 并推送
npm run release            # 使用 package.json 中的版本号
npm run release -- 1.2.3   # 指定新版本号
```

自动执行：更新 package.json 版本 → 提交 → 推送 → 打 tag → 触发 GitHub Actions 构建。

构建完成后在 [GitHub Releases](https://github.com/NBSmalltree/todo-app/releases) 下载安装包。

### 当前版本
**v1.2.2** - 修复 Intel Mac 兼容性、添加截止日期、批量操作、数据备份恢复等功能。

### 下载说明
- **macOS (Apple Silicon)**: 下载 `TodoFloat-x.x.x-arm64.dmg`
- **macOS (Intel)**: 下载 `TodoFloat-x.x.x-x64.dmg`
- **Windows**: 下载 `TodoFloat-x.x.x.exe`

## 📖 使用指南

### 待办清单
1. 输入框输入任务内容，按回车或点击「添加」
2. 点击左侧圆圈标记完成（带脉冲动画）
3. **设置截止日期**：点击任务右侧的日历图标，选择日期（过期红色提醒、当天黄色提醒）
4. **批量操作**：点击标题栏「选择」按钮，进入批量选择模式，支持批量删除、批量归档
5. 右键已完成任务可选择「归档」（未完成任务不允许归档）
6. Ctrl/Cmd + 滚轮缩放窗口，拖动四角调整比例
7. 点击其他区域或按 ESC 可退出日期选择器和批量选择模式

### 历史归档
- 点击系统托盘 →「历史归档」，或点击标题栏归档按钮
- 筛选栏支持：关键词搜索、类别下拉、时间范围
- **批量操作**：点击「选择」按钮，进入批量选择模式，支持批量恢复、批量删除
- 操作列：AI 分类、恢复待办、删除
- 支持导出 CSV（可选归档/待办/全部，筛选条件同步生效，包含截止日期字段）

### 工作分析
- 切换周/月/年维度查看统计
- 概览卡片：待办任务、归档任务、工作类别、完成率
- 图表：类别分布饼图、每日任务柱状图
- 底部 AI 分析：大模型生成 Markdown 格式的工作建议，支持选中复制

### 设置
- 点击系统托盘 →「设置」
- **外观**：主题切换（浅色/深色/护眼，点击立即生效）、透明度调节
- **数据管理**：备份数据（导出到指定位置）、恢复数据（从备份文件恢复，会覆盖当前数据）
- **窗口吸附**：启用/禁用窗口吸附功能、调整吸附灵敏度、自动隐藏延迟
- **AI 配置**：API Key、Base URL、模型名称

## ⚙️ 配置说明

### 数据存储
- **macOS**: `~/Library/Application Support/todo-float/`
- **Windows**: `%APPDATA%/todo-float/`

数据库中存储所有设置（主题、透明度、AI 配置、窗口吸附设置）和任务数据（包含截止日期）。

### 数据备份与恢复
- **备份**：在设置页点击「备份数据」，选择保存位置，数据库文件将复制到指定位置
- **恢复**：在设置页点击「恢复数据」，选择备份文件，当前数据将被覆盖（操作前会确认）

## 🔧 开发说明

### 项目结构
```
todo-app/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── main.js        # 主进程入口（窗口管理、IPC、托盘、快捷键）
│   │   ├── database.js    # SQLite 数据库（任务 CRUD、设置、备份恢复）
│   │   ├── edgeManager.js # 窗口吸附管理（边缘吸附、自动隐藏）
│   │   ├── llm.js         # LLM 集成（分类、工作分析）
│   │   └── preload.js     # 预加载脚本（IPC 桥接）
│   └── renderer/          # React 前端
│       ├── App.jsx        # 路由（/ → 待办，/tray → 归档，/settings → 设置）
│       ├── components/
│       │   ├── TodoWindow.jsx      # 悬浮待办窗口（含截止日期、批量操作）
│       │   ├── TrayView.jsx        # 归档视图（含标签页导航、批量操作）
│       │   ├── ArchiveViewer.jsx   # 归档列表（筛选、导出、批量操作）
│       │   ├── WorkAnalysis.jsx    # 工作分析（图表、AI 建议）
│       │   └── Settings.jsx        # 设置页面（主题、透明度、AI、数据管理）
│       └── styles/
│           └── index.css           # 全局样式、主题变量、动画
├── assets/
│   ├── icon.png           # 应用图标
│   ├── tray-icon.png      # 系统托盘图标（1x）
│   └── tray-icon@2x.png # 系统托盘图标（2x，Retina）
├── scripts/
│   └── release.sh         # 发布脚本（自动更新版本、打标签）
├── .github/workflows/
│   └── build.yml          # GitHub Actions CI/CD（macOS ARM64/x64 + Windows）
└── package.json
```

### 技术栈
- **前端**：React 18 + Tailwind CSS + ReactMarkdown + Recharts
- **后端**：Electron 33
- **数据库**：SQLite (better-sqlite3)
- **AI**：OpenAI API 兼容协议
- **构建**：Vite 6 + electron-builder
- **CI/CD**：GitHub Actions（macOS ARM64/x64 + Windows 并行构建）

### 开发命令
```bash
npm run dev              # 启动开发模式（Vite + Electron，带热重载）
npm run build            # 构建当前平台安装包
npm run build:renderer   # 只构建前端
npm run release          # 发布（使用当前版本号）
npm run release -- 1.1.0 # 发布（指定新版本号）
```

## 📝 注意事项

1. **原生依赖**：首次运行需编译 better-sqlite3，需安装 C++ 编译工具
2. **Windows**：需安装 Visual Studio Build Tools
3. **macOS**：需安装 Xcode Command Line Tools
4. **数据备份**：定期备份用户数据目录下的 `.db` 文件

## 🐛 常见问题

### 1. 依赖安装失败
```bash
rm -rf node_modules package-lock.json
npm install
```

### 2. Windows 上关闭窗口后打不开
窗口关闭后应用仍在系统托盘运行。右键点击系统托盘图标（可能在「^」展开区域），选择「待办清单」重新打开。

如果仍然打不开，删除数据库文件后重启：
```
%APPDATA%/todo-float/
```

### 3. macOS 上提示"来自身份不明的开发者"
这是正常的，因为应用未经过 Apple 公证。解决方法：
1. 在 Finder 中找到 `TodoFloat.app`
2. 按住 `Control` 键点击应用，选择"打开"
3. 在弹出的对话框中点击"打开"
4. 以后就可以正常打开了

或者：
1. 打开"系统设置" > "隐私与安全性"
2. 滚动到底部，会看到"TodoFloat"被阻止的提示
3. 点击"仍要打开"

### 4. AI 分类不工作
- 检查 API Key 是否正确
- 确认 Base URL 可访问（如 `https://api.deepseek.com/v1`）
- 查看终端日志中的 `[LLM]` 输出

### 5. 窗口在屏幕外
如果曾连接外接显示器，窗口可能保存了不可见的坐标。应用会自动检测并重置为默认位置（v1.0.1+）。如仍有问题，删除数据库文件重启。

### 6. Intel Mac 上无法打开（架构错误）
确保下载的是 `TodoFloat-x64.dmg`（Intel Mac）或 `TodoFloat-arm64.dmg`（Apple Silicon M系列芯片）。如果下载错误，请重新下载对应架构的版本。

## 📄 许可证

MIT License
