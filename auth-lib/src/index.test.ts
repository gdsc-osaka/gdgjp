import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateRequest = vi.fn();
const getUser = vi.fn();

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest,
    users: { getUser },
  })),
}));

const { getAuth, requireUser, isSuperAdmin } = await import("./index");

const options = { publishableKey: "pk_test", secretKey: "sk_test" } as const;

beforeEach(() => {
  authenticateRequest.mockReset();
  getUser.mockReset();
});

describe("getAuth", () => {
  it("returns null when the request is unauthenticated", async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: false,
      toAuth: () => null,
    });
    const result = await getAuth(new Request("https://x.example/"), options);
    expect(result).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it("maps Clerk user to AuthUser when authenticated", async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: "user_123" }),
    });
    getUser.mockResolvedValue({
      id: "user_123",
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      primaryEmailAddressId: "idn_1",
      emailAddresses: [
        { id: "idn_0", emailAddress: "other@example.com" },
        { id: "idn_1", emailAddress: "ada@example.com" },
      ],
    });
    const result = await getAuth(new Request("https://x.example/"), options);
    expect(result).toEqual({
      id: "user_123",
      email: "ada@example.com",
      name: "Ada Lovelace",
      isAdmin: false,
    });
  });

  it("surfaces publicMetadata.isAdmin", async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: "user_admin" }),
    });
    getUser.mockResolvedValue({
      id: "user_admin",
      firstName: "Admin",
      lastName: null,
      username: null,
      primaryEmailAddressId: "idn_a",
      emailAddresses: [{ id: "idn_a", emailAddress: "admin@example.com" }],
      publicMetadata: { isAdmin: true },
    });
    const result = await getAuth(new Request("https://x.example/"), options);
    expect(result?.isAdmin).toBe(true);
  });

  it("falls back to username when no name is set", async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: "user_456" }),
    });
    getUser.mockResolvedValue({
      id: "user_456",
      firstName: null,
      lastName: null,
      username: "ada",
      primaryEmailAddressId: "idn_1",
      emailAddresses: [{ id: "idn_1", emailAddress: "ada@example.com" }],
    });
    const result = await getAuth(new Request("https://x.example/"), options);
    expect(result?.name).toBe("ada");
  });
});

describe("requireUser", () => {
  it("throws a 401 Response when unauthenticated", async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: false,
      toAuth: () => null,
    });
    const promise = requireUser(new Request("https://x.example/"), options);
    await expect(promise).rejects.toBeInstanceOf(Response);
    await promise.catch((res: Response) => {
      expect(res.status).toBe(401);
    });
  });

  it("returns the AuthUser when authenticated", async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      toAuth: () => ({ userId: "user_789" }),
    });
    getUser.mockResolvedValue({
      id: "user_789",
      firstName: "Grace",
      lastName: "Hopper",
      username: null,
      primaryEmailAddressId: "idn_g",
      emailAddresses: [{ id: "idn_g", emailAddress: "grace@example.com" }],
    });
    const result = await requireUser(new Request("https://x.example/"), options);
    expect(result.email).toBe("grace@example.com");
  });
});

describe("isSuperAdmin", () => {
  it("returns true when isAdmin is set", () => {
    expect(isSuperAdmin({ id: "u", email: "e", name: "n", isAdmin: true })).toBe(true);
  });

  it("returns false when isAdmin is unset", () => {
    expect(isSuperAdmin({ id: "u", email: "e", name: "n", isAdmin: false })).toBe(false);
  });
});
