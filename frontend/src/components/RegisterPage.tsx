"use client";

import { useState } from "react";
import { BookOpen, Loader2 } from "lucide-react";
import { registerAPI, setToken, setStoredSessionId } from "@/lib/api";

interface Props {
  onLogin: (sessionId: string) => void;
  onSwitchToLogin: () => void;
}

export function RegisterPage({ onLogin, onSwitchToLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim() || !inviteCode.trim()) return;
    if (username.trim().length < 3) {
      setError("用户名至少 3 个字符");
      return;
    }
    if (password.length < 6) {
      setError("密码至少 6 个字符");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await registerAPI(username.trim(), password, inviteCode.trim());
      if (res.ok) {
        setToken(res.data.token);
        setStoredSessionId(res.data.session_id);
        onLogin(res.data.session_id);
      } else {
        setError(res.error || "注册失败");
      }
    } catch (err: any) {
      setError(err.message || "网络错误，请重试");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#F5F3EF] flex items-center justify-center">
      <div className="text-center max-w-md px-8 w-full">
        <div className="mb-8 flex justify-center">
          <div className="w-20 h-20 rounded-2xl bg-[#8B7355] flex items-center justify-center shadow-lg">
            <BookOpen size={36} className="text-white" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-[#2C2C2C] mb-2">创建账号</h1>
        <p className="text-[#666] mb-8">需要邀请码才能注册</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="用户名（至少3个字符）"
            disabled={loading}
            className="w-full px-4 py-3 border border-[#E8E4E0] rounded-xl focus:outline-none focus:border-[#D4A574] text-sm bg-white disabled:opacity-50"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码（至少6个字符）"
            disabled={loading}
            className="w-full px-4 py-3 border border-[#E8E4E0] rounded-xl focus:outline-none focus:border-[#D4A574] text-sm bg-white disabled:opacity-50"
          />
          <input
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="邀请码"
            disabled={loading}
            className="w-full px-4 py-3 border border-[#E8E4E0] rounded-xl focus:outline-none focus:border-[#D4A574] text-sm bg-white disabled:opacity-50"
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !username.trim() || !password.trim() || !inviteCode.trim()}
            className="w-full px-10 py-4 bg-[#8B7355] text-white text-lg rounded-xl hover:bg-[#6B5335] transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            注册
          </button>
        </form>

        <p className="mt-6 text-sm text-[#999]">
          已有账号？{" "}
          <button onClick={onSwitchToLogin} className="text-[#8B7355] hover:underline font-medium">
            登录
          </button>
        </p>
        <p className="mt-3 text-xs text-[#bbb]">内容由 AI 生成，仅供参考</p>
      </div>
    </div>
  );
}
