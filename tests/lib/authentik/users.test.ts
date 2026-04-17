import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
}));

vi.mock("@/lib/authentik/client", () => ({
  authentikRequest: mockRequest,
}));

import {
  createUser,
  findAvailableUsername,
  getUserPk,
  updateUser,
} from "@/lib/authentik/users";

const fakeUser = {
  pk: 42,
  uuid: "abc-123",
  username: "jkovacs",
  name: "Kovács János",
  email: "jkovacs@example.com",
  is_active: true,
  path: "users",
  attributes: {},
  groups: [],
};

beforeEach(() => {
  mockRequest.mockReset();
});

describe("getUserPk", () => {
  it("returns pk for existing user and queries by uuid", async () => {
    mockRequest.mockResolvedValue({
      pagination: { count: 1 },
      results: [fakeUser],
    });

    const pk = await getUserPk("abc-123");
    expect(pk).toBe(42);
    expect(mockRequest).toHaveBeenCalledWith("/core/users/?uuid=abc-123");
  });

  it("throws when user not found", async () => {
    mockRequest.mockResolvedValue({
      pagination: { count: 0 },
      results: [],
    });

    await expect(getUserPk("non-existent")).rejects.toThrow(
      "Authentik user not found",
    );
  });
});

describe("findAvailableUsername", () => {
  it("returns base username when available", async () => {
    mockRequest.mockResolvedValue({ pagination: { count: 0 }, results: [] });

    const username = await findAvailableUsername("jkovacs");
    expect(username).toBe("jkovacs");
  });

  it("appends suffix starting from 2 when base is taken", async () => {
    mockRequest
      // Check "jkovacs" — taken
      .mockResolvedValueOnce({
        pagination: { count: 1 },
        results: [fakeUser],
      })
      // Check "jkovacs2" — also taken
      .mockResolvedValueOnce({
        pagination: { count: 1 },
        results: [{ ...fakeUser, username: "jkovacs2" }],
      })
      // Check "jkovacs3" — available
      .mockResolvedValueOnce({ pagination: { count: 0 }, results: [] });

    const username = await findAvailableUsername("jkovacs");
    expect(username).toBe("jkovacs3");
    expect(mockRequest).toHaveBeenCalledTimes(3);
  });
});

describe("createUser", () => {
  it("sends POST with correct body and defaults path to 'users'", async () => {
    mockRequest.mockResolvedValue(fakeUser);

    const result = await createUser({
      username: "jkovacs",
      name: "Kovács János",
      email: "jkovacs@example.com",
    });

    expect(result).toEqual(fakeUser);
    expect(mockRequest).toHaveBeenCalledWith("/core/users/", {
      method: "POST",
      body: JSON.stringify({
        path: "users",
        username: "jkovacs",
        name: "Kovács János",
        email: "jkovacs@example.com",
      }),
    });
  });

  it("allows overriding path and passing attributes", async () => {
    mockRequest.mockResolvedValue(fakeUser);

    await createUser({
      username: "test",
      name: "Test User",
      email: "test@example.com",
      path: "custom",
      groups: ["group-uuid-1"],
      attributes: { mobile: "+36301234567" },
    });

    const body = JSON.parse(mockRequest.mock.calls[0][1].body);
    expect(body.path).toBe("custom");
    expect(body.groups).toEqual(["group-uuid-1"]);
    expect(body.attributes).toEqual({ mobile: "+36301234567" });
  });
});

describe("updateUser", () => {
  it("sends PATCH to correct pk URL", async () => {
    mockRequest.mockResolvedValue(fakeUser);

    await updateUser(42, { name: "New Name" });

    expect(mockRequest).toHaveBeenCalledWith("/core/users/42/", {
      method: "PATCH",
      body: JSON.stringify({ name: "New Name" }),
    });
  });

  it("can update is_active and path for archiving", async () => {
    mockRequest.mockResolvedValue({ ...fakeUser, is_active: false });

    const result = await updateUser(42, {
      is_active: false,
      path: "archived",
    });

    expect(result.is_active).toBe(false);
    const body = JSON.parse(mockRequest.mock.calls[0][1].body);
    expect(body).toEqual({ is_active: false, path: "archived" });
  });
});
