import { BottomNav } from "./bottom-nav";

/**
 * Phone-width column on paper, with room for the fixed bottom navigation. Wider screens get a
 * 720px column; pages that lay out in two columns on a PC (home, retrospectives) mark their root
 * with `data-wide` to get 1040px from lg up. Forms stay at 720px so inputs don't stretch.
 */
export function AppShell({
  children,
  basePath,
  live = false,
}: {
  children: React.ReactNode;
  basePath?: string;
  live?: boolean;
}) {
  return (
    <>
      <main className="mx-auto w-full max-w-[440px] px-4 pt-5 pb-28 md:max-w-[720px] md:px-6 lg:has-[[data-wide]]:max-w-[1040px]">{children}</main>
      <BottomNav basePath={basePath} live={live} />
    </>
  );
}
