import type { Metadata } from "next";
import "./globals.css";
import ErrorBoundary from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "生涯助手 · 派派",
  description: "上传简历，派派记住你，持续告诉你下一步做什么",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans"><ErrorBoundary>{children}</ErrorBoundary></body>
    </html>
  );
}
