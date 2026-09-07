import { GdgAccountMenu, GdgAppLauncher } from "@gdgjp/gdg-lib/ui";
import type { ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams } from "react-router";
import { type EventStatus, STATUS_LABELS } from "~/features/events/status";

type ShellEvent = {
  id: string;
  chapterId: number;
  name: string;
  date: string;
  status: EventStatus;
};

type ShellChapter = { id: number; slug: string };

const EVENT_NAV = [
  ["design", "設計"],
  ["staff", "スタッフ"],
  ["roster", "シフト表"],
  ["share", "共有"],
] as const;

export function AppShell({
  children,
  user,
  chapters,
  events,
  accountsUrl,
}: {
  children: ReactNode;
  user: { name: string; email: string; image: string | null };
  chapters: ShellChapter[];
  events: ShellEvent[];
  accountsUrl: string;
}) {
  const { id } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const currentEvent = events.find((event) => event.id === id) ?? null;
  const chapterName = (chapterId: number) =>
    chapters.find((chapter) => chapter.id === chapterId)?.slug ?? `Chapter ${chapterId}`;

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-top">
          <Link to="/" className="brand-link" aria-label="roster イベント一覧">
            <img src="/favicon.svg" alt="" width={30} height={30} className="brand-icon" />
            <span>
              <span className="brand-name">roster</span>
              <span className="brand-context">
                {currentEvent ? chapterName(currentEvent.chapterId) : "GDG Japan"}
              </span>
            </span>
          </Link>

          <div className="event-switcher">
            <label htmlFor="event-switcher" className="nav-label">
              イベント
            </label>
            <select
              id="event-switcher"
              value={currentEvent?.id ?? ""}
              onChange={(event) => {
                const eventId = event.currentTarget.value;
                void navigate(eventId ? `/e/${eventId}/design` : "/");
              }}
            >
              <option value="">イベント一覧</option>
              {events.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.name} · {chapterName(event.chapterId)} · {event.date} ·{" "}
                  {STATUS_LABELS[event.status]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="管理画面">
          <NavLink to="/" end className={navClassName}>
            イベント一覧
          </NavLink>
          {currentEvent ? (
            <div className="event-nav-group">
              <p className="nav-label">このイベント</p>
              {EVENT_NAV.map(([segment, label]) => (
                <NavLink
                  key={segment}
                  to={`/e/${currentEvent.id}/${segment}`}
                  className={navClassName}
                >
                  {label}
                </NavLink>
              ))}
            </div>
          ) : null}
          <Link
            to="/events/new"
            aria-current={pathname === "/events/new" ? "page" : undefined}
            className={pathname === "/events/new" ? "sidebar-link active" : "sidebar-link"}
          >
            イベントを作成
          </Link>
        </nav>

        <div className="sidebar-account">
          <GdgAppLauncher ariaLabel="アプリ一覧" />
          <GdgAccountMenu
            accountUrl={`${accountsUrl}/dashboard`}
            onSignOut={() => window.location.assign("/auth/signout")}
            signOutLabel="ログアウト"
            user={user}
          />
          <span className="account-name">{user.name}</span>
        </div>
      </aside>
      <div className="app-content">{children}</div>
    </div>
  );
}

function navClassName({ isActive }: { isActive: boolean }) {
  return isActive ? "sidebar-link active" : "sidebar-link";
}
