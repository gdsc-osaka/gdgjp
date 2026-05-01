import { describe, expect, it } from "vitest";
import { getAuth, getUserChapter, isSuperAdmin, requireUser } from "./index";

function makeAuth(session: { user: Record<string, unknown> } | null) {
  return {
    api: {
      getSession: async () => session,
    },
  };
}

describe("getAuth", () => {
  it("returns null when there is no session", async () => {
    const result = await getAuth(makeAuth(null), new Request("https://x.example/"));
    expect(result).toBeNull();
  });

  it("maps a session user to an AuthUser", async () => {
    const auth = makeAuth({
      user: {
        id: "u_1",
        email: "ada@example.com",
        name: "Ada Lovelace",
        isAdmin: false,
      },
    });
    const result = await getAuth(auth, new Request("https://x.example/"));
    expect(result).toEqual({
      id: "u_1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      isAdmin: false,
    });
  });

  it("treats isAdmin === 1 as admin (SQLite boolean)", async () => {
    const auth = makeAuth({
      user: { id: "u_2", email: "a@b.c", name: "A", isAdmin: 1 },
    });
    const result = await getAuth(auth, new Request("https://x.example/"));
    expect(result?.isAdmin).toBe(true);
  });
});

describe("requireUser", () => {
  it("throws a 401 Response when unauthenticated", async () => {
    const promise = requireUser(makeAuth(null), new Request("https://x.example/"));
    await expect(promise).rejects.toBeInstanceOf(Response);
    await promise.catch((res: Response) => {
      expect(res.status).toBe(401);
    });
  });

  it("returns the AuthUser when authenticated", async () => {
    const auth = makeAuth({
      user: { id: "u_3", email: "g@h.i", name: "Grace", isAdmin: false },
    });
    const result = await requireUser(auth, new Request("https://x.example/"));
    expect(result.email).toBe("g@h.i");
  });
});

describe("getUserChapter", () => {
  it("returns null when chapter fields are absent", async () => {
    const auth = makeAuth({ user: { id: "u_4", email: "x@y.z", name: "X" } });
    const result = await getUserChapter(auth, new Request("https://x.example/"));
    expect(result).toBeNull();
  });

  it("returns chapter info when fields are present", async () => {
    const auth = makeAuth({
      user: {
        id: "u_5",
        email: "x@y.z",
        name: "X",
        chapterId: 7,
        chapterSlug: "osaka",
        chapterRole: "organizer",
      },
    });
    const result = await getUserChapter(auth, new Request("https://x.example/"));
    expect(result).toEqual({ chapterId: 7, chapterSlug: "osaka", role: "organizer" });
  });
});

describe("isSuperAdmin", () => {
  it("returns true when isAdmin is true", () => {
    expect(isSuperAdmin({ id: "u", email: "e", name: "n", isAdmin: true })).toBe(true);
  });

  it("returns false when isAdmin is false", () => {
    expect(isSuperAdmin({ id: "u", email: "e", name: "n", isAdmin: false })).toBe(false);
  });
});
