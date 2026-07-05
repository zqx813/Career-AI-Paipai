"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchAPI, getStoredSessionId, setStoredSessionId, clearToken, getToken, meAPI } from "@/lib/api";
import { LoginPage } from "@/components/LoginPage";
import { RegisterPage } from "@/components/RegisterPage";
import { Sidebar } from "@/components/Sidebar";
import { WelcomePage } from "@/components/WelcomePage";
import { ResumeUpload } from "@/components/ResumeUpload";
import { OnboardingChat } from "@/components/OnboardingChat";
import { ReportView } from "@/components/ReportView";
import { ChatWindow } from "@/components/ChatWindow";
import { MemoryView } from "@/components/MemoryView";
import { ResumeEdit } from "@/components/ResumeEdit";
import { OnboardingGuide } from "@/components/OnboardingGuide";
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
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showGuide, setShowGuide] = useState(false);
  const prevStep = useRef<string | null>(null);

  // 每次进入 onboarding 步骤时上报
  useEffect(() => {
    if (!sessionId || !onboardingStep) return;
    fetchAPI(`/api/onboarding/set-step?step=${onboardingStep}`, { method: "POST" });
  }, [sessionId, onboardingStep]);

  // 进入常规界面时标记完成 + 首次进入触发浮窗引导
  useEffect(() => {
    if (!sessionId || onboardingStep !== null || loading) return;
    fetchAPI("/api/onboarding/complete", { method: "POST" });
    if (prevStep.current !== null && !localStorage.getItem("guide_done")) {
      setShowGuide(true);
    }
  }, [sessionId, onboardingStep, loading]);

  useEffect(() => {
    prevStep.current = onboardingStep;
  }, [onboardingStep]);

  // 认证检查
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    meAPI()
      .then((r) => {
        if (r.ok) {
          const sid = getStoredSessionId();
          setSessionId(sid);
          // 检查 onboarding 状态
          return fetchAPI("/api/onboarding/status");
        } else {
          clearToken();
          setLoading(false);
          return null;
        }
      })
      .then((statusRes) => {
        if (!statusRes) return;
        if (statusRes.ok && statusRes.data) {
          setHasChat(statusRes.data.has_chat_summary || false);
          setHasReport(statusRes.data.has_report || false);
          if (statusRes.data.onboarding_complete) {
            setOnboardingStep(null);
          } else {
            // 恢复到中断的步骤
            const step = statusRes.data.onboarding_step;
            setOnboardingStep(step === "invite" ? "resume" : step);
          }
        }
        setLoading(false);
      })
      .catch(() => {
        clearToken();
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    fetchAPI("/api/resume/get").then((r) => {
      if (r.ok && r.data) setResume(r.data);
    });
    fetchAPI("/api/memory/get").then((r) => {
      if (r.ok && r.data) setMemories(r.data);
    });
  }, [sessionId, onboardingStep]);

  function handleLogin(sid: string) {
    setSessionId(sid);
    // 登录后重新检查 onboarding 状态
    fetchAPI("/api/onboarding/status")
      .then((r) => {
        if (r.ok && r.data) {
          setHasChat(r.data.has_chat_summary || false);
          setHasReport(r.data.has_report || false);
          if (r.data.onboarding_complete) {
            setOnboardingStep(null);
          } else {
            const step = r.data.onboarding_step;
            setOnboardingStep(step === "invite" ? "resume" : step);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F5F3EF]">
        <p className="text-[#8B7355] text-lg">加载中...</p>
      </div>
    );
  }

  // 未登录 → 显示登录/注册页
  if (!sessionId) {
    if (authMode === "register") {
      return (
        <RegisterPage
          onLogin={handleLogin}
          onSwitchToLogin={() => setAuthMode("login")}
        />
      );
    }
    return (
      <LoginPage
        onLogin={handleLogin}
        onSwitchToRegister={() => setAuthMode("register")}
      />
    );
  }

  if (onboardingStep === "welcome") {
    return (
      <WelcomePage
        onStart={() => setOnboardingStep("resume")}
        hasResume={!!resume}
        hasChat={hasChat}
        hasReport={hasReport}
        inviteVerified={true}
      />
    );
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
