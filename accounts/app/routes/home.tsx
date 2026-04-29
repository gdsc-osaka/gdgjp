import { Link } from "react-router";
import { GdgMark } from "~/components/gdg-mark";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";

export function meta() {
  return [{ title: "GDG Japan Accounts" }];
}

export default function Home() {
  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-6 text-center">
        <GdgMark size="lg" className="mb-8" />
        <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">GDG Japan Accounts</h1>
        <p className="mt-2 text-sm font-mono text-muted-foreground">accounts.gdgs.jp</p>
        <p className="mt-6 max-w-md text-balance text-base text-muted-foreground">
          GDG Japan central authentication for chapters, organizers, and members across Google
          Developer Groups.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/sign-in">Sign in</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/sign-up">Create account</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
