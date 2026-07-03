"use client";

import { useState } from "react";
import { MessageSquare, FileText, FileBarChart, Brain, Compass, ArrowRight, X } from "lucide-react";

const STEPS = [
  {
    target: "对话",
    icon: MessageSquare,
    title: "对话",
    desc: "你的对话都会保存在这里。可以在不同场景间切换，每个场景支持多条对话线程。",
  },
  {
    target: "简历",
    icon: FileText,
    title: "简历管理",
    desc: "查看和编辑你的简历信息。AI 解析的结果可以在这里确认和修改。",
  },
  {
    target: "分析报告",
    icon: FileBarChart,
    title: "分析报告",
    desc: "基于你的简历和派派对你的了解，生成岗位匹配分析报告。支持多份报告、可视化规划线修改。",
  },
  {
    target: "AI记忆",
    icon: Brain,
    title: "AI 记忆",
    desc: "派派从对话中自动提取的你的画像。你可以查看、修改或清空。这让派派越来越懂你。",
  },
  {
    target: "场景",
    icon: Compass,
    title: "四个辅导场景",
    desc: "职业探索、技能发展、面试准备、任务推荐——根据你的需求选择合适的场景开始对话。",
  },
];

interface Props {
  onDone: () => void;
}

export function OnboardingGuide({ onDone }: Props) {
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-start pointer-events-auto">
      {/* 浮窗卡片 — 定位在侧边栏附近 */}
      <div className="ml-[240px] mt-20 bg-white rounded-2xl shadow-2xl border border-[#D4A574] p-6 max-w-sm w-full animate-in fade-in slide-in-from-top-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-[#8B7355]">
            <current.icon size={20} />
            <span className="font-semibold">{current.title}</span>
          </div>
          <button onClick={onDone} className="text-[#999] hover:text-[#666]">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-[#666] leading-relaxed mb-2">{current.desc}</p>
        <p className="text-xs text-[#D4A574] mb-4">在左侧侧边栏找到「{current.target}」</p>

        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === step ? "bg-[#8B7355]" : "bg-[#E8E4E0]"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-3 py-1.5 text-sm text-[#999] hover:text-[#666]"
              >
                上一步
              </button>
            )}
            {isLast ? (
              <button
                onClick={onDone}
                className="px-4 py-1.5 bg-[#8B7355] text-white text-sm rounded-lg hover:bg-[#6B5335] transition-colors flex items-center gap-1"
              >
                开始使用 <ArrowRight size={14} />
              </button>
            ) : (
              <button
                onClick={() => setStep(step + 1)}
                className="px-4 py-1.5 bg-[#8B7355] text-white text-sm rounded-lg hover:bg-[#6B5335] transition-colors flex items-center gap-1"
              >
                下一步 <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
