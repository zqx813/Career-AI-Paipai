"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateSessionId, fetchAPI } from "@/lib/api";
import { Sidebar } from "@/components/Sidebar";
import { WelcomePage } from "@/components/WelcomePage";
import { ResumeUpload } from "@/components/ResumeUpload";
import { OnboardingChat } from "@/components/OnboardingChat";
import { ReportView } from "@/components/ReportView";
import { ChatWindow } from "@/components/ChatWindow";
import { MemoryView } from "@/components/MemoryView";
import { ResumeEdit } from "@/components/ResumeEdit";
import { OnboardingGuide } from "@/components/OnboardingGuide";
import { InviteCodePage } from "@/components/InviteCodePage";
import type { ResumeData, MemoryData, ReportData } from "@/lib/types";

export default function Home() {
  const [sessionId, setSessionId] = useState("");
  const [onboardingStep, setOnboardingStep] = useState<string | null>(null);
  const [mainPage, setMainPage] = useState("chat");
  const [scenario, setScenario] = useState("career_exploration");
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [memories, setMemories] = useState<MemoryData | null>(null);
  const [hasChat, setHasChat] = useState(false);
  const [hasReport, setHasReport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inviteVerified, setInviteVerified] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const prevStep = useRef<string | null>(null);

  // 每次进入 onboarding 步骤时上报
  useEffect(() => {
    if (!sessionId || !onboardingStep) return;
    fetchAPI(`/api/onboarding/set-step?session_id=${sessionId}&step=${onboardingStep}`, { method: "POST" });
  }, [sessionId, onboardingStep]);

  // 进入常规界面时标记完成 + 首次进入触发浮窗引导
  useEffect(() => {
    if (!sessionId || onboardingStep !== null || loading) return;
    fetchAPI(`/api/onboarding/complete?session_id=${sessionId}`, { method: "POST" });
    // 首次从 onboarding 进入常规界面时显示引导
    if (prevStep.current !== null && !localStorage.getItem("guide_done")) {
      setShowGuide(true);
    }
  }, [sessionId, onboardingStep, loading]);

  // 追踪上次步骤
  useEffect(() => {
    prevStep.current = onboardingStep;
  }, [onboardingStep]);

  useEffect(() => {
    const sid = generateSessionId();
    setSessionId(sid);
    fetchAPI(`/api/onboarding/status?session_id=${sid}`)
      .then((r) => {
        const inviteVerified = r.data?.invite_verified || false;
        setInviteVerified(inviteVerified);
        setHasChat(r.data?.has_chat_summary || false);
        setHasReport(r.data?.has_report || false);
        if (r.ok && r.data?.onboarding_complete) {
          setOnboardingStep(inviteVerified ? null : "invite");
        } else {
          setOnboardingStep("welcome");
        }
        setLoading(false);
      })
      .catch(() => {
        setOnboardingStep("welcome");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    fetchAPI(`/api/resume/get?session_id=${sessionId}`).then((r) => {
      if (r.ok && r.data) setResume(r.data);
    });
    fetchAPI(`/api/memory/get?session_id=${sessionId}`).then((r) => {
      if (r.ok && r.data) setMemories(r.data);
    });
  }, [sessionId, onboardingStep]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F5F3EF]">
        <p className="text-[#8B7355] text-lg">加载中...</p>
      </div>
    );
  }

  if (onboardingStep === "welcome") {
    return (
      <WelcomePage
        onStart={() => setOnboardingStep(inviteVerified ? "resume" : "invite")}
        hasResume={!!resume}
        hasChat={hasChat}
        hasReport={hasReport}
        inviteVerified={inviteVerified}
      />
    );
  }
  if (onboardingStep === "invite") {
    return <InviteCodePage sessionId={sessionId} onVerified={() => setOnboardingStep("resume")} />;
  }
  if (onboardingStep === "resume") {
    return <ResumeUpload sessionId={sessionId} onDone={(data) => { setResume(data); setOnboardingStep("chat"); }} />;
  }
  if (onboardingStep === "chat") {
    return <OnboardingChat sessionId={sessionId} onComplete={() => setOnboardingStep("report")} />;
  }
  if (onboardingStep === "report") {
    return <ReportView sessionId={sessionId} isPreliminary={true} onEnterMain={() => setOnboardingStep(null)} />;
  }

  return (
    <div className="flex h-screen bg-[#F5F3EF]">
      <Sidebar
        currentPage={mainPage}
        scenario={scenario}
        onNavigate={setMainPage}
        onScenarioChange={(s) => { setScenario(s); setMainPage("chat"); }}
      />
      <main className="flex-1 overflow-hidden">
        {mainPage === "chat" && (
          <ChatWindow sessionId={sessionId} scenario={scenario} resume={resume} />
        )}
        {mainPage === "resume" && (
          <ResumeEdit sessionId={sessionId} resume={resume} onUpdate={setResume} />
        )}
        {mainPage === "report" && (
          <ReportView sessionId={sessionId} isPreliminary={false} onEnterMain={() => {}} />
        )}
        {mainPage === "memory" && (
          <MemoryView sessionId={sessionId} memories={memories} onUpdate={setMemories} />
        )}
      </main>

      {showGuide && (
        <OnboardingGuide onDone={() => { setShowGuide(false); localStorage.setItem("guide_done", "1"); }} />
      )}
    </div>
  );
}
