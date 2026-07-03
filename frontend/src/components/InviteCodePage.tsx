"use client";

import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { fetchAPI } from "@/lib/api";

interface Props {
  sessionId: string;
  onVerified: () => void;
}

export function InviteCodePage({ sessionId, onVerified }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError("请输入邀请码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const r = await fetchAPI("/api/auth/verify-invite", {
        method: "POST",
        body: JSON.stringify({ session_id: sessionId, code: trimmed }),
      });
      if (r.ok && r.data?.valid) {
        onVerified();
      } else {
        setError(r.error || "邀请码无效或已被使用");
      }
    } catch {
      setError("网络错误，请重试");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F5F3EF] flex items-center justify-center">
      <div className="text-center max-w-md px-8">
        <div className="mb-8 flex justify-center">
          <div className="w-20 h-20 rounded-2xl bg-[#8B7355] flex items-center justify-center shadow-lg">
            <BookOpen size={36} className="text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-[#2C2C2C] mb-2">生涯助手</h1>
        <p className="text-lg text-[#666] mb-8">
          欢迎来到<span className="text-[#8B7355] font-semibold">派派</span>的生涯规划空间
        </p>

        <div className="mb-6">
          <input
            type="text"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") handleVerify(); }}
            placeholder="输入你的邀请码"
            autoFocus
            className={`w-full px-4 py-3 text-center text-lg border-2 rounded-xl bg-white
              focus:outline-none focus:ring-2 focus:ring-[#8B7355] transition-colors
              ${error ? "border-red-400" : "border-[#D4A574]"}`}
          />
          {error && (
            <p className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <button
          onClick={handleVerify}
          disabled={loading}
          className="px-10 py-4 bg-[#8B7355] text-white text-lg rounded-xl
            hover:bg-[#6B5335] transition-colors shadow-md
            disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 size={18} className="animate-spin" />
              验证中...
            </span>
          ) : (
            "开始探索"
          )}
        </button>

        <p className="mt-6 text-sm text-[#999]">
          没有邀请码？联系研究者获取
        </p>
        <p className="mt-3 text-xs text-[#bbb]">
          内容由 AI 生成，仅供参考
        </p>
      </div>
    </div>
  );
}
