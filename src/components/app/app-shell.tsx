import { BottomNav } from "./bottom-nav";

/** Phone-width column on paper, with room for the fixed bottom navigation. */
export function AppShell({ children, basePath }: { children: React.ReactNode; basePath?: string }) {
  return (
    <>
      <main className="mx-auto w-full max-w-[440px] px-4 pt-5 pb-28">{children}</main>
      <BottomNav basePath={basePath} />
    </>
  );
}
