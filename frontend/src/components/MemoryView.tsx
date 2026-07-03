"use client";

import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import { Brain, Send, Trash2, Loader2, Undo, RefreshCw } from "lucide-react";
import type { MemoryData } from "@/lib/types";

const FIELDS: { key: keyof MemoryData; label: string }[] = [
  { key: "career_interests", label: "职业兴趣方向" },
  { key: "skills_self_assessment", label: "技能自评" },
  { key: "values_field", label: "价值观倾向" },
  { key: "current_stage", label: "当前阶段" },
  { key: "target_position", label: "目标岗位" },
  { key: "concerns", label: "顾虑与困惑" },
  { key: "free_notes", label: "自由备注" },
];

interface Props {
  sessionId: string;
  memories: MemoryData | null;
  onUpdate: (m: MemoryData) => void;
}

export function MemoryView({ sessionId, memories: parentMemories, onUpdate }: Props) {
  const [memories, setMemories] = useState<MemoryData | null>(parentMemories);
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());
  const [instruction, setInstruction] = useState("");
  const [modifying, setModifying] = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [loading, setLoading] = useState(!parentMemories);

  useEffect(() => {
    if (parentMemories && Object.values(parentMemories).some((v) => v)) {
      setMemories(parentMemories);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAPI(`/api/memory/get?session_id=${sessionId}`).then((r) => {
      if (r.ok && r.data && Object.values(r.data).some((v) => v)) {
        setMemories(r.data);
        onUpdate(r.data);
      }
      setLoading(false);
    });
  }, [sessionId, parentMemories]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#F5F3EF]">
        <Loader2 size={32} className="animate-spin text-[#8B7355]" />
      </div>
    );
  }

  if (!memories || Object.values(memories).every((v) => !v)) {
    return (
      <div className="h-full flex items-center justify-center bg-[#F5F3EF]">
        <div className="text-center max-w-md">
          <Brain size={48} className="mx-auto mb-4 text-[#8B7355]" />
          <h2 className="text-xl font-semibold text-[#8B7355] mb-2">还没有 AI 记忆</h2>
          <p className="text-sm text-[#666] leading-relaxed">
            派派会在你对话时自动提取关键信息，形成对你的长期画像。
            完成 onboarding 引导或在辅导场景中对话 5 轮以上即可触发。
          </p>
        </div>
      </div>
    );
  }

  async function handleModify() {
    if (!instruction.trim() || modifying) return;
    setModifying(true);
    const r = await fetchAPI("/api/memory/modify", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, instruction: instruction.trim() }),
    });
    if (r.ok && r.data) {
      setMemories(r.data);
      onUpdate(r.data);
      setModifiedFields((prev) => {
        const next = new Set(prev);
        (r.changed_fields || []).forEach((f: string) => next.add(f));
        return next;
      });
      setInstruction("");
    } else {
      alert(r.error || "修改失败");
    }
    setModifying(false);
  }

  async function handleUndo() {
    const r = await fetchAPI(`/api/memory/undo?session_id=${sessionId}`, { method: "POST" });
    if (r.ok && r.data) {
      setMemories(r.data);
      onUpdate(r.data);
      setModifiedFields(new Set());
    } else {
      alert(r.error || "没有可撤销的修改");
    }
  }

  async function handleReExtract() {
    if (!confirm("将从全部对话历史重新提取记忆，当前记忆将被覆盖。确认？")) return;
    setReExtracting(true);
    const r = await fetchAPI(`/api/memory/re-extract?session_id=${sessionId}`, { method: "POST" });
    if (r.ok && r.data) {
      setMemories(r.data);
      onUpdate(r.data);
      setModifiedFields(new Set());
    } else {
      alert(r.error || "重新提取失败");
    }
    setReExtracting(false);
  }

  async function handleClear() {
    if (!confirm("确定要清空所有记忆吗？")) return;
    await fetchAPI(`/api/memory/clear?session_id=${sessionId}`, { method: "POST" });
    setMemories(null);
    onUpdate({} as MemoryData);
  }

  return (
    <div className="h-full overflow-y-auto bg-[#F5F3EF]">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#2C2C2C]">AI 记忆</h2>
          <button
            onClick={handleClear}
            className="text-xs text-[#bbb] hover:text-red-400 flex items-center gap-1 transition-colors"
          >
            <Trash2 size={14} /> 清空
          </button>
        </div>

        {FIELDS.map(({ key, label }) => {
          const value = memories?.[key] || "";
          return (
            <div key={key} className={`bg-white rounded-xl p-4 mb-3 border border-[#E8E4E0] ${
              modifiedFields.has(key) ? "border-l-[3px] border-l-[#D4A574]" : ""
            }`}>
              <span className="font-medium text-[#2C2C2C] text-sm block mb-2">{label}</span>
              <p className="text-sm text-[#666] whitespace-pre-wrap leading-relaxed">
                {value || <span className="text-[#ccc]">（待提取）</span>}
              </p>
            </div>
          );
        })}

        {/* 修改指令区 */}
        <div className="mt-6 bg-white rounded-xl p-4 border border-[#E8E4E0]">
          <p className="text-xs text-[#999] mb-2">
            告诉派派你想如何修改记忆，例如：「把目标岗位改成前端架构师」「我在自学 Rust，加到技能自评里」
          </p>
          <div className="flex gap-2">
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleModify()}
              placeholder="输入修改指令..."
              disabled={modifying || reExtracting}
              className="flex-1 px-3 py-2 border border-[#E8E4E0] rounded-lg text-sm focus:outline-none focus:border-[#D4A574] disabled:opacity-50"
            />
            <button
              onClick={handleModify}
              disabled={modifying || reExtracting || !instruction.trim()}
              className="px-4 py-2 bg-[#8B7355] text-white rounded-lg text-sm hover:bg-[#6B5335] transition-colors disabled:opacity-50 flex items-center gap-1"
            >
              {modifying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              发送
            </button>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleUndo}
              disabled={reExtracting}
              className="px-3 py-1 text-sm text-[#999] hover:text-[#666] disabled:opacity-30 flex items-center gap-1"
            >
              <Undo size={12} /> 撤销修改
            </button>
            <button
              onClick={handleReExtract}
              disabled={reExtracting}
              className="px-3 py-1 text-sm text-[#999] hover:text-[#666] disabled:opacity-30 flex items-center gap-1"
            >
              {reExtracting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              重新生成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
