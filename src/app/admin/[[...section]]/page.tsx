import type { Metadata } from "next";
import { readAdminSession } from "@/lib/admin/session";
import LoginView from "@/components/admin/views/LoginView";
import AdminApp from "@/components/admin/AdminApp";

// 單一 catch-all 路由承載整個後台（Vercel Hobby 12 functions 上限）。
// 每個 section 導航都是一次 server render：重新讀 cookie 驗 session。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hawker Hunt 管理後台",
  robots: { index: false, follow: false },
};

export default async function AdminPage({
  params,
}: {
  params: Promise<{ section?: string[] }>;
}) {
  const { section } = await params;
  const session = await readAdminSession();
  if (!session) return <LoginView />;
  return <AdminApp email={session.email} role={session.role} section={section ?? []} />;
}
