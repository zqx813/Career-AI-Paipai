"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
  variant: "light" | "dark";
}

const linkColor = (v: string) => v === "light" ? "text-[#8B7355]" : "text-white";
const codeBg = (v: string) => v === "light" ? "bg-black/10" : "bg-white/20";

// 仅对已完成消息渲染 markdown；流式消息用 raw text（在 ChatWindow/OnboardingChat/ReportView 各自判断）
export function MarkdownContent({ content, variant }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: (p: any) => <p className="mb-1 last:mb-0">{p.children}</p>,
        strong: (s: any) => <strong className="font-semibold">{s.children}</strong>,
        ul: (u: any) => <ul className="pl-4 my-1 list-disc">{u.children}</ul>,
        ol: (o: any) => <ol className="pl-4 my-1 list-decimal">{o.children}</ol>,
        li: (l: any) => <li className="mb-0.5">{l.children}</li>,
        a: (a: any) => (
          <a href={a.href} target="_blank" rel="noopener noreferrer" className={`${linkColor(variant)} underline`}>
            {a.children}
          </a>
        ),
        code: (c: any) => <code className={`${codeBg(variant)} px-1 rounded text-sm`}>{c.children}</code>,
        pre: (p: any) => <pre className={`${codeBg(variant)} p-2 rounded-lg my-1 text-sm overflow-x-auto`}>{p.children}</pre>,
        blockquote: (b: any) => (
          <blockquote className="border-l-2 border-[#D4A574] pl-3 my-1 opacity-80">{b.children}</blockquote>
        ),
        table: (t: any) => (
          <div className="overflow-x-auto my-1">
            <table className="min-w-full text-sm border-collapse">{t.children}</table>
          </div>
        ),
        thead: (t: any) => <thead className="border-b border-[#E8E4E0]">{t.children}</thead>,
        th: (t: any) => <th className="px-2 py-1 text-left font-medium">{t.children}</th>,
        td: (t: any) => <td className="px-2 py-1">{t.children}</td>,
        hr: () => <hr className="my-2 border-[#E8E4E0]" />,
        h3: (h: any) => <h3 className="font-semibold text-sm mt-2 mb-1">{h.children}</h3>,
        h4: (h: any) => <h4 className="font-medium text-sm mt-1 mb-1">{h.children}</h4>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
