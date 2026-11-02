"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center bg-ivory px-6 text-center">
      <p className="eyebrow">Unexpected Error</p>
      <h1 className="display mt-4 text-[42px] leading-tight md:text-[56px]">
        衣橱暂时需要整理一下。
      </h1>
      <p className="mt-4 max-w-md text-[12px] leading-6 text-muted">
        页面遇到了一点问题，我们已经记录。请稍后重试；如果持续出现，可以回到首页重新开始。
      </p>
      <div className="mt-7 flex gap-2">
        <button onClick={reset} className="btn btn-primary">重新加载</button>
        <a href="/" className="btn btn-ghost">回到首页</a>
      </div>
    </div>
  );
}
