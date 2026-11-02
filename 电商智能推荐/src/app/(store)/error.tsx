"use client";

export default function StoreError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="container-x flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="eyebrow">Service interrupted</p>
      <h1 className="display mt-4 text-[38px] leading-tight md:text-[52px]">
        这一页暂时没有准备好。
      </h1>
      <p className="mt-4 max-w-md text-[12px] leading-6 text-muted">
        页面遇到了一点问题，我们已经记录这次请求（{error.digest ?? "no-digest"}）。
        你可以重试，或让造型师继续帮你挑选。
      </p>
      <div className="mt-7 flex gap-2">
        <button onClick={reset} className="btn btn-primary">重新加载</button>
        <a href="/stylist" className="btn btn-ghost">去问造型师</a>
      </div>
    </div>
  );
}
