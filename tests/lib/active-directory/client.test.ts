import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fake } = vi.hoisted(() => ({
  fake: {
    bind: vi.fn(),
    add: vi.fn(),
    modify: vi.fn(),
    search: vi.fn(),
    unbind: vi.fn(),
  },
}));

vi.mock("ldapts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ldapts")>()),
  Client: vi.fn(
    class {
      bind = fake.bind;
      add = fake.add;
      modify = fake.modify;
      search = fake.search;
      unbind = fake.unbind;
    },
  ),
}));

import {
  AlreadyExistsError,
  Attribute,
  type Change,
  Client,
  InsufficientAccessError,
  InvalidCredentialsError,
  NoSuchObjectError,
} from "ldapts";
import {
  ActiveDirectoryError,
  createDirectoryUser,
  replaceDirectoryAttributes,
} from "@/lib/active-directory/client";
import { stubActiveDirectoryEnv } from "../../helpers";

const DN =
  "CN=3f0c9a1e-0000-4000-8000-000000000001,OU=Members,DC=studio,DC=test";
const ATTRS = [new Attribute({ type: "sAMAccountName", values: ["jkovacs"] })];

beforeEach(() => {
  vi.clearAllMocks();
  stubActiveDirectoryEnv();
  for (const method of Object.values(fake)) method.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createDirectoryUser", () => {
  it("binds as the service account, adds, and unbinds", async () => {
    await expect(createDirectoryUser(DN, ATTRS)).resolves.toEqual({
      created: true,
    });
    expect(Client).toHaveBeenCalledWith({
      url: "ldaps://dc.studio.test:636",
      timeout: 15_000,
      connectTimeout: 15_000,
      tlsOptions: {},
    });
    expect(fake.bind).toHaveBeenCalledWith(
      "CN=svc-backstage,OU=Service,DC=studio,DC=test",
      "bind-secret",
    );
    expect(fake.add).toHaveBeenCalledWith(DN, ATTRS);
    expect(fake.unbind).toHaveBeenCalledOnce();
  });

  it("treats an existing entry at the DN as already created", async () => {
    fake.add.mockRejectedValue(new AlreadyExistsError());
    fake.search.mockResolvedValue({
      searchEntries: [{ dn: DN }],
      searchReferences: [],
    });
    await expect(createDirectoryUser(DN, ATTRS)).resolves.toEqual({
      created: false,
    });
    expect(fake.search).toHaveBeenCalledWith(
      DN,
      expect.objectContaining({ scope: "base" }),
    );
  });

  it("fails when another account holds the name", async () => {
    fake.add.mockRejectedValue(new AlreadyExistsError());
    fake.search.mockRejectedValue(new NoSuchObjectError());
    await expect(createDirectoryUser(DN, ATTRS)).rejects.toThrow(
      /another account/,
    );
  });

  it("reports a lookup that fails for another reason", async () => {
    fake.add.mockRejectedValue(new AlreadyExistsError());
    fake.search.mockRejectedValue(new Error("Connection closed"));
    await expect(createDirectoryUser(DN, ATTRS)).rejects.toThrow(
      "Active Directory error: Connection closed",
    );
  });

  it("reports a refused add with its result code", async () => {
    fake.add.mockRejectedValue(new InsufficientAccessError());
    const error = await createDirectoryUser(DN, ATTRS).catch((e) => e);
    expect(error).toBeInstanceOf(ActiveDirectoryError);
    expect(error.code).toBe(50);
    expect(fake.search).not.toHaveBeenCalled();
  });
});

describe("replaceDirectoryAttributes", () => {
  it("replaces each attribute in one modify", async () => {
    await replaceDirectoryAttributes(DN, {
      givenName: "János",
      userAccountControl: "66050",
    });
    expect(fake.modify).toHaveBeenCalledOnce();
    const [dn, changes] = fake.modify.mock.calls[0];
    expect(dn).toBe(DN);
    expect(
      changes.map((c: Change) => [
        c.operation,
        c.modification.type,
        c.modification.values,
      ]),
    ).toEqual([
      ["replace", "givenName", ["János"]],
      ["replace", "userAccountControl", ["66050"]],
    ]);
  });
});

describe("the connection", () => {
  it("reports a refused bind with AD's message and still unbinds", async () => {
    fake.bind.mockRejectedValue(
      new InvalidCredentialsError("80090308: LdapErr: data 52e"),
    );
    const error = await createDirectoryUser(DN, ATTRS).catch((e) => e);
    expect(error).toBeInstanceOf(ActiveDirectoryError);
    expect(error.message).toMatch(/^Active Directory error: .*data 52e/);
    expect(error.code).toBe(49);
    expect(fake.add).not.toHaveBeenCalled();
    expect(fake.unbind).toHaveBeenCalledOnce();
  });

  it("wraps a transport failure", async () => {
    fake.bind.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:636"));
    const error = await createDirectoryUser(DN, ATTRS).catch((e) => e);
    expect(error).toBeInstanceOf(ActiveDirectoryError);
    expect(error.message).toBe(
      "Active Directory error: connect ECONNREFUSED 10.0.0.1:636",
    );
    expect(error.code).toBeUndefined();
  });

  it("wraps a rejection that is not an Error", async () => {
    fake.bind.mockRejectedValue("socket hang up");
    await expect(createDirectoryUser(DN, ATTRS)).rejects.toThrow(
      "Active Directory error: socket hang up",
    );
  });

  it("succeeds even when unbind fails after the change landed", async () => {
    fake.unbind.mockRejectedValue(new Error("socket closed"));
    await expect(createDirectoryUser(DN, ATTRS)).resolves.toEqual({
      created: true,
    });
  });

  it("refuses to connect without configuration", async () => {
    stubActiveDirectoryEnv({ AD_BIND_PASSWORD: "" });
    await expect(createDirectoryUser(DN, ATTRS)).rejects.toThrow(/Missing AD_/);
    expect(Client).not.toHaveBeenCalled();
  });
});
