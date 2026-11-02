import Link from "next/link";
import { CreateAgentForm } from "@/components/admin/CreateAgentForm";
import { Icon } from "@/components/ui/Icon";

export const dynamic = "force-dynamic";

export default function NewAgentPage() {
  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1 text-[9px] text-muted hover:text-ink">
          <Icon name="arrow-left" size={10} />
          返回 Agent 列表
        </Link>
        <p className="eyebrow mt-5">New Agent · Draft</p>
        <h1 className="display mt-2 text-[36px] leading-none md:text-[44px]">创建 Agent 草稿</h1>
        <p className="mt-2 text-[10px] leading-5 text-muted">
          草稿不会进入运行时；创建后先检查配置，再上架生成 v1。
        </p>
      </div>
      <CreateAgentForm />
    </div>
  );
}
