# 生涯助手 · 派派

面向大学生的 AI 生涯规划工具。上传简历，派派记住你，持续告诉你下一步做什么。

👉 [paipai-ai.top](https://paipai-ai.top)（需邀请码）

## 功能

- **启程引导**：邀请码 → 简历上传 → AI 对话式测评 → 初步报告
- **四大 AI 场景**：职业探索 / 技能发展 / 面试准备 / 任务推荐
- **分析报告**：匹配度、技能缺口、推荐方向、可视化学习路径
- **AI 记忆**：从对话中自动提取 7 维用户画像，持续更新
- **路线图修改**：对话式修改学习路径

## 技术栈

| 层 | 技术 |
|-----|------|
| 前端 | Next.js + Tailwind + shadcn/ui |
| 后端 | Python FastAPI |
| AI | DeepSeek API |
| 数据库 | SQLite（本地）/ PostgreSQL（线上）|

## 部署架构

```
用户 → paipai-ai.top → 阿里云 ESA（国内加速）→ Vercel（前端）→ Railway（后端 + PostgreSQL）
```

| 服务 | 平台 | 说明 |
|------|------|------|
| 前端 | Vercel | Next.js |
| 后端 | Railway | FastAPI + PostgreSQL |
| 国内加速 | 阿里云 ESA | 域名 + 边缘加速 |
| AI | DeepSeek API | 对话/报告/画像 |

## 项目结构

```
├── backend/          # FastAPI + SQLite/PostgreSQL
├── frontend/         # Next.js + Tailwind + shadcn/ui
└── _scratch/         # 部署文档、测试资料、运维脚本
```

## 本地开发

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

## 免责声明

内容由 AI 生成，仅供参考。
