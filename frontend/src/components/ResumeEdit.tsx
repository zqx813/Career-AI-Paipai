"use client";

import { useState, useEffect, useRef } from "react";
import { fetchAPI } from "@/lib/api";
import { Upload, Loader2 } from "lucide-react";
import type { ResumeData } from "@/lib/types";

interface Props {
  sessionId: string;
  resume: ResumeData | null;
  onUpdate: (data: ResumeData) => void;
}

export function ResumeEdit({ sessionId, resume, onUpdate }: Props) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resume) return;
    // 没有简历时尝试加载（中断恢复场景，ResumeUpload 上传后这里可能还没数据）
    fetchAPI("/api/resume/get").then((r) => {
      if (r.ok && r.data) onUpdate(r.data);
    });
  }, [sessionId]);

  async function handleReupload(file: File) {
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const token = localStorage.getItem("auth_token");
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/resume/upload`,
        { method: "POST", headers: token ? { 'Authorization': `Bearer ${token}` } : {}, body: form }
      );
      const json = await res.json();
      if (json.ok && json.data) {
        onUpdate(json.data);
      } else {
        alert(json.error || "解析失败");
      }
    } catch {
      alert("网络错误，请重试");
    }
    setUploading(false);
  }

  if (!resume) {
    return (
      <div className="h-full flex items-center justify-center bg-[#F5F3EF]">
        <div className="text-center text-[#999]">
          <p className="text-lg mb-2">还没有上传简历</p>
          <p className="text-sm mb-4">上传简历后，派派可以结合你的背景提供个性化建议</p>
          <button
            onClick={() => fileRef.current?.click()}
            className="px-6 py-3 bg-[#8B7355] text-white rounded-xl hover:bg-[#6B5335] transition-colors inline-flex items-center gap-2"
            disabled={uploading}
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            上传简历
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleReupload(e.target.files[0])}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-[#F5F3EF]">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#2C2C2C]">简历管理</h2>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 text-sm text-[#8B7355] border border-[#8B7355] rounded-lg hover:bg-[#FFF8E7] transition-colors inline-flex items-center gap-1"
          >
            {uploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            重新上传
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.doc"
            className="hidden"
            onChange={(e) => {
              e.target.files?.[0] && handleReupload(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <ReadOnlyField label="姓名" value={resume.name} />
            <ReadOnlyField label="工作年限" value={resume.work_years != null ? `${resume.work_years} 年` : "未填写"} />
          </div>

          {resume.education_background?.length > 0 && (
            <Section title="教育经历">
              {resume.education_background.map((edu, i) => (
                <div key={i} className="text-sm text-[#666] mb-1">
                  · {edu.school} · {edu.degree} · {edu.major}（{edu.duration}）
                  {edu.courses?.length > 0 && (
                    <span className="text-[#999]"> · 课程：{edu.courses.join("、")}</span>
                  )}
                </div>
              ))}
            </Section>
          )}

          {resume.skills?.length > 0 && (
            <Section title="技能">
              {resume.skills.join("、")}
            </Section>
          )}

          {resume.certificates?.length > 0 && (
            <Section title="证书">
              {resume.certificates.join("、")}
            </Section>
          )}

          {resume.work_experience?.length > 0 && (
            <Section title="工作经历">
              {resume.work_experience.map((w, i) => (
                <div key={i} className="mb-1">· {w.company} · {w.position}（{w.duration}）</div>
              ))}
            </Section>
          )}

          {resume.projects?.length > 0 && (
            <Section title="项目经历">
              {resume.projects.map((p, i) => (
                <div key={i} className="mb-2">
                  <div className="font-medium text-[#2C2C2C]">{p.name}（{p.role}）</div>
                  <div className="text-[#666]">{p.description}</div>
                  {p.tech_stack?.length > 0 && (
                    <div className="text-xs text-[#999]">技术栈：{p.tech_stack.join("、")}</div>
                  )}
                </div>
              ))}
            </Section>
          )}

          {resume.internships?.length > 0 && (
            <Section title="实习经历">
              {resume.internships.map((inv, i) => (
                <div key={i} className="mb-2">
                  <div className="font-medium text-[#2C2C2C]">{inv.company} · {inv.position}</div>
                  <div className="text-xs text-[#999]">{inv.duration}</div>
                  <div className="text-sm text-[#666]">{inv.description}</div>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-[#999] mb-1">{label}</p>
      <p className="text-sm text-[#2C2C2C] bg-[#F0EDE8] px-3 py-2 rounded-lg">{value || "未填写"}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-[#E8E4E0]">
      <p className="text-xs text-[#999] mb-2">{title}（如需修改请重新上传简历）</p>
      <div className="text-sm text-[#666]">{children}</div>
    </div>
  );
}
