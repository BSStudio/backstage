import { authentikRequest } from "./client";

export interface AuthentikUser {
  pk: number;
  uuid: string;
  username: string;
  name: string;
  email: string;
  is_active: boolean;
  path: string;
  attributes: Record<string, unknown>;
  groups: string[];
}

interface PaginatedResult<T> {
  pagination: { count: number; total_pages: number };
  results: T[];
}

async function findUserByUuid(uuid: string): Promise<AuthentikUser | null> {
  const data = await authentikRequest<PaginatedResult<AuthentikUser>>(
    `/core/users/?uuid=${encodeURIComponent(uuid)}`,
  );
  return data.results[0] ?? null;
}

export async function getUserPk(uuid: string): Promise<number> {
  const user = await findUserByUuid(uuid);
  if (!user) throw new Error(`Authentik user not found: ${uuid}`);
  return user.pk;
}

async function findUserByUsername(
  username: string,
): Promise<AuthentikUser | null> {
  const data = await authentikRequest<PaginatedResult<AuthentikUser>>(
    `/core/users/?username=${encodeURIComponent(username)}`,
  );
  return data.results[0] ?? null;
}

export async function findAvailableUsername(
  baseUsername: string,
): Promise<string> {
  if (!(await findUserByUsername(baseUsername))) return baseUsername;
  let suffix = 2;
  while (true) {
    const candidate = `${baseUsername}${suffix}`;
    if (!(await findUserByUsername(candidate))) return candidate;
    suffix++;
  }
}

export async function createUser(data: {
  username: string;
  name: string;
  email: string;
  path?: string;
  groups?: string[];
  attributes?: Record<string, unknown>;
}): Promise<AuthentikUser> {
  return authentikRequest<AuthentikUser>("/core/users/", {
    method: "POST",
    body: JSON.stringify({
      path: "users",
      ...data,
    }),
  });
}

export async function updateUser(
  pk: number,
  data: {
    name?: string;
    email?: string;
    is_active?: boolean;
    path?: string;
    attributes?: Record<string, unknown>;
  },
): Promise<AuthentikUser> {
  return authentikRequest<AuthentikUser>(`/core/users/${pk}/`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}
