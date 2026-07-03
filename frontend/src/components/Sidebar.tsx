import { MessageSquare, FileText, Brain, Compass, BookOpen, FileBarChart, TrendingUp, Briefcase, Lightbulb } from "lucide-react";

const SCENARIOS = [
  { key: "career_exploration", label: "职业探索", icon: Compass, desc: "迷茫时探索方向" },
  { key: "skill_exploration", label: "技能发展", icon: TrendingUp, desc: "分析技能差距" },
  { key: "interview_coaching", label: "面试准备", icon: Briefcase, desc: "模拟面试练习" },
  { key: "task_recommendation", label: "任务推荐", icon: Lightbulb, desc: "竞赛/项目/实习" },
];

interface Props {
  currentPage: string;
  scenario: string;
  onNavigate: (page: string) => void;
  onScenarioChange: (scenario: string) => void;
}

export function Sidebar({ currentPage, scenario, onNavigate, onScenarioChange }: Props) {
  return (
    <aside className="w-56 bg-[#F5F3EF] border-r-2 border-[#8B7355] flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[#D4A574]/30">
        <div className="flex items-center gap-2">
          <BookOpen size={20} className="text-[#8B7355]" />
          <span className="font-semibold text-[#8B7355] text-sm">生涯助手</span>
        </div>
        <p className="text-xs text-[#999] mt-1">派派 · 你的生涯助手</p>
      </div>

      {/* 导航 */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        <NavItem icon={MessageSquare} label="对话" active={currentPage === "chat"} onClick={() => onNavigate("chat")} />
        <NavItem icon={FileText} label="简历" active={currentPage === "resume"} onClick={() => onNavigate("resume")} />
        <NavItem icon={FileBarChart} label="分析报告" active={currentPage === "report"} onClick={() => onNavigate("report")} />
        <NavItem icon={Brain} label="AI记忆" active={currentPage === "memory"} onClick={() => onNavigate("memory")} />

        <div className="pt-3 pb-1">
          <p className="text-xs text-[#999] px-3 mb-1">场景选择</p>
        </div>
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            onClick={() => onScenarioChange(s.key)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
              scenario === s.key && currentPage === "chat"
                ? "bg-[#8B7355] text-white"
                : "text-[#2C2C2C] hover:bg-[#E8E4E0]"
            }`}
          >
            <s.icon size={16} />
            <div>
              <div className="font-medium">{s.label}</div>
              <div className="text-xs opacity-70">{s.desc}</div>
            </div>
          </button>
        ))}
      </nav>

      {/* 底部 */}
      <div className="px-4 py-3 border-t border-[#D4A574]/30">
        <p className="text-xs text-[#999]">派派已记住你的简历和画像</p>
      </div>
    </aside>
  );
}

function NavItem({ icon: Icon, label, active, onClick }: {
  icon: React.ElementType; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
        active ? "bg-[#8B7355] text-white" : "text-[#2C2C2C] hover:bg-[#E8E4E0]"
      }`}
    >
      <Icon size={16} />
      <span className="font-medium">{label}</span>
    </button>
  );
}
