"use client";

import { useState, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import { Loader2, Target, Zap, Lightbulb, Map, ExternalLink, MessageSquare, Send } from "lucide-react";
import { streamChat } from "@/lib/api";
import { MarkdownContent } from "@/components/MarkdownContent";
import type { ReportData } from "@/lib/types";

interface Props {
  sessionId: string;
  isPreliminary: boolean;
  onEnterMain: () => void;
}

export function ReportView({ sessionId, isPreliminary, onEnterMain }: Props) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportList, setReportList] = useState<{ id: number; target_position: string; match_score: number; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [targetPosition, setTargetPosition] = useState("");
  const [roadmapChatOpen, setRoadmapChatOpen] = useState(false);
  const [roadmapMsgs, setRoadmapMsgs] = useState<{ role: string; content: string }[]>([]);
  const [roadmapThreadId, setRoadmapThreadId] = useState("");
  const [roadmapInput, setRoadmapInput] = useState("");
  const [roadmapStreaming, setRoadmapStreaming] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    fetchAPI(`/api/report/list?session_id=${sessionId}`).then((r) => {
      if (r.ok && r.data?.length) {
        setReportList(r.data);
        // 加载最新（第一条）
        const latest = r.data[0];
        fetchAPI(`/api/report/${latest.id}?session_id=${sessionId}`).then((r2) => {
          if (r2.ok && r2.data) setReport(r2.data);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, [sessionId]);

  function switchReport(reportId: number) {
    setLoading(true);
    setRoadmapMsgs([]);
    setRoadmapThreadId("");
    setRoadmapChatOpen(false);
    setRoadmapInput("");
    fetchAPI(`/api/report/${reportId}?session_id=${sessionId}`).then((r) => {
      if (r.ok && r.data) setReport(r.data);
      setLoading(false);
    });
  }

  function openRoadmapChat() {
    setRoadmapChatOpen(true);
    if (roadmapMsgs.length === 0) {
      const params = roadmapThreadId
        ? `session_id=${sessionId}&scenario=roadmap_chat&thread_id=${roadmapThreadId}`
        : `session_id=${sessionId}&scenario=roadmap_chat`;
      fetchAPI(`/api/conversation/history?${params}`).then((r) => {
        if (r.ok && r.data?.length) {
          setRoadmapMsgs(r.data.map((m: any) => {
            let text = m.content.replace("[ROADMAP_UPDATED]", "");
            if (m.role === "user") {
              const idx = text.indexOf("用户想修改路线图：");
              if (idx >= 0) text = text.slice(idx + "用户想修改路线图：".length);
            }
            return { role: m.role, content: text.trim() };
          }));
        } else {
          setRoadmapMsgs([{ role: "assistant", content: "好的，我已经了解了你的当前学习路线。你想怎么调整？比如增减步骤、调整顺序、更换资源，或者有其他约束条件想告诉我？" }]);
        }
      });
    }
  }

  function handleRoadmapSend() {
    if (!roadmapInput.trim() || roadmapStreaming) return;
    const msg = roadmapInput.trim();
    setRoadmapInput("");
    setRoadmapMsgs((prev) => [...prev, { role: "user", content: msg }]);
    setRoadmapStreaming(true);

    // 把当前路线图作为上下文注入首条用户消息
    const ctxMsg = report
      ? `[当前路线图上下文：${report.roadmap?.title || ''}，步骤：${JSON.stringify(report.roadmap?.steps || [])}]\n\n用户想修改路线图：${msg}`
      : msg;

    streamChat(
      "/api/conversation/send",
      { session_id: sessionId, scenario: "roadmap_chat", message: ctxMsg },
      (chunk) => {
        setRoadmapMsgs((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant-streaming") {
            return [...prev.slice(0, -1), { role: "assistant-streaming", content: last.content + chunk }];
          }
          return [...prev, { role: "assistant-streaming", content: chunk }];
        });
      },
      (extra) => {
        if (extra?.thread_id && !roadmapThreadId) {
          setRoadmapThreadId(extra.thread_id);
        }
        setRoadmapMsgs((prev) => {
          const cleaned = prev.map((m) => {
            if (m.role !== "assistant-streaming") return m;
            // 检测 [ROADMAP_UPDATED] 标记，有则触发持久化
            if (m.content.includes("[ROADMAP_UPDATED]")) {
              const displayContent = m.content.replace("[ROADMAP_UPDATED]", "").trim();
              const msgs = [...prev.filter((x) => x.role !== "assistant-streaming"),
                { role: "assistant" as const, content: displayContent }];
              fetchAPI("/api/report/sync-roadmap", {
                method: "PUT",
                body: JSON.stringify({ session_id: sessionId, messages: msgs, report_id: report?.id }),
              }).then((r) => {
                if (r.ok && r.data) {
                  setReport((prev) => prev ? { ...prev, roadmap: r.data } : prev);
                }
              });
              return { role: "assistant" as const, content: displayContent };
            }
            return { role: "assistant" as const, content: m.content };
          });
          return cleaned;
        });
        setRoadmapStreaming(false);
      },
      (err) => {
        setRoadmapMsgs((prev) => [...prev, { role: "assistant", content: `[错误] ${err}` }]);
        setRoadmapStreaming(false);
      }
    );
  }

  async function handleGenerate() {
    if (!targetPosition.trim()) {
      setError("请输入目标岗位");
      return;
    }
    setGenerating(true);
    setError("");
    const r = await fetchAPI("/api/report/generate", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, target_position: targetPosition.trim() }),
    });
    if (r.ok && r.data) {
      setReport({ ...r.data, target_position: targetPosition.trim() } as ReportData);
      setRoadmapMsgs([]);
      setRoadmapChatOpen(false);
      setRoadmapInput("");
      setTargetPosition("");
      // 刷新历史列表
      fetchAPI(`/api/report/list?session_id=${sessionId}`).then((r2) => {
        if (r2.ok) setReportList(r2.data);
      });
    }
    setGenerating(false);
  }

  if (loading) {
    return (
      <div className={`${isPreliminary ? "min-h-screen" : "h-full"} bg-[#F5F3EF] flex items-center justify-center`}>
        <div className="text-center">
          <Loader2 size={48} className="animate-spin mx-auto mb-4 text-[#8B7355]" />
          <p className="text-[#666]">加载中...</p>
        </div>
      </div>
    );
  }

  if (generating) {
    return (
      <div className={`${isPreliminary ? "min-h-screen" : "h-full"} bg-[#F5F3EF] flex items-center justify-center`}>
        <div className="text-center">
          <Loader2 size={48} className="animate-spin mx-auto mb-4 text-[#8B7355]" />
          <p className="text-[#666]">派派正在生成分析报告...</p>
        </div>
      </div>
    );
  }

  // 无报告 + 不是初步报告 → 直接显示生成表单
  if (!report && !isPreliminary) {
    return (
      <div className="h-full bg-[#F5F3EF] flex items-center justify-center">
        <div className="max-w-lg w-full mx-4 bg-white rounded-2xl p-8 shadow-sm border border-[#E8E4E0]">
          <h2 className="text-xl font-bold text-[#2C2C2C] mb-2">生成分析报告</h2>
          <p className="text-sm text-[#999] mb-6">输入你的目标岗位，派派为你分析匹配度和发展路径</p>
          <input
            value={targetPosition}
            onChange={(e) => setTargetPosition(e.target.value)}
            placeholder="例如：产品经理、数据分析师..."
            className="w-full px-4 py-3 border border-[#E8E4E0] rounded-xl mb-4 focus:outline-none focus:border-[#D4A574]"
          />
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <button
            onClick={handleGenerate}
            className="w-full py-3 bg-[#8B7355] text-white rounded-xl hover:bg-[#6B5335] transition-colors font-medium"
          >
            生成报告
          </button>
        </div>
      </div>
    );
  }

  // 初步报告页：无报告则显示输入界面
  if (!report && isPreliminary) {
    return (
      <div className="min-h-screen bg-[#F5F3EF] flex items-center justify-center">
        <div className="max-w-lg w-full mx-4">
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-[#E8E4E0] mb-6">
            <h2 className="text-xl font-bold text-[#2C2C2C] mb-2">生成初步报告</h2>
            <p className="text-sm text-[#999] mb-6">
              告诉我你想投的目标岗位，派派马上为你分析
            </p>
            <input
              value={targetPosition}
              onChange={(e) => setTargetPosition(e.target.value)}
              placeholder="例如：产品经理、数据分析师..."
              className="w-full px-4 py-3 border border-[#E8E4E0] rounded-xl mb-4 focus:outline-none focus:border-[#D4A574]"
            />
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
            <button
              onClick={handleGenerate}
              disabled={!targetPosition.trim()}
              className="w-full py-3 bg-[#8B7355] text-white rounded-xl hover:bg-[#6B5335] transition-colors font-medium disabled:opacity-50"
            >
              生成报告
            </button>
            <p className="text-xs text-[#999] mt-4 text-center">
              生成过程中请稍候，派派正在结合你的简历和画像进行分析
            </p>
          </div>

          <div className="text-center">
            <p className="text-sm text-[#999] mb-3">还没有确定目标岗位？</p>
            <button
              onClick={onEnterMain}
              className="text-[#8B7355] underline hover:text-[#6B5335] transition-colors"
            >
              直接进入
            </button>
            <p className="text-xs text-[#999] mt-2">
              进入后可以和派派聊聊，帮你一起探索方向
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 有报告 → 展示
  return (
    <div className={`${isPreliminary ? "min-h-screen" : "h-full"} bg-[#F5F3EF] overflow-y-auto`}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-[#2C2C2C]">
            {isPreliminary ? "初步报告" : "生涯分析报告"}
          </h1>
          {!isPreliminary && (
            <button
              onClick={() => { setReport(null); setRoadmapMsgs([]); setRoadmapThreadId(""); setRoadmapChatOpen(false); setRoadmapInput(""); }}
              className="px-3 py-1.5 text-sm border border-[#8B7355] text-[#8B7355] rounded-lg hover:bg-[#F5F3EF] transition-colors"
            >
              新建报告
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 mb-8">
          {!isPreliminary && reportList.length > 1 ? (
            <select
              value={report?.id || ""}
              onChange={(e) => switchReport(Number(e.target.value))}
              className="text-sm border border-[#E8E4E0] rounded-lg px-3 py-1.5 bg-white text-[#2C2C2C] focus:outline-none focus:border-[#D4A574]"
            >
              {reportList.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.target_position} {formatDate(r.created_at)} · {r.match_score}%
                </option>
              ))}
            </select>
          ) : (
            <p className="text-[#999]">
              目标岗位：{report?.target_position}
            </p>
          )}
        </div>

        {report && (
          <>
            {/* 匹配度卡片 */}
            <Card icon={<Target />} title="匹配度评估" accent>
              <div className="flex items-center gap-4 mb-3">
                <div className="text-4xl font-bold text-[#8B7355]">
                  {report.match_score}%
                </div>
                <div className="text-sm text-[#666]">{report.match_summary}</div>
              </div>
            </Card>

            {/* 技能缺口 */}
            <Card icon={<Zap />} title="技能缺口" accent>
              {report.skill_gaps?.map((g, i) => (
                <div key={i} className="mb-3 pb-3 border-b border-[#F5F3EF] last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-[#2C2C2C]">{g.skill}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      g.gap_level === "核心差距" ? "bg-red-100 text-red-600" :
                      g.gap_level === "补充差距" ? "bg-yellow-100 text-yellow-700" :
                      "bg-green-100 text-green-600"
                    }`}>{g.gap_level}</span>
                  </div>
                  <p className="text-sm text-[#666]">{g.description}</p>
                  {g.source && <SourceTag text={g.source} />}
                </div>
              ))}
            </Card>

            {/* 推荐方向 */}
            <Card icon={<Lightbulb />} title="推荐方向" accent>
              {report.recommended_directions?.map((d, i) => (
                <div key={i} className="mb-2">
                  <span className="text-sm font-medium text-[#2C2C2C]">{d.direction}</span>
                  <span className="text-sm text-[#666]"> — {d.reason}</span>
                  {d.source && <SourceTag text={d.source} />}
                </div>
              ))}
            </Card>

            {/* 可视化规划线 */}
            <Card icon={<Map />} title={report.roadmap?.title || "学习路径"}>
              <div className="relative pl-6 border-l-2 border-[#D4A574]">
                {report.roadmap?.steps?.map((step) => (
                  <div key={step.order} className="mb-6 last:mb-0 relative">
                    <div className="absolute -left-[25px] w-3 h-3 rounded-full bg-[#D4A574] border-2 border-white" />
                    <div className="text-sm font-medium text-[#2C2C2C] mb-1">
                      {step.order}. {step.title}
                    </div>
                    <div className="text-sm text-[#666]">{step.description}</div>
                    <div className="flex gap-3 mt-1">
                      <span className="text-xs text-[#7B9E87]">{step.duration}</span>
                      {step.resources?.map((r, i) => (
                        <span key={i} className="text-xs text-[#8B7355]">{r}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {!isPreliminary && !roadmapChatOpen && (
                <button
                  onClick={openRoadmapChat}
                  className="mt-4 px-4 py-2 border border-[#8B7355] text-[#8B7355] text-sm rounded-lg hover:bg-[#F5F3EF] transition-colors flex items-center gap-1"
                >
                  <MessageSquare size={14} /> 对话修改路线图
                </button>
              )}
              {roadmapChatOpen && (
                <div className="mt-4 border border-[#E8E4E0] rounded-xl overflow-hidden">
                  <div className="bg-[#F5F3EF] px-4 py-3 border-b border-[#E8E4E0] flex items-center justify-between">
                    <span className="text-sm font-medium text-[#2C2C2C]">修改路线图</span>
                    <button
                      onClick={() => setRoadmapChatOpen(false)}
                      className="text-xs text-[#999] hover:text-[#666]"
                    >
                      收起
                    </button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto px-4 py-3 space-y-3">
                    {roadmapMsgs.map((msg, i) => (
                      <div key={i} className={`text-sm ${msg.role === "user" || msg.role === "assistant-streaming" ? "" : ""}`}>
                        {msg.role === "user" ? (
                          <div className="text-right">
                            <span className="inline-block bg-[#E8E4E0] text-[#2C2C2C] px-3 py-2 rounded-xl max-w-[80%] whitespace-pre-wrap text-left">
                              <MarkdownContent content={msg.content} variant="light" />
                            </span>
                          </div>
                        ) : msg.role === "assistant-streaming" ? (
                          <div>
                            <span className="inline-block bg-[#D4A574] text-white px-3 py-2 rounded-xl max-w-[80%] whitespace-pre-wrap">
                              {msg.content}
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="inline-block bg-[#D4A574] text-white px-3 py-2 rounded-xl max-w-[80%]">
                              <MarkdownContent content={msg.content} variant="dark" />
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                    {roadmapStreaming && (
                      <div className="text-sm">
                        <Loader2 size={14} className="animate-spin inline text-[#8B7355]" />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 px-4 py-3 border-t border-[#E8E4E0]">
                    <textarea
                      value={roadmapInput}
                      onChange={(e) => {
                        setRoadmapInput(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = e.target.scrollHeight + "px";
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleRoadmapSend();
                        }
                      }}
                      placeholder="告诉派派你想怎么改...（Enter 发送，Shift+Enter 换行）"
                      disabled={roadmapStreaming}
                      rows={1}
                      className="flex-1 px-3 py-2 border border-[#E8E4E0] rounded-lg text-sm focus:outline-none focus:border-[#D4A574] disabled:opacity-50 resize-none"
                    />
                    <button
                      onClick={handleRoadmapSend}
                      disabled={roadmapStreaming || !roadmapInput.trim()}
                      className="px-3 py-2 bg-[#8B7355] text-white rounded-lg text-sm hover:bg-[#6B5335] disabled:opacity-50"
                    >
                      {roadmapStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </div>
                </div>
              )}
            </Card>

            {/* 来源引用 */}
            {report.sources?.length > 0 && (
              <Card icon={<ExternalLink />} title="参考来源">
                {report.sources.map((s, i) => (
                  <div key={i} className="text-xs text-[#999] mb-1">
                    [{s.type}] {s.content}
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        <p className="text-center text-xs text-[#bbb] mt-8">
          内容由 AI 生成，仅供参考
        </p>

        {isPreliminary && (
          <div className="mt-6 bg-[#FFF8E7] rounded-2xl p-6 border border-[#D4A574] text-center">
            <p className="text-[#8B7355] font-medium mb-4">
              这只是初步报告。进入完整工具体验更多功能。
            </p>
            <button
              onClick={onEnterMain}
              className="px-8 py-3 bg-[#8B7355] text-white rounded-xl hover:bg-[#6B5335] transition-colors font-medium"
            >
              直接进入
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ icon, title, children, accent }: {
  icon: React.ReactNode; title: string; children: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl p-6 mb-4 shadow-sm border ${
      accent ? "border-l-4 border-l-[#D4A574]" : "border-[#E8E4E0]"
    }`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[#8B7355]">{icon}</span>
        <h3 className="font-semibold text-[#2C2C2C]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SourceTag({ text }: { text: string }) {
  return (
    <span className="inline-block mt-1 text-xs text-[#999] bg-[#F5F3EF] px-2 py-0.5 rounded">
      📊 {text}
    </span>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
