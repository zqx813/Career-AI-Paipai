# 生涯助手 · 派派

面向大学生的 AI 生涯规划工具。上传简历，派派记住你，持续告诉你下一步做什么。

## 技术栈

| 层 | 技术 |
|-----|------|
| 前端 | Next.js + Tailwind + shadcn/ui |
| 后端 | Python FastAPI |
| AI | DeepSeek API |
| 数据库 | SQLite（本地）/ PostgreSQL（线上）|

## 快速开始

```bash
# 终端 1：后端（http://localhost:8000）
cd backend
cp .env.local.template .env
uvicorn main:app --reload

# 终端 2：前端（http://localhost:3000）
cd frontend
npm install
npm run dev
```

## 功能

- **启程引导**：邀请码 → 简历上传 → AI 对话式测评 → 初步报告
- **四大 AI 场景**：职业探索 / 技能发展 / 面试准备 / 任务推荐
- **分析报告**：匹配度、技能缺口、推荐方向、可视化学习路径
- **AI 记忆**：从对话中自动提取 7 维用户画像，持续更新
- **路线图修改**：对话式修改学习路径

## 部署

前端 Vercel，后端 Railway + PostgreSQL，国内阿里云加速。详见 `_scratch/部署指南.md`。

## 免责声明

内容由 AI 生成，仅供参考。
