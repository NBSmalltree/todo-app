#!/bin/bash

echo "🚀 TodoFloat 设置脚本"
echo "===================="

# Check Node.js version
echo ""
echo "检查 Node.js 版本..."
if ! command -v node &> /dev/null; then
    echo "❌ 未找到 Node.js，请先安装 Node.js 18+"
    echo "   下载地址: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 版本过低，需要 18+，当前版本: $(node -v)"
    exit 1
fi
echo "✅ Node.js 版本: $(node -v)"

# Install dependencies
echo ""
echo "📦 安装依赖..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    exit 1
fi
echo "✅ 依赖安装完成"

# Create assets directory
echo ""
echo "📁 创建资源目录..."
mkdir -p assets

echo ""
echo "✨ 设置完成！"
echo ""
echo "运行方式："
echo "  开发模式: npm run dev"
echo "  构建应用: npm run build"
echo ""
