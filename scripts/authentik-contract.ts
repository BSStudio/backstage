import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { done, fail, hasFlag, info, step } from "./utils";

// authentik's `main` runs ahead of the released versions, which is the point: a field
// rename shows up here before the instance is upgraded into it.
const SCHEMA_URL =
  process.env.AUTHENTIK_SCHEMA_URL ??
  "https://raw.githubusercontent.com/goauthentik/authentik/main/schema.yml";

const SNAPSHOT_PATH = path.join(__dirname, "authentik-contract.json");

// Exit code the workflow reads to tell "could not reach the spec" apart from real drift, so a
// network flake does not file a drift issue — and does not then block the real one on title dedup.
const UNAVAILABLE = 2;

const FETCH_TIMEOUT_MS = 30_000;
const FETCH_ATTEMPTS = 3;

interface Endpoint {
  method: string;
  path: string;
  /** Query parameters `lib/authentik/*` sends. */
  query?: string[];
  /** Request body fields we send, as paths into the request schema. */
  request?: string[];
  responseStatus: string;
  /** Response fields we read, as paths into the response schema. */
  response?: string[];
}

// Every call `lib/authentik/{client,users,groups}.ts` makes, and every field it
// touches on the way in or out. Adding a call there means adding it here.
const CONTRACT: Endpoint[] = [
  {
    method: "get",
    path: "/core/users/",
    query: ["username", "uuid"],
    responseStatus: "200",
    response: [
      "pagination.count",
      "pagination.total_pages",
      "results[].pk",
      "results[].uuid",
      "results[].username",
      "results[].name",
      "results[].email",
      "results[].is_active",
      "results[].path",
      "results[].attributes",
      "results[].groups",
    ],
  },
  {
    method: "post",
    path: "/core/users/",
    request: ["username", "name", "email", "path", "groups", "attributes"],
    responseStatus: "201",
    response: ["pk", "uuid", "username", "name", "email", "is_active"],
  },
  {
    method: "patch",
    path: "/core/users/{id}/",
    request: ["name", "email", "is_active", "path", "attributes"],
    responseStatus: "200",
    response: ["pk", "uuid", "username", "name", "email", "is_active"],
  },
  {
    method: "post",
    path: "/core/groups/{group_uuid}/add_user/",
    request: ["pk"],
    responseStatus: "204",
  },
  {
    method: "post",
    path: "/core/groups/{group_uuid}/remove_user/",
    request: ["pk"],
    responseStatus: "204",
  },
];

type Json = Record<string, unknown>;

function deref(doc: Json, node: unknown): Json | undefined {
  let current = node;
  let hops = 0;
  while (
    current &&
    typeof current === "object" &&
    typeof (current as Json).$ref === "string"
  ) {
    if (hops++ > 20) return undefined;
    const segments = ((current as Json).$ref as string)
      .replace(/^#\//, "")
      .split("/");
    let resolved: unknown = doc;
    for (const segment of segments) {
      resolved = (resolved as Json | undefined)?.[segment];
    }
    current = resolved;
  }
  return current as Json | undefined;
}

/** A one-line shape for a field: enough that a rename or a type change moves it. */
function describe(schema: Json | undefined, required: boolean): string {
  if (!schema) return "MISSING";
  const type = Array.isArray(schema.type)
    ? schema.type.join("|")
    : ((schema.type as string) ?? "unknown");
  const parts = [type === "array" ? `array<${itemType(schema)}>` : type];
  if (schema.format) parts.push(String(schema.format));
  if (schema.nullable) parts.push("nullable");
  if (schema.readOnly) parts.push("readOnly");
  parts.push(required ? "required" : "optional");
  return parts.join(", ");
}

function itemType(schema: Json): string {
  const items = schema.items as Json | undefined;
  if (!items) return "unknown";
  if (typeof items.$ref === "string") return items.$ref.split("/").pop() ?? "";
  return String(items.type ?? "unknown");
}

function jsonSchema(doc: Json, holder: Json | undefined): Json | undefined {
  const content = holder?.content as Json | undefined;
  const media = content?.["application/json"] as Json | undefined;
  return deref(doc, media?.schema);
}

/** Walks `results[].pk` style paths, dereferencing as it goes. */
function fieldShape(doc: Json, root: Json | undefined, field: string): string {
  let schema = root;
  let required = false;

  for (const rawSegment of field.split(".")) {
    const isArray = rawSegment.endsWith("[]");
    const key = isArray ? rawSegment.slice(0, -2) : rawSegment;
    const properties = schema?.properties as Json | undefined;
    const next = deref(doc, properties?.[key]);
    if (!next) return "MISSING";
    required = Array.isArray(schema?.required)
      ? (schema.required as string[]).includes(key)
      : false;
    schema = isArray ? deref(doc, next.items) : next;
    if (isArray && !schema) return "MISSING";
  }

  return describe(schema, required);
}

function extract(doc: Json, endpoint: Endpoint): Json {
  const paths = doc.paths as Json | undefined;
  const operation = (paths?.[endpoint.path] as Json | undefined)?.[
    endpoint.method
  ] as Json | undefined;
  if (!operation) return { operation: "MISSING" };

  const result: Json = { operationId: operation.operationId ?? "MISSING" };

  if (endpoint.query) {
    const parameters = (operation.parameters ?? []) as Json[];
    const query: Json = {};
    for (const name of endpoint.query) {
      const parameter = parameters
        .map((p) => deref(doc, p))
        .find((p) => p?.in === "query" && p?.name === name);
      query[name] = parameter
        ? describe(deref(doc, parameter.schema), parameter.required === true)
        : "MISSING";
    }
    result.query = query;
  }

  if (endpoint.request) {
    const schema = jsonSchema(doc, deref(doc, operation.requestBody));
    const request: Json = {};
    for (const field of endpoint.request) {
      request[field] = fieldShape(doc, schema, field);
    }
    result.request = request;
    // The whole list, not just the fields above: a field we never send being promoted to
    // required breaks the call, and listing only what we touch would not see it.
    result.requestRequired = Array.isArray(schema?.required)
      ? [...(schema.required as string[])].sort()
      : [];
  }

  const responses = operation.responses as Json | undefined;
  const response = deref(doc, responses?.[endpoint.responseStatus]);
  if (!response) {
    result.response = `MISSING ${endpoint.responseStatus}`;
    return result;
  }

  if (endpoint.response) {
    const schema = jsonSchema(doc, response);
    const fields: Json = {};
    for (const field of endpoint.response) {
      fields[field] = fieldShape(doc, schema, field);
    }
    result.response = { status: endpoint.responseStatus, fields };
  } else {
    result.response = { status: endpoint.responseStatus };
  }

  return result;
}

async function download(url: string): Promise<string> {
  let lastError = "";
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.ok) return await response.text();
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < FETCH_ATTEMPTS) {
      info(`Attempt ${attempt} failed (${lastError}) — retrying`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  fail(`Could not download ${url} — ${lastError}`, UNAVAILABLE);
}

async function loadSchema(): Promise<Json> {
  const text = SCHEMA_URL.startsWith("http")
    ? await download(SCHEMA_URL)
    : readFileSync(SCHEMA_URL, "utf8");

  const document = parse(text) as Json | null;
  // A proxy notice or an error page is still valid YAML, and would otherwise read as every
  // endpoint disappearing upstream at once.
  if (!document?.paths || typeof document.paths !== "object") {
    fail(
      `${SCHEMA_URL} is not an OpenAPI document — no \`paths\` object.`,
      UNAVAILABLE,
    );
  }
  return document;
}

// Flattening before diffing, rather than comparing the serialized lines, because one inserted
// field would otherwise shift every following line and report as drift.
function flatten(
  value: unknown,
  prefix: string,
  out: Map<string, string>,
): void {
  if (Array.isArray(value)) {
    out.set(prefix, `[${value.join(", ")}]`);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix} › ${key}` : key, out);
    }
    return;
  }
  out.set(prefix, String(value));
}

function diff(previous: unknown, next: unknown): string[] {
  const before = new Map<string, string>();
  const after = new Map<string, string>();
  flatten(previous, "", before);
  flatten(next, "", after);

  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();
  const changes: string[] = [];
  for (const key of keys) {
    const was = before.get(key);
    const now = after.get(key);
    if (was === now) continue;
    changes.push(
      `${key}\n      was: ${was ?? "(absent)"}\n      now: ${now ?? "(gone)"}`,
    );
  }
  return changes;
}

async function main(): Promise<void> {
  step(`Reading the authentik OpenAPI schema from ${SCHEMA_URL}`);
  const document = await loadSchema();

  const current: Json = {};
  for (const endpoint of CONTRACT) {
    current[`${endpoint.method.toUpperCase()} ${endpoint.path}`] = extract(
      document,
      endpoint,
    );
  }
  if (hasFlag("--update")) {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(current, null, 2)}\n`);
    done(`Snapshot rewritten: ${SNAPSHOT_PATH}`);
    return;
  }

  // Compared as parsed values, not as text: lint-staged runs Biome over the snapshot, and Biome
  // collapses the short arrays that JSON.stringify always expands.
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Json;
  const changes = diff(snapshot, current);
  if (changes.length === 0) {
    done(`No drift across ${CONTRACT.length} endpoints.`);
    return;
  }

  step("The published schema no longer matches the committed snapshot");
  for (const change of changes) info(change);
  fail(
    "Check what changed upstream, fix lib/authentik/* if needed, then run\n" +
      "  pnpm authentik:contract --update",
  );
}

// An unexpected throw is not proven drift, so it exits as unavailable rather than filing an issue.
main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error), UNAVAILABLE);
});
