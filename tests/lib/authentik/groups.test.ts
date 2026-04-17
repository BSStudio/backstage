import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
}));

vi.mock("@/lib/authentik/client", () => ({
  authentikRequest: mockRequest,
}));

import { addUserToGroup, removeUserFromGroup } from "@/lib/authentik/groups";

beforeEach(() => {
  mockRequest.mockReset();
});

describe("addUserToGroup", () => {
  it("sends POST with user pk to the group's add_user endpoint", async () => {
    mockRequest.mockResolvedValue(undefined);

    await addUserToGroup("group-uuid-abc", 42);

    expect(mockRequest).toHaveBeenCalledWith(
      "/core/groups/group-uuid-abc/add_user/",
      {
        method: "POST",
        body: JSON.stringify({ pk: 42 }),
      },
    );
  });

  it("encodes group UUID in URL", async () => {
    mockRequest.mockResolvedValue(undefined);

    await addUserToGroup("uuid with spaces", 1);

    expect(mockRequest).toHaveBeenCalledWith(
      "/core/groups/uuid%20with%20spaces/add_user/",
      expect.anything(),
    );
  });
});

describe("removeUserFromGroup", () => {
  it("sends POST with user pk to the group's remove_user endpoint", async () => {
    mockRequest.mockResolvedValue(undefined);

    await removeUserFromGroup("group-uuid-abc", 42);

    expect(mockRequest).toHaveBeenCalledWith(
      "/core/groups/group-uuid-abc/remove_user/",
      {
        method: "POST",
        body: JSON.stringify({ pk: 42 }),
      },
    );
  });
});
