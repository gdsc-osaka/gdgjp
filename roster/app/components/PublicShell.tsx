import type { ReactNode } from "react";

export function PublicShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="public-page">
      <header className="public-header">
        <div className="brand-link">
          <img src="/favicon.svg" alt="" width={30} height={30} className="brand-icon" />
          <span className="brand-name">roster</span>
        </div>
      </header>
      <main className={wide ? "public-content public-content-wide" : "public-content"}>
        {children}
      </main>
    </div>
  );
}
