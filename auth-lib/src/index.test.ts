import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateRequest = vi.fn();
const getUser = vi.fn();

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest,
    users: { getUser },
  })),
}));

const { getAuth, requireUser } = await import("./index");

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
    });
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
