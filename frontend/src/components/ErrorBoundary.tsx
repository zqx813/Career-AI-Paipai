"use client";

import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#F5F3EF]">
          <div className="text-center p-8 max-w-md">
            <div className="text-4xl mb-4">&#9888;</div>
            <h1 className="text-lg font-semibold text-gray-800 mb-2">
              页面遇到了问题
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              请尝试刷新页面。如果问题持续出现，请联系开发者。
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-6 py-2 bg-[#8B7355] text-white rounded-lg hover:bg-[#6d5a42] transition-colors text-sm"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
