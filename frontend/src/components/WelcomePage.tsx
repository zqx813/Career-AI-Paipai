import { BookOpen, Check } from "lucide-react";

interface Props {
  onStart: () => void;
  hasResume?: boolean;
  hasChat?: boolean;
  hasReport?: boolean;
}

export function WelcomePage({ onStart, hasResume, hasChat, hasReport }: Props) {
  return (
    <div className="min-h-screen bg-[#F5F3EF] flex items-center justify-center">
      <div className="text-center max-w-lg px-8">
        <div className="mb-8 flex justify-center">
          <div className="w-20 h-20 rounded-2xl bg-[#8B7355] flex items-center justify-center shadow-lg">
            <BookOpen size={36} className="text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-[#2C2C2C] mb-4">
          {hasResume ? "欢迎回来" : "欢迎来到生涯助手"}
        </h1>
        <p className="text-lg text-[#666] mb-2">
          我是<span className="text-[#8B7355] font-semibold">派派</span>，你的生涯助手
        </p>
        {!hasResume && (
          <p className="text-base text-[#666] leading-relaxed mb-10">
            上传你的简历，我会先简单和你聊几句，然后生成你的专属生涯分析报告。
            整个过程大约 5-10 分钟。
          </p>
        )}
        {hasResume && (
          <div className="mb-10 space-y-2">
            <StatusItem done={true} label="简历已上传" />
            <StatusItem done={!!hasChat} label={hasChat ? "测评对话已完成" : "测评对话"} />
            <StatusItem done={!!hasReport} label={hasReport ? "初步报告已生成" : "初步报告"} />
          </div>
        )}
        <button
          onClick={onStart}
          className="px-10 py-4 bg-[#8B7355] text-white text-lg rounded-xl hover:bg-[#6B5335] transition-colors shadow-md"
        >
          {hasResume ? "继续" : "上传简历"}
        </button>
        <p className="mt-6 text-sm text-[#999]">
          需要邀请码才能使用，简历仅用于分析
        </p>
        <p className="mt-3 text-xs text-[#bbb]">
          内容由 AI 生成，仅供参考
        </p>
      </div>
    </div>
  );
}

function StatusItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 text-sm ${done ? "text-[#7B9E87]" : "text-[#999]"}`}>
      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${done ? "bg-[#7B9E87]" : "border border-[#ccc]"}`}>
        {done && <Check size={12} className="text-white" />}
      </div>
      {label}
    </div>
  );
}
