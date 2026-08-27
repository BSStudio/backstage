import { beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleApiError } from "@/lib/google/client";

const googleRequest = vi.fn();
const getGroupEmail = vi.fn(() => "members@example.com");

vi.mock("@/lib/google/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/client")>()),
  googleRequest: (...args: unknown[]) => googleRequest(...args),
  getGroupEmail: () => getGroupEmail(),
}));

async function importGroups() {
  vi.resetModules();
  return import("@/lib/google/groups");
}

beforeEach(() => {
  googleRequest.mockReset();
  getGroupEmail.mockReset().mockReturnValue("members@example.com");
});

describe("listGroupMembers", () => {
  it("looks the group up and returns its memberships", async () => {
    googleRequest
      .mockResolvedValueOnce({ name: "groups/abc" })
      .mockResolvedValueOnce({
        memberships: [
          {
            name: "groups/abc/memberships/1",
            preferredMemberKey: { id: "Kovacs.Janos@example.com" },
            roles: [{ name: "MEMBER" }],
          },
        ],
      });

    const { listGroupMembers } = await importGroups();
    await expect(listGroupMembers()).resolves.toEqual([
      { email: "kovacs.janos@example.com", roles: ["MEMBER"] },
    ]);

    expect(googleRequest).toHaveBeenNthCalledWith(
      1,
      "/groups:lookup?groupKey.id=members%40example.com",
    );
    expect(googleRequest.mock.calls[1][0]).toBe(
      "/groups/abc/memberships?view=FULL&pageSize=500",
    );
  });

  it("follows pagination and tolerates a membership without a member key", async () => {
    googleRequest
      .mockResolvedValueOnce({ name: "groups/abc" })
      .mockResolvedValueOnce({
        memberships: [
          { name: "m1", preferredMemberKey: { id: "a@example.com" } },
          { name: "m2", preferredMemberKey: {} },
        ],
        nextPageToken: "page-2",
      })
      .mockResolvedValueOnce({});

    const { listGroupMembers } = await importGroups();
    await expect(listGroupMembers()).resolves.toEqual([
      { email: "a@example.com", roles: [] },
    ]);
    expect(googleRequest.mock.calls[2][0]).toContain("pageToken=page-2");
  });

  it("looks the group resource up once and reuses it", async () => {
    googleRequest
      .mockResolvedValueOnce({ name: "groups/abc" })
      .mockResolvedValue({ memberships: [] });

    const { listGroupMembers } = await importGroups();
    await listGroupMembers();
    await listGroupMembers();

    const lookups = googleRequest.mock.calls.filter(([path]) =>
      String(path).startsWith("/groups:lookup"),
    );
    expect(lookups).toHaveLength(1);
  });

  it("looks up again when the configured group changes", async () => {
    googleRequest
      .mockResolvedValueOnce({ name: "groups/abc" })
      .mockResolvedValueOnce({ memberships: [] })
      .mockResolvedValueOnce({ name: "groups/def" })
      .mockResolvedValueOnce({ memberships: [] });

    const { listGroupMembers } = await importGroups();
    await listGroupMembers();
    getGroupEmail.mockReturnValue("other@example.com");
    await listGroupMembers();

    expect(googleRequest.mock.calls[2][0]).toBe(
      "/groups:lookup?groupKey.id=other%40example.com",
    );
  });
});

describe("addGroupMember", () => {
  it("posts a MEMBER membership with the write scope", async () => {
    googleRequest
      .mockResolvedValueOnce({ name: "groups/abc" })
      .mockResolvedValueOnce({ done: true });

    const { addGroupMember } = await importGroups();
    await expect(addGroupMember("uj@example.com")).resolves.toEqual({
      added: true,
    });

    const [path, init] = googleRequest.mock.calls[1];
    expect(path).toBe("/groups/abc/memberships");
    expect(init).toMatchObject({
      method: "POST",
      scope: "https://www.googleapis.com/auth/cloud-identity.groups",
    });
    expect(JSON.parse(init.body)).toEqual({
      preferredMemberKey: { id: "uj@example.com" },
      roles: [{ name: "MEMBER" }],
    });
  });

  it("treats an existing membership as a no-op", async () => {
    googleRequest
      .mockResolvedValueOnce({ name: "groups/abc" })
      .mockRejectedValueOnce(new GoogleApiError(409, {}));

    const { addGroupMember } = await importGroups();
    await expect(addGroupMember("meglevo@example.com")).resolves.toEqual({
      added: false,
    });
  });

  it("rethrows any other API error", async () => {
    googleRequest
      .mockResolvedValueOnce({ name: "groups/abc" })
      .mockRejectedValueOnce(
        new GoogleApiError(403, { error: { message: "Permission denied" } }),
      );

    const { addGroupMember } = await importGroups();
    await expect(addGroupMember("uj@example.com")).rejects.toThrow(
      "Permission denied",
    );
  });
});

describe("removeGroupMember", () => {
  it("looks the membership up and deletes it", async () => {
    googleRequest
      .mockResolvedValueOnce({ name: "groups/abc" })
      .mockResolvedValueOnce({ name: "groups/abc/memberships/7" })
      .mockResolvedValueOnce({});

    const { removeGroupMember } = await importGroups();
    await expect(removeGroupMember("regi@example.com")).resolves.toEqual({
      removed: true,
    });

    expect(googleRequest.mock.calls[1][0]).toBe(
      "/groups/abc/memberships:lookup?memberKey.id=regi%40example.com",
    );
    expect(googleRequest.mock.calls[2]).toEqual([
      "/groups/abc/memberships/7",
      {
        method: "DELETE",
        scope: "https://www.googleapis.com/auth/cloud-identity.groups",
      },
    ]);
  });

  it("reports a member that is not on the list as nothing removed", async () => {
    googleRequest
      .mockResolvedValueOnce({ name: "groups/abc" })
      .mockRejectedValueOnce(new GoogleApiError(404, {}));

    const { removeGroupMember } = await importGroups();
    await expect(removeGroupMember("nincs@example.com")).resolves.toEqual({
      removed: false,
    });
  });

  it("rethrows any other API error", async () => {
    googleRequest
      .mockResolvedValueOnce({ name: "groups/abc" })
      .mockRejectedValueOnce(
        new GoogleApiError(500, { error: { message: "Backend error" } }),
      );

    const { removeGroupMember } = await importGroups();
    await expect(removeGroupMember("regi@example.com")).rejects.toThrow(
      "Backend error",
    );
  });
});
