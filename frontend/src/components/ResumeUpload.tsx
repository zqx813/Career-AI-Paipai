"use client";

import { useState, useRef, useEffect } from "react";
import { fetchAPI } from "@/lib/api";
import { Loader2, Upload, Check, ArrowRight } from "lucide-react";
import type { ResumeData } from "@/lib/types";

interface Props {
  sessionId: string;
  onDone: (data: ResumeData) => void;
}

export function ResumeUpload({ sessionId, onDone }: Props) {
  const [step, setStep] = useState<"upload" | "parsing" | "review" | "done">("upload");
  const [data, setData] = useState<ResumeData | null>(null);
  const [error, setError] = useState("");
  const [isExisting, setIsExisting] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // 检查是否已有简历（中断恢复）
  useEffect(() => {
    fetchAPI(`/api/resume/get?session_id=${sessionId}`).then((r) => {
      if (r.ok && r.data) {
        setData(r.data);
        setStep("review");
        setIsExisting(true);
      }
      setInitialLoading(false);
    });
  }, [sessionId]);

  async function handleUpload(file: File) {
    setStep("parsing");
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("session_id", sessionId);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/resume/upload`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (json.ok) {
        setData(json.data);
        setStep("review");
      } else {
        setError(json.error || "解析失败");
        setStep("upload");
      }
    } catch {
      setError("网络错误，请重试");
      setStep("upload");
    }
  }

  async function handleConfirm() {
    if (!data) return;
    await fetchAPI("/api/resume/update", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, ...data, confirmed: true }),
    });
    setStep("done");
  }

  return (
    <div className="min-h-screen bg-[#F5F3EF] flex items-center justify-center">
      <div className="max-w-2xl w-full mx-4">
        <h2 className="text-2xl font-bold text-[#2C2C2C] text-center mb-8">
          {step === "upload" && "上传你的简历"}
          {step === "parsing" && "正在解析..."}
          {step === "review" && "确认解析结果"}
          {step === "done" && "解析完成"}
        </h2>

        {initialLoading && (
          <div className="text-center py-16">
            <Loader2 size={48} className="animate-spin mx-auto mb-4 text-[#8B7355]" />
            <p className="text-[#666]">正在检查数据...</p>
          </div>
        )}

        {!initialLoading && step === "upload" && (
          <div
            className="border-2 border-dashed border-[#D4A574] rounded-2xl p-16 text-center cursor-pointer hover:bg-[#FFF8E7] transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={48} className="mx-auto mb-4 text-[#8B7355]" />
            <p className="text-[#8B7355] text-lg font-medium">点击上传或拖拽简历文件</p>
            <p className="text-[#999] mt-2">支持 PDF / Word (.docx)</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
            />
          </div>
        )}

        {step === "parsing" && (
          <div className="text-center py-16">
            <Loader2 size={48} className="animate-spin mx-auto mb-4 text-[#8B7355]" />
            <p className="text-[#666]">派派正在阅读你的简历...</p>
          </div>
        )}

        {step === "review" && data && (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-[#E8E4E0]">
            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <Field label="姓名" value={data.name} />
              <Field label="工作年限" value={`${data.work_years} 年`} />
              <Field label="技能" value={data.skills?.join("、")} />
              <Field label="证书" value={data.certificates?.join("、") || "无"} />
            </div>
            {data.education_background?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-[#999] mb-2">教育经历</p>
                {data.education_background.map((edu, i) => (
                  <div key={i} className="text-sm text-[#666] mb-1">
                    · {edu.school} · {edu.degree} · {edu.major}（{edu.duration}）
                    {edu.courses?.length > 0 && (
                      <span className="text-[#999]"> 课程：{edu.courses.join("、")}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {data.projects?.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-[#999] mb-2">项目经历</p>
                {data.projects.map((p, i) => (
                  <div key={i} className="text-sm text-[#666] mb-1">
                    · {p.name}（{p.role}）：{p.description}
                  </div>
                ))}
              </div>
            )}
            {data.internships?.length > 0 && (
              <div className="mb-6">
                <p className="text-sm text-[#999] mb-2">实习经历</p>
                {data.internships.map((inv, i) => (
                  <div key={i} className="text-sm text-[#666] mb-1">
                    · {inv.company} {inv.position}（{inv.duration}）
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-[#999] mb-4">如有错误，可在进入常规界面后编辑</p>
            {isExisting ? (
              <button
                onClick={() => onDone(data)}
                className="w-full py-3 bg-[#7B9E87] text-white rounded-xl hover:bg-[#5A7E67] transition-colors flex items-center justify-center gap-2"
              >
                继续 <ArrowRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                className="w-full py-3 bg-[#8B7355] text-white rounded-xl hover:bg-[#6B5335] transition-colors flex items-center justify-center gap-2"
              >
                <Check size={18} /> 确认并保存
              </button>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-[#7B9E87] flex items-center justify-center mx-auto mb-4">
              <Check size={32} className="text-white" />
            </div>
            <p className="text-[#2C2C2C] text-lg font-medium mb-8">简历已保存</p>
            <button
              onClick={() => onDone(data!)}
              className="px-10 py-4 bg-[#8B7355] text-white text-lg rounded-xl hover:bg-[#6B5335] transition-colors flex items-center gap-2 mx-auto"
            >
              与派派聊一聊 <ArrowRight size={20} />
            </button>
          </div>
        )}

        {error && <p className="text-red-500 text-center mt-4">{error}</p>}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <span className="text-[#999]">{label}：</span>
      <span className="text-[#2C2C2C]">{value || "未填写"}</span>
    </div>
  );
}
