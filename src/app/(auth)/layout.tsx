// Signed-out screens (login, invite code): one narrow column with the logo, no bottom navigation.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-[440px] flex-1 content-center gap-8 px-4 py-10">
      <h1 className="m-0 text-center font-en text-[clamp(1.8rem,9vw,2.3rem)] leading-none whitespace-nowrap [text-shadow:3px_3px_0_#fff,5px_5px_0_var(--ink)]">
        COMMIT OR TREAT
      </h1>
      {children}
    </main>
  );
}
