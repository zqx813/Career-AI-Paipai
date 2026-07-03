"use client";

import { useState, useEffect, useRef } from "react";
import { fetchAPI, streamChat } from "@/lib/api";
import { Send, Loader2, Trash2, List, Plus } from "lucide-react";
import { MarkdownContent } from "@/components/MarkdownContent";
import type { ResumeData, Thread, ChatMessage } from "@/lib/types";

const SCENARIO_LABELS: Record<string, string> = {
  career_exploration: "职业探索",
  skill_exploration: "技能发展",
  interview_coaching: "面试准备",
  task_recommendation: "任务推荐",
};

const NEW_THREAD = "__new__";

interface Props {
  sessionId: string;
  scenario: string;
  resume: ResumeData | null;
}

export function ChatWindow({ sessionId, scenario, resume }: Props) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string>(NEW_THREAD);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭管理弹窗
  useEffect(() => {
    if (!showManager) return;
    const handler = (e: MouseEvent) => {
      if (managerRef.current && !managerRef.current.contains(e.target as Node)) {
        setShowManager(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showManager]);

  // 加载线程列表，恢复上次活跃线程
  useEffect(() => {
    fetchAPI(`/api/conversation/threads?session_id=${sessionId}&scenario=${scenario}`)
      .then((r) => {
        if (r.ok && r.data?.length) {
          setThreads(r.data);
          // 恢复上次活跃线程
          const lastKey = `last_thread_${sessionId}_${scenario}`;
          const saved = localStorage.getItem(lastKey);
          const found = saved ? r.data.find((t: Thread) => t.thread_id === saved) : null;
          setCurrentThreadId(found ? found.thread_id : r.data[0].thread_id);
        } else {
          setThreads([]);
          setCurrentThreadId(NEW_THREAD);
        }
      });
  }, [sessionId, scenario]);

  // 切换线程时保存当前线程 + 加载历史
  useEffect(() => {
    if (currentThreadId === NEW_THREAD) {
      setMessages([]);
      return;
    }
    const lastKey = `last_thread_${sessionId}_${scenario}`;
    localStorage.setItem(lastKey, currentThreadId);
    fetchAPI(`/api/conversation/history?session_id=${sessionId}&scenario=${scenario}&thread_id=${currentThreadId}`)
      .then((r) => { if (r.ok) setMessages(r.data || []); });
  }, [sessionId, scenario, currentThreadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || streaming) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setStreaming(true);

    streamChat(
      "/api/conversation/send",
      {
        session_id: sessionId,
        scenario,
        message: userMsg,
        thread_id: currentThreadId === NEW_THREAD ? undefined : currentThreadId,
      },
      (chunk) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant-streaming") {
            return [...prev.slice(0, -1), { role: "assistant-streaming", content: last.content + chunk }];
          }
          return [...prev, { role: "assistant-streaming", content: chunk }];
        });
      },
      (extra) => {
        setMessages((prev) => {
          const withoutStream = prev.filter((m) => m.role !== "assistant-streaming");
          const streamMsg = prev.find((m) => m.role === "assistant-streaming");
          return streamMsg
            ? [...withoutStream, { role: "assistant", content: streamMsg.content }]
            : withoutStream;
        });
        // 新线程：更新 threadId + 刷新线程列表
        if (extra?.thread_id && currentThreadId === NEW_THREAD) {
          setCurrentThreadId(extra.thread_id);
          const refresh = () => fetchAPI(`/api/conversation/threads?session_id=${sessionId}&scenario=${scenario}`)
            .then((r) => { if (r.ok) setThreads(r.data); });
          refresh();
          // 标题在 done 之后异步生成，延迟再拉一次
          setTimeout(refresh, 2500);
        }
        setStreaming(false);
      },
      (err) => {
        setMessages((prev) => [...prev, { role: "assistant", content: `[错误] ${err}` }]);
        setStreaming(false);
      }
    );
  }

  async function handleDelete(threadId: string) {
    if (!confirm("确定删除此对话？对话内容将一并清除。")) return;
    await fetchAPI(`/api/conversation/thread?thread_id=${threadId}`, { method: "DELETE" });
    const remaining = threads.filter((t) => t.thread_id !== threadId);
    setThreads(remaining);
    // 如果删的是当前选中的，切到剩余最近
    if (threadId === currentThreadId) {
      setCurrentThreadId(remaining.length > 0 ? remaining[0].thread_id : NEW_THREAD);
    }
    if (remaining.length === 0) setShowManager(false);
  }

  const selectedValue = currentThreadId === NEW_THREAD ? NEW_THREAD : currentThreadId;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: scenario + thread selector + delete */}
      <div className="bg-white border-b border-[#E8E4E0] px-6 py-3 flex items-center gap-3">
        <h2 className="font-semibold text-[#2C2C2C] text-sm whitespace-nowrap">
          {SCENARIO_LABELS[scenario] || scenario}
        </h2>
        <div className="flex-1 flex items-center gap-2">
          <select
            value={selectedValue}
            onChange={(e) => setCurrentThreadId(e.target.value)}
            className="flex-1 px-3 py-1.5 border border-[#E8E4E0] rounded-lg text-sm bg-[#F5F3EF] focus:outline-none focus:border-[#D4A574] max-w-[320px]"
          >
            {currentThreadId === NEW_THREAD && (
              <option value={NEW_THREAD} disabled>新对话</option>
            )}
            {threads.map((t) => (
              <option key={t.thread_id} value={t.thread_id}>
                {t.title || "新对话"}
              </option>
            ))}
          </select>
          <button
            onClick={() => { if (currentThreadId !== NEW_THREAD) setCurrentThreadId(NEW_THREAD); }}
            disabled={currentThreadId === NEW_THREAD}
            className="p-1.5 text-[#8B7355] hover:bg-[#E8E4E0] rounded-lg disabled:opacity-30 transition-colors flex-shrink-0"
            title="新建对话"
          >
            <Plus size={16} />
          </button>
          <div className="relative" ref={managerRef}>
            <button
              onClick={() => setShowManager(!showManager)}
              disabled={threads.length === 0}
              className="p-1.5 text-[#999] hover:text-[#8B7355] disabled:opacity-30 transition-colors"
              title="管理对话"
            >
              <List size={16} />
            </button>
            {showManager && threads.length > 0 && (
              <div className="absolute right-0 top-8 z-50 bg-white rounded-xl shadow-lg border border-[#E8E4E0] py-2 min-w-[240px]">
                <p className="px-3 py-1 text-xs text-[#999]">管理对话</p>
                {threads.map((t) => (
                  <div
                    key={t.thread_id}
                    className="flex items-center justify-between px-3 py-1.5 hover:bg-[#F5F3EF]"
                  >
                    <span className="text-sm text-[#2C2C2C] truncate flex-1 mr-2">
                      {t.title || "新对话"}
                    </span>
                    <button
                      onClick={() => handleDelete(t.thread_id)}
                      className="text-[#999] hover:text-red-500 transition-colors flex-shrink-0"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 && (
          <div className="text-center py-20 text-[#999]">
            <p className="text-lg mb-2">开始和派派的对话</p>
            <p className="text-sm">在下方输入你的问题或想法</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`mb-4 ${msg.role === "user" ? "text-right" : "text-left"}`}
          >
            <div
              className={`inline-block max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed text-left ${
                msg.role === "user"
                  ? "bg-[#E8E4E0] text-[#2C2C2C]"
                  : "bg-[#D4A574] text-white"
              }`}
            >
              {msg.role === "assistant-streaming" ? (
                <span className="whitespace-pre-wrap">{msg.content}</span>
              ) : (
                <MarkdownContent content={msg.content} variant={msg.role === "user" ? "light" : "dark"} />
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-[#E8E4E0] py-4 px-6">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入你的想法...（Enter 发送，Shift+Enter 换行）"
            disabled={streaming}
            rows={1}
            className="flex-1 px-4 py-3 border border-[#E8E4E0] rounded-xl focus:outline-none focus:border-[#D4A574] text-sm bg-[#F5F3EF] disabled:opacity-50 resize-none"
          />
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim()}
            className="px-4 py-3 bg-[#8B7355] text-white rounded-xl hover:bg-[#6B5335] transition-colors disabled:opacity-50"
          >
            {streaming ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <p className="text-center text-xs text-[#bbb] mt-2">
          内容由 AI 生成，仅供参考
        </p>
      </div>
    </div>
  );
}
