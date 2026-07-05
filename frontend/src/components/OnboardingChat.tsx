"use client";

import { useState, useEffect, useRef } from "react";
import { fetchAPI, streamChat } from "@/lib/api";
import { Send, Loader2, FileText } from "lucide-react";
import { MarkdownContent } from "@/components/MarkdownContent";

interface Props {
  sessionId: string;
  onComplete: () => void;
}

export function OnboardingChat({ sessionId, onComplete }: Props) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [showButtons, setShowButtons] = useState(false);
  const [hasReport, setHasReport] = useState(false); // 已有报告 → 禁用"继续聊聊"
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAPI(`/api/conversation/history?session_id=${sessionId}&scenario=onboarding`).then((r) => {
      if (r.ok && r.data?.length > 0) {
        setMessages(r.data);
        setInitialLoading(false);
        // 保持器：最后一条 AI 消息含 [ONBOARDING_COMPLETE] → 恢复按钮
        const lastAi = [...r.data].reverse().find((m: any) => m.role === "assistant");
        if (lastAi?.content?.includes("[ONBOARDING_COMPLETE]")) {
          setShowButtons(true);
          // 已有报告的用户回来，检查是否已有报告 → 禁用"继续聊聊"
          fetchAPI(`/api/report/list?session_id=${sessionId}`).then((r2) => {
            if (r2.ok && r2.data?.length > 0) setHasReport(true);
          });
        }
      } else {
        fetchAPI(`/api/onboarding/start?session_id=${sessionId}`).then((r2) => {
          if (r2.ok) {
            setMessages([{ role: "assistant", content: r2.data.content }]);
          }
          setInitialLoading(false);
        }).catch(() => setInitialLoading(false));
      }
    });
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || streaming) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setStreaming(true);

    let fullText = "";
    streamChat(
      "/api/onboarding/chat",
      { session_id: sessionId, message: userMsg },
      (chunk) => {
        fullText += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant-streaming") {
            return [...prev.slice(0, -1), { role: "assistant-streaming", content: fullText }];
          }
          return [...prev, { role: "assistant-streaming", content: fullText }];
        });
      },
      (extra) => {
        fullText = fullText.replace("[ONBOARDING_COMPLETE]", "").trim();
        setMessages((prev) => {
          const withoutStream = prev.filter((m) => m.role !== "assistant-streaming");
          return [...withoutStream, { role: "assistant", content: fullText }];
        });
        if (extra?.onboarding_complete) {
          setShowButtons(true);
          setAwaitingConfirm(false);
        }
        setStreaming(false);
      },
      (err) => {
        setMessages((prev) => [...prev, { role: "assistant", content: `[错误] ${err}` }]);
        setStreaming(false);
      }
    );
  }

  function handleContinueChat() {
    setShowButtons(false);
    setAwaitingConfirm(true);
    setStreaming(true);
    let fullText = "";
    streamChat(
      "/api/onboarding/chat",
      { session_id: sessionId, message: "[用户选择了继续聊聊。请回复：好的，我们继续吧～如果有需要补充的也可以直接说；觉得聊够了可以输入\"显示按钮\"来唤出下一步选项。]" },
      (chunk) => {
        fullText += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant-streaming") {
            return [...prev.slice(0, -1), { role: "assistant-streaming", content: fullText }];
          }
          return [...prev, { role: "assistant-streaming", content: fullText }];
        });
      },
      (extra) => {
        fullText = fullText.replace("[ONBOARDING_COMPLETE]", "").trim();
        setMessages((prev) => {
          const withoutStream = prev.filter((m) => m.role !== "assistant-streaming");
          return [...withoutStream, { role: "assistant", content: fullText }];
        });
        if (extra?.onboarding_complete) {
          setShowButtons(true);
          setAwaitingConfirm(false);
        }
        setStreaming(false);
      },
      (err) => {
        console.error(err);
        setStreaming(false);
      }
    );
  }

  function handleGoReport() {
    onComplete();
  }

  // 渲染消息时过滤标记
  const displayMessages = messages.map((m) => ({
    ...m,
    content: m.content.replace("[ONBOARDING_COMPLETE]", "").trim(),
  }));

  return (
    <div className="min-h-screen bg-[#F5F3EF] flex flex-col">
      <div className="bg-white border-b border-[#E8E4E0] py-4 px-6 text-center">
        <h2 className="text-lg font-semibold text-[#8B7355]">和派派聊一聊</h2>
        <p className="text-sm text-[#999]">让我更了解你</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 max-w-2xl mx-auto w-full">
        {initialLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 size={32} className="animate-spin text-[#D4A574]" />
            <p className="text-[#999] text-sm">派派正在准备中，请稍等片刻~</p>
          </div>
        ) : (
          displayMessages.map((msg, i) => (
            <div
              key={i}
              className={`mb-4 ${msg.role === "user" ? "text-right" : "text-left"}`}
            >
              <div
                className={`inline-block max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed text-left ${
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
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {showButtons && (
        <div className="flex justify-center gap-4 py-4 bg-white border-t border-[#E8E4E0]">
          <button
            onClick={handleGoReport}
            className="px-8 py-3 bg-[#8B7355] text-white rounded-xl hover:bg-[#6B5335] transition-colors flex items-center gap-2 font-medium"
          >
            <FileText size={18} /> 初步报告
          </button>
          {!hasReport && (
            <button
              onClick={handleContinueChat}
              className="px-8 py-3 border-2 border-[#8B7355] text-[#8B7355] rounded-xl hover:bg-[#F5F3EF] transition-colors font-medium"
            >
              继续聊聊
            </button>
          )}
        </div>
      )}

      <div className="bg-white border-t border-[#E8E4E0] py-4 px-6">
        <div className="max-w-2xl mx-auto flex gap-3">
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
            disabled={streaming || showButtons || initialLoading}
            rows={1}
            className="flex-1 px-4 py-3 border border-[#E8E4E0] rounded-xl focus:outline-none focus:border-[#D4A574] text-sm bg-[#F5F3EF] disabled:opacity-50 resize-none"
            placeholder={initialLoading ? "派派正在准备中，请稍等片刻~" : showButtons ? "请点击上方按钮选择" : "输入你的想法...（Enter 发送，Shift+Enter 换行）"}
          />
          <button
            onClick={handleSend}
            disabled={streaming || showButtons || initialLoading || !input.trim()}
            className="px-4 py-3 bg-[#8B7355] text-white rounded-xl hover:bg-[#6B5335] transition-colors disabled:opacity-50"
          >
            {streaming || initialLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <p className="text-center text-xs text-[#bbb] mt-2">
          内容由 AI 生成，仅供参考
        </p>
      </div>
    </div>
  );
}
