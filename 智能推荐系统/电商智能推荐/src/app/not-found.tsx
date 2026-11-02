import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-ivory px-6 text-center">
      <div className="pointer-events-none absolute inset-0 surface-grid opacity-40" />
      <div className="relative">
        <p className="eyebrow">404 · Page Not Found</p>
        <h1 className="display mt-4 text-[64px] leading-none md:text-[96px]">这一页，暂时不在。</h1>
        <p className="mx-auto mt-5 max-w-md text-[12px] leading-6 text-muted">
          你访问的页面可能已下架，或链接有误。可以回到首页，或者让 AI 造型师帮你找到合适的单品。
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Link href="/" className="btn btn-primary">回到首页</Link>
          <Link href="/shop" className="btn btn-ghost">浏览全部单品</Link>
          <Link href="/stylist" className="btn btn-ghost">问 AI 造型师</Link>
        </div>
        <p className="mt-10 font-display text-[22px] tracking-[0.12em] text-ink/50">织言 ZHIYAN</p>
      </div>
    </div>
  );
}
