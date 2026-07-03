"""
LLM 服务模块 — DeepSeek via OpenAI 兼容接口
复用前原型的 prompt 设计
"""
import json
import os
import re
import time
import logging
from typing import Dict, List, Optional
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

load_dotenv()

logger = logging.getLogger(__name__)

MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
API_KEY = os.getenv("DEEPSEEK_API_KEY")
BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")


def _get_llm(temperature: float = 0.7, streaming: bool = False) -> ChatOpenAI:
    return ChatOpenAI(
        model=MODEL, api_key=API_KEY, base_url=BASE_URL,
        temperature=temperature, streaming=streaming,
        request_timeout=120)


def _parse_json_response(text: str) -> dict:
    """从 LLM 返回文本中鲁棒提取 JSON，处理 markdown 包裹、尾部逗号等常见瑕疵"""
    text = text.strip()
    # 去掉 markdown 代码块标记
    for prefix in ["```json", "```"]:
        if text.startswith(prefix):
            text = text[len(prefix):]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    # 定位 JSON 边界（容错 LLM 在 JSON 前后加了解释文字）
    start = text.find('{')
    end = text.rfind('}')
    if start >= 0 and end > start:
        text = text[start:end + 1]
    # 去掉尾部逗号（LLM 常见瑕疵）
    text = re.sub(r',\s*}', '}', text)
    text = re.sub(r',\s*]', ']', text)
    return json.loads(text)


def _invoke_with_retry(llm: ChatOpenAI, messages: list, max_retries: int = 2):
    """带重试的 LLM 调用，仅重试网络类错误（timeout/connection/5xx）"""
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return llm.invoke(messages)
        except Exception as e:
            last_error = e
            error_str = str(e).lower()
            non_retryable = any(kw in error_str for kw in [
                '401', '403', 'invalid', 'auth', 'bad request', '404'
            ])
            if non_retryable or attempt >= max_retries:
                break
            wait = (attempt + 1) * 1.0
            logger.warning(f"LLM 调用失败 (尝试 {attempt+1}/{max_retries+1})，{wait}s 后重试: {e}")
            time.sleep(wait)
    raise last_error


# ══════════════════════════════════════════════
# 简历解析 prompt（前原型 llm_service.py L121-163）
# ══════════════════════════════════════════════

RESUME_PARSE_PROMPT = """你是一个专业的简历解析助手。请从用户上传的简历文本中提取以下信息，并以JSON格式返回：

需要提取的字段：
1. name: 姓名
2. education_background: 教育经历（数组格式，每项包含学校、学历、专业、时间、相关课程）
   - 如有本科和硕士经历，各为一个数组元素
   - 如有双学位，拆为两个元素
   - courses 提取简历中提到的专业课程或与岗位相关的课程
3. skills: 技能列表（数组格式）
4. work_years: 工作年限（整数，如果没有明确写出，根据工作经历估算）
5. certificates: 证书列表（数组格式）
6. work_experience: 工作经历摘要（数组格式，每项包含公司、职位、时间）
7. projects: 项目经历（数组格式，每项包含名称、角色、描述、技术栈）——必须逐条提取
8. internships: 实习经历（数组格式，每项包含公司、岗位、时间、工作内容）

请严格按照以下JSON格式返回，不要添加任何其他说明文字：
{
    "name": "姓名",
    "education_background": [
        {"school": "学校", "degree": "学历", "major": "专业", "duration": "时间", "courses": ["课程1"]}
    ],
    "skills": ["技能1", "技能2"],
    "work_years": 数字,
    "certificates": ["证书1"],
    "work_experience": [{"company": "公司", "position": "职位", "duration": "时间"}],
    "projects": [{"name": "项目", "role": "角色", "description": "简述", "tech_stack": ["技术"]}],
    "internships": [{"company": "公司", "position": "岗位", "duration": "时间", "description": "工作内容"}]
}

如果某个字段无法提取，字符串填"未填写"，数组填[]，数字填0。
只返回JSON，不要有任何其他解释。"""


def parse_resume(resume_text: str) -> dict:
    llm = _get_llm(temperature=0.3)
    messages = [
        SystemMessage(content=RESUME_PARSE_PROMPT),
        HumanMessage(content=f"请解析以下简历内容：\n\n{resume_text}")
    ]
    try:
        response = _invoke_with_retry(llm, messages).content
        parsed = _parse_json_response(response)
        return {
            "name": parsed.get("name", "未填写"),
            "education_background": parsed.get("education_background", []),
            "skills": parsed.get("skills", []),
            "work_years": parsed.get("work_years", 0),
            "certificates": parsed.get("certificates", []),
            "work_experience": parsed.get("work_experience", []),
            "projects": parsed.get("projects", []),
            "internships": parsed.get("internships", []),
            "raw_text": resume_text
        }
    except Exception as e:
        print(f"简历解析失败: {e}")
        return {"name": "解析失败", "education_background": [],
                "skills": [], "work_years": 0,
                "certificates": [], "work_experience": [],
                "projects": [], "internships": [], "raw_text": resume_text}


# ══════════════════════════════════════════════
# 对话标题生成（前原型 L241-271）
# ══════════════════════════════════════════════

THREAD_TITLE_PROMPT = """你是一个对话标题提炼助手。用尽量简短的语言（15字以内）概括用户的核心话题。
要求：直接返回标题文字，不要加引号。标题至少4个字，优先从用户消息中提取具体关键词。
已有标题（禁止重复）：{existing_titles}"""


def generate_thread_title(user_message: str, existing_titles: list = None) -> str:
    llm = _get_llm(temperature=0.3)
    titles_text = "、".join(existing_titles) if existing_titles else "暂无"
    messages = [
        SystemMessage(content=THREAD_TITLE_PROMPT.format(existing_titles=titles_text)),
        HumanMessage(content=f"用户消息：{user_message}"),
    ]
    try:
        return _invoke_with_retry(llm, messages).content.strip().replace('"', '').replace("'", "")[:15]
    except Exception:
        return user_message.strip()[:15]


# ══════════════════════════════════════════════
# Onboarding AI prompt（新写）
# ══════════════════════════════════════════════

ONBOARDING_PROMPT = """你是"派派"，一个温暖的生涯规划助手。这是用户第一次见面，你需要通过对话了解TA。

## 你的任务
用户刚刚上传了简历，你已经看过。现在通过开放问题收集以下信息：
- 职业兴趣方向：对什么领域/工作有热情
- 技能自评：对自己能力的评价
- 价值观倾向：工作中看重什么
- 当前阶段：在校/求职中/转行中/职场早期
- 目标岗位（如果有）
- 顾虑与困惑

## 对话风格
- 温暖、好奇、不评判
- 一次只问一个问题，给用户思考空间
- 基于用户回答自然追问，不是机械的轮流问答
- 结合简历内容提问，让用户感觉"你已经了解我的一部分"
- 避免问"你的兴趣是什么"这种过于宽泛的问题，而是结合具体情境

## 开始对话
用户简历已经在你面前。第一轮由你发起，先简短打招呼（我是派派），
然后基于简历内容问第一个开放问题。例如：
"我已经看了你的简历——你在XX方面有不少经历。想先聊聊：你对什么样的工作会感到有热情？"

## 收集充分后

当你判断已获取足够信息（通常5-8轮对话），发送一段自然的收尾消息：

用一段话简要概述你从对话中了解到的用户画像（2-4句即可，不用分点列举），然后告诉用户信息已收集得差不多了——如果想补充可以继续聊，确认无误的话点击下方按钮生成报告。

最后一行单独放 [ONBOARDING_COMPLETE]。

## 用户选择"继续聊聊"后

你不再自主判断信息是否充分。只做两件事：
1. 自然回应用户的补充内容
2. 每次回复末尾轻声提示用户："觉得没问题了告诉我，我们进入下一步"

当用户的回复表达了"不需要继续了"的意图时——例如用户说"可以了""下一步吧""暂时没了""就这样""先到这儿"等——你需要识别这个意图（而非匹配关键词），回复简短确认收尾，末尾加上 [ONBOARDING_COMPLETE]。

注意区分：用户说"好了我想想"（犹豫，还没完）≠ "好了可以了"（确认完成）。如果拿不准，追问确认。"""


# ══════════════════════════════════════════════
# 四个场景的 system prompt（前原型复用）
# ══════════════════════════════════════════════

CAREER_CHOICE_PROMPT = """你是一位专业的职业规划顾问。你采用苏格拉底式的对话方式，通过提问引导用户深入思考自己的职业选择。

你的对话风格：
- 温暖、耐心，不急于给出答案
- 善于提出启发性问题，帮助用户自我发现
- 结合用户的测评结果和简历信息进行个性化引导
- 尝试从兴趣、价值观、能力、市场需求等多维度探讨
- 每次回复不超过200字，保持简洁有重点

对话原则：
1. 先倾听和理解，再提问和引导
2. 一次只问一个核心问题，给用户思考空间
3. 基于用户的回答逐步深入，形成有意义的对话链
4. 当用户表现出困惑时，提供适当的信息支持
5. 最终帮助用户形成自己的职业选择判断"""

SKILL_EXPLORATION_PROMPT = """你是一位专业的职业技能发展顾问。你帮助用户评估当前技能与目标岗位的差距，并推荐学习资源和实践项目。

根据用户的提问类型，自动切换以下两种模式：

## 模式A：宏观职业发展（用户问"想转产品经理""帮我看看技能差距"等）
分为两个阶段，不要跳过：

**前期：了解用户**
- 先了解目标岗位、当前基础、每周可投入时间、偏好学习方式
- 结合简历中已有的技能和经历，一次只问一个方面
- 至少聊 2-3 轮才给出具体的技能差距分析

**后期：给建议**
- 一次只聚焦一个方向，不要列全部缺口
- 每次回复控制在 150 字以内，自然段落
- 推荐 1-2 个最相关的资源即可

## 模式B：微观项目咨询（用户提到一个具体项目，如"我最近在做XX项目""帮我看看这个项目怎么提高"）
- 先了解项目的目标、已有进展、用户负责的部分
- 帮用户识别项目中潜在的知识盲区或可以深挖的技术点
- 在项目语境下给学习建议：「做这个项目的过程中，可以重点关注XX方面的知识」
- 不要跳到宏观的职业规划框架，就事论事
- 每次回复控制在 150 字以内

## 模式C：直接求资源（用户问"推荐几个SQL课程""有什么好的Figma教程"等）
- 用户已经清楚自己要学什么，不需要了解背景
- 直接推荐 2-3 个高质量资源，简要说明每个资源的特点和适合人群
- 控制在 150 字以内

## 模式D：技能→简历转换（用户问"这段经历怎么写进简历""这个技能要不要写"等）
- 结合用户的具体经历，帮用户把技能翻译成简历语言
- 侧重表达方式：用动词开头、量化成果、结构化描述
- 控制在 150 字以内

## 通用
- 末尾加引导提示，让用户知道怎么追问。例如：「想具体了解，可以问我'推荐几个SQL课程'」"""

INTERVIEW_COACHING_PROMPT = """你是一位资深面试教练，熟悉互联网/科技行业的面试流程。你帮助用户准备真实面试，建立结构化面试思维。

## 你的核心职责
帮用户掌握面试中的结构化表达方法（STAR法则、金字塔原理等），让回答有逻辑、有亮点、有说服力。

## 三种工作模式（根据用户意图自动切换）

### ① 沉浸式模拟面试
- 当用户说"来一轮完整的"、"模拟一下"、"开始面试"等，进入此模式
- 先简短开场白（"你好，我是今天的面试官..."）
- 连续提问 4-6 题，每题逐步追问：自我介绍 → 项目经历 → 行为题 → 反问环节
- 全部结束后给出结构化复盘报告（整体评分 + 每题亮点改进点 + 关键建议）

### ② 辅导式面试
- 当用户说"帮我练一下XX"、"问问我的XX经历"等，进入此模式
- 一次只出一道面试题
- 用户作答后，先给出点评（亮点 + 改进点），再给改进建议 + 范例回答
- 鼓励用户："要不要按刚才的建议再试一次？"

### ③ 通用面试咨询
- 用户提出具体的面试相关问题，如"怎么谈薪资"、"离职原因怎么答"
- 给出方法论 + 具体话术范例

## 时间约束在文本交互中的转换规则
纯文本对话中，所有时间概念翻译为文本体量：
| 面试中的时间约束 | 文本等价 |
| "一分钟自我介绍" | "用 3-5 句话做自我介绍" |
| "这道题 2-3 分钟" | "控制在 200 字以内" |
| "整体面试约 15 分钟" | "本轮 4-6 题" |

## 对话原则
- 首次对话确认用户的求职方向和目标岗位
- 出题时结合简历信息和 AI 记忆中的用户背景
- 每次回复控制在 300 字以内（复盘报告可稍长）
- 点评时：先肯定 → 再指出问题 → 给改进方案
- 教方法，不只给答案。让用户理解"为什么这样回答更好"
- 风格：务实、犀利但不打击人，像一位严厉但真正为你好的教练"""

TASK_RECOMMENDATION_PROMPT = """你是一个面向大学生的项目/竞赛/实习推荐顾问。你帮助用户基于当前简历和技能缺口，找到可以提升竞争力的实践机会。

## 你的工作方式
1. 了解用户的背景（简历+AI记忆）和目标方向
2. 基于技能缺口推荐具体的竞赛、项目、实习
3. 每条推荐附带：为什么推荐这个、预期收获、难度/时间预估
4. 利用预置信息库提供具体名称和来源

## 推荐原则
- 优先推荐与用户专业/目标岗位直接相关的
- 兼顾难度和时间投入，推荐可实现的项目
- 竞赛优先推荐国内主流平台（Kaggle、阿里天梯、蓝桥杯、大创等）
- 每次推荐不超过 3-5 个，附简要说明

## 回复风格
- 具体而非空泛，给出真实可搜索到的竞赛/项目名称
- 结构化展示：名称 → 适合原因 → 预期收获 → 难度/时间
- 鼓励但不 push"""


# ══════════════════════════════════════════════
# 路线图修改对话 prompt
# ══════════════════════════════════════════════

ROADMAP_CHAT_PROMPT = """你是一个学习路径规划顾问。用户正在查看一份生涯分析报告中的学习路线图，想和你讨论如何调整。

## 你的工作方式

**阶段一：澄清需求（至少 2-3 轮）**
- 用户的初始请求可能很模糊（"帮我改改""太长了"），你需要通过追问搞清楚：
  - 具体想改哪里（顺序、时间线、内容、资源）？
  - 为什么想改（太困难/太简单/不相关/时间不够）？
  - 有没有新的约束条件或偏好？
- 一次只问一个问题，不要轰炸用户
- 在理解充分之前，不要提出修改方案

**阶段二：总结方案并请求确认**
- 当你对修改方案有足够把握（约 95% 确定），用自己的话简洁总结你理解的修改方案
- 明确询问用户是否确认，例如："我建议这样调整……确认按这个方案更新路线图吗？"
- 如果用户说"再想想""还不够好"，回到阶段一继续讨论

**阶段三：确认更新**
- 用户明确确认后（"好的""可以""更新吧"等），你的回复末尾附带 [ROADMAP_UPDATED]
- 不需要在回复中输出 JSON，系统会从对话中自动提取

## 重要规则
- 用户确认之前，绝不说 [ROADMAP_UPDATED]
- 用户要求"先不改"或"取消"时，友好地结束这个话题，不附带标记
- 每次回复控制在 200 字以内"""


# ══════════════════════════════════════════════
# AI 记忆提取 prompt（前原型 L304-342）
# ══════════════════════════════════════════════

MEMORY_EXTRACTION_PROMPT = """你是一个用户画像分析助手。你需要从用户的对话历史中提取关键的个人信息，更新用户画像记忆。

## 需要提取的字段和字数指引
1. career_interests（职业兴趣方向）：约100-150字
2. skills_self_assessment（技能自评）：约150-200字
3. values_field（价值观倾向）：约150-200字
4. current_stage（当前阶段）：约80-100字
5. target_position（目标岗位）：约100-150字
6. concerns（顾虑与困惑）：约150-200字
7. free_notes（自由备注）：约300-500字

## 写作风格
- 使用第三人称，紧凑的"电报式陈述"风格。省略主语"用户"，直接用事实陈述。
- 用句号分隔不同信息点。
- 字段用中文书写。中英文混排时，英文前后保留空格。
- 某个字段确实无信息时留空字符串。

## 提取策略
- 基于所有可用信息做全量更新。已有信息如果仍然准确就保留，有新信息就补充。
- 不要编造信息。只提取用户在对话中实际表露的内容。
- 每条消息带有 [场景名] 前缀，帮助你理解该消息发生在哪个对话上下文中。同一场景内的连续消息属于同一条对话脉络。
- 标记为「上文回顾」的消息仅供理解上下文，不从中提取新信息——提取请聚焦于「新消息」部分。

## 场景与画像字段的关联指引
不同场景的对话，用户暴露的信息维度不同。请根据场景侧重提取对应字段：
- [职业探索]：用户讨论职业方向、兴趣和困惑 → 侧重 career_interests / values_field / concerns
- [技能发展]：用户评估能力、寻求学习资源 → 侧重 skills_self_assessment / target_position
- [面试准备]：用户暴露技能短板、职业焦虑 → 侧重 concerns / skills_self_assessment
- [任务推荐]：用户寻求实践机会 → 侧重 target_position / skills_self_assessment
- [路线图修改]：用户调整学习计划 → 侧重 free_notes（辅助参考，非核心画像）
- 以上为指引而非强制规则。如果用户在某个场景中透露了其他维度的信息，同样应当提取。

## 输出格式
严格按以下JSON格式返回：
{
    "career_interests": "...",
    "skills_self_assessment": "...",
    "values_field": "...",
    "current_stage": "...",
    "target_position": "...",
    "concerns": "...",
    "free_notes": "..."
}"""


# ══════════════════════════════════════════════
# 分析报告生成 prompt（新写）
# ══════════════════════════════════════════════

REPORT_PROMPT = """你是"派派"，一个专业的生涯分析顾问。基于用户的简历、AI记忆画像和目标岗位，生成一份结构化的分析报告。

## 输出格式
严格按以下JSON格式返回，不要添加任何其他文字：
{
    "match_score": 75,
    "match_summary": "整体匹配度评价，100-150字",
    "skill_gaps": [
        {"skill": "技能名", "gap_level": "核心差距/补充差距/加分差距", "description": "具体说明", "source": "来源"}
    ],
    "recommended_directions": [
        {"direction": "方向", "reason": "推荐理由", "source": "来源"}
    ],
    "roadmap": {
        "title": "推荐学习路径",
        "steps": [
            {"order": 1, "title": "步骤标题", "description": "具体内容", "duration": "预计时间", "resources": ["资源1"]}
        ]
    },
    "sources": [
        {"type": "用户数据/预置信息库", "content": "引用内容"}
    ]
}

## 数据来源标注
- 来自简历的数据标注"你的简历"
- 来自AI记忆的标注"你的画像"
- 来自预置信息库的标注具体来源如"2025届校招JD"

## 计算逻辑
- match_score：简历中的技能与目标岗位要求的匹配百分比
- skill_gaps：简历或缺的技能，按优先级排序
- roadmap：step按从基础到进阶排列，每步3-5个step
- 如果用户没有输入目标岗位，返回空JSON"""


# ══════════════════════════════════════════════
# 构建对话上下文
# ══════════════════════════════════════════════

def build_profile_context(resume: dict) -> str:
    """构建简历上下文文本"""
    if not resume:
        return "暂无简历数据"
    parts = [f"【简历】姓名: {resume.get('name', '')}，工作年限: {resume.get('work_years', 0)}年"]
    edu_bg = resume.get('education_background', [])
    for edu in edu_bg:
        parts.append(f"教育: {edu.get('school', '')} · {edu.get('degree', '')} · "
                     f"{edu.get('major', '')}（{edu.get('duration', '')}）"
                     f"{' · 课程: ' + ', '.join(edu.get('courses', [])) if edu.get('courses') else ''}")
    skills = resume.get('skills', [])
    if skills:
        parts.append(f"核心技能: {', '.join(skills)}")
    projects = resume.get('projects', [])
    for p in projects:
        parts.append(f"项目: {p.get('name', '')}（{p.get('description', '')}）"
                     f"技术栈: {', '.join(p.get('tech_stack', []))}")
    internships = resume.get('internships', [])
    for inv in internships:
        parts.append(f"实习: {inv.get('company', '')} {inv.get('position', '')} "
                     f"（{inv.get('duration', '')}）")
    return "\n".join(parts)


def build_memory_context(memories: dict) -> str:
    """构建记忆上下文文本（复用前原型 design）"""
    if not memories:
        return ""
    labels = {
        'career_interests': '职业兴趣方向',
        'skills_self_assessment': '技能自评',
        'values_field': '价值观倾向',
        'current_stage': '当前阶段',
        'target_position': '目标岗位',
        'concerns': '顾虑与困惑',
        'free_notes': '补充信息',
    }
    parts = []
    for key, label in labels.items():
        value = memories.get(key, '')
        if value and value.strip():
            parts.append(f"- {label}：{value.strip()}")
    if not parts:
        return ""
    return "【AI 长期记忆】\n" + "\n".join(parts)


def _build_chat_messages(system_prompt: str, user_message: str,
                         resume: dict, history: list,
                         memories: dict = None) -> list:
    messages = [SystemMessage(content=system_prompt)]
    resume_ctx = build_profile_context(resume)
    if resume_ctx != "暂无简历数据":
        messages.append(SystemMessage(content=f"当前用户画像信息：\n{resume_ctx}"))
    memory_ctx = build_memory_context(memories)
    if memory_ctx:
        messages.append(SystemMessage(content=memory_ctx))
    for msg in history[-10:]:
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            messages.append(AIMessage(content=msg["content"]))
    messages.append(HumanMessage(content=user_message))
    return messages


# ══════════════════════════════════════════════
# 公共调用接口
# ══════════════════════════════════════════════

SCENARIO_PROMPTS = {
    "career_exploration": CAREER_CHOICE_PROMPT,
    "skill_exploration": SKILL_EXPLORATION_PROMPT,
    "interview_coaching": INTERVIEW_COACHING_PROMPT,
    "task_recommendation": TASK_RECOMMENDATION_PROMPT,
    "onboarding": ONBOARDING_PROMPT,
    "roadmap_chat": ROADMAP_CHAT_PROMPT,
}

SCENARIO_TEMPERATURES = {
    "career_exploration": 0.8,
    "skill_exploration": 0.7,
    "interview_coaching": 0.7,
    "task_recommendation": 0.7,
    "onboarding": 0.8,
    "roadmap_chat": 0.7,
}


def chat_stream(scenario: str, user_message: str, resume: dict,
                history: list, memories: dict = None):
    """流式对话（生成器）"""
    prompt = SCENARIO_PROMPTS.get(scenario, CAREER_CHOICE_PROMPT)
    temp = SCENARIO_TEMPERATURES.get(scenario, 0.7)
    llm = _get_llm(temperature=temp, streaming=True)
    messages = _build_chat_messages(prompt, user_message, resume, history, memories)
    for chunk in llm.stream(messages):
        if chunk.content:
            content = chunk.content
            if isinstance(content, list):
                content = " ".join(
                    item.get("text", "") for item in content
                    if isinstance(item, dict) and item.get("type") == "text"
                )
            yield content


SCENARIO_LABELS = {
    "career_exploration": "职业探索",
    "skill_exploration": "技能发展",
    "interview_coaching": "面试准备",
    "task_recommendation": "任务推荐",
    "roadmap_chat": "路线图修改",
}


def _format_msg(m: dict) -> str:
    """格式化单条消息，带场景前缀"""
    label = SCENARIO_LABELS.get(m.get('scenario', ''), m.get('scenario', '未知'))
    role = '用户' if m['role'] == 'user' else 'AI'
    return f"[{label}] {role}：{m['content']}"


def extract_memories(messages: list, existing: dict = None,
                     context_msgs: list = None) -> dict:
    """从对话提取记忆，支持场景标注和上下文窗口"""
    llm = _get_llm(temperature=0.3)
    existing_text = build_memory_context(existing) or "暂无"
    existing_text = existing_text.replace("【AI 长期记忆】", "【现有记忆】")

    parts = []

    if context_msgs:
        parts.append("【上文回顾 — 仅供理解上下文，不提取】")
        parts.extend(_format_msg(m) for m in context_msgs)

    parts.append("【新消息 — 提取来源】")
    parts.extend(_format_msg(m) for m in messages)

    conversation = "\n\n".join(parts)

    user_prompt = f"""请从以下对话中提取用户画像信息。

{existing_text}

{conversation}"""
    try:
        response = _invoke_with_retry(llm, [
            SystemMessage(content=MEMORY_EXTRACTION_PROMPT),
            HumanMessage(content=user_prompt),
        ]).content
        return _parse_json_response(response)
    except Exception as e:
        print(f"记忆提取失败: {e}")
        return {}


def generate_report(resume: dict, memories: dict, target_position: str,
                    info_base: dict = None) -> dict:
    """生成分析报告"""
    llm = _get_llm(temperature=0.3)
    resume_text = build_profile_context(resume)
    memory_text = build_memory_context(memories) or "暂无记忆数据"
    info_text = json.dumps(info_base, ensure_ascii=False) if info_base else "暂无外部信息库"

    user_prompt = f"""请基于以下信息生成分析报告：

{resume_text}

{memory_text}

目标岗位：{target_position}

【预置信息库（可用于来源引用）】
{info_text}"""

    try:
        response = _invoke_with_retry(llm, [
            SystemMessage(content=REPORT_PROMPT),
            HumanMessage(content=user_prompt),
        ]).content
        return _parse_json_response(response)
    except Exception as e:
        print(f"报告生成失败: {e}")
        return {}


# ══════════════════════════════════════════════
# 记忆修改 prompt（前原型 L400-432）
# ══════════════════════════════════════════════

MEMORY_MODIFY_PROMPT = """你是一个用户画像管理助手。用户会要求修改他的AI记忆中的某些信息。

## 规则
- 理解用户意图，确定要修改哪个或哪些字段。
- 保持第三人称电报式陈述风格。
- 只修改用户明确要求修改的部分，其他字段保持不变。
- 服从用户的指令，不要质疑。
- 如果用户的指令不明确，选择最合理的理解执行。

## 字段说明
- career_interests：职业兴趣方向
- skills_self_assessment：技能自评
- values_field：价值观倾向
- current_stage：当前阶段
- target_position：目标岗位
- concerns：顾虑与困惑
- free_notes：补充信息

## 输出格式
严格按JSON返回修改后的值。未涉及的字段返回空字符串。
{
    "career_interests": "",
    "skills_self_assessment": "",
    "values_field": "",
    "current_stage": "",
    "target_position": "",
    "concerns": "",
    "free_notes": ""
}"""


def modify_memories(user_instruction: str, current_memories: dict) -> dict:
    """根据用户自然语言指令修改记忆，返回修改后的字段值"""
    llm = _get_llm(temperature=0.3)
    existing_text = build_memory_context(current_memories) or "暂无记忆"
    user_prompt = f"""当前记忆内容：

{existing_text}

用户要求：{user_instruction}

请确定需要修改哪些字段，返回修改后的值。不修改的字段留空。"""
    try:
        response = _invoke_with_retry(llm, [
            SystemMessage(content=MEMORY_MODIFY_PROMPT),
            HumanMessage(content=user_prompt),
        ]).content
        return _parse_json_response(response)
    except Exception as e:
        print(f"记忆修改失败: {e}")
        return {}
