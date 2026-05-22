import { createHash, pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { getPool } from "./db";

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthSession = {
  user: AuthUser;
};

export const authCookieName = "what_now_session";

const sessionDays = 30;
const passwordIterations = 210000;
const passwordKeyLength = 32;
const passwordDigest = "sha256";
const passwordResetMinutes = 30;

type UserRow = {
  id: string;
  email: string;
};

type SessionRow = {
  user_id: string;
  email: string;
};

type PasswordResetRow = {
  user_id: string;
  email: string;
};

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export async function ensureAuthSchema() {
  const db = getPool();
  if (!db) throw new AuthError("Sign in requires a database connection.");

  await db.query(`
    create table if not exists users (
      id text primary key,
      email text not null unique,
      password_hash text not null,
      created_at timestamptz not null default now()
    )
  `);
  await db.query(`
    create table if not exists auth_sessions (
      id bigserial primary key,
      user_id text not null references users(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `);
  await db.query(`
    create table if not exists password_reset_tokens (
      id bigserial primary key,
      user_id text not null references users(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await db.query("create index if not exists auth_sessions_user_idx on auth_sessions (user_id)");
  await db.query("create index if not exists auth_sessions_expires_idx on auth_sessions (expires_at)");
  await db.query("create index if not exists password_reset_tokens_user_idx on password_reset_tokens (user_id)");
  await db.query("create index if not exists password_reset_tokens_expires_idx on password_reset_tokens (expires_at)");

  return db;
}

export async function createUserSession(email: string, password: string) {
  const db = await ensureAuthSchema();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizePassword(password);
  const id = `user-${randomUUID()}`;

  try {
    const result = await db.query<UserRow>(
      "insert into users (id, email, password_hash) values ($1, $2, $3) returning id, email",
      [id, normalizedEmail, hashPassword(normalizedPassword)]
    );

    return createSessionForUser(result.rows[0]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AuthError("An account already exists for that email.");
    throw error;
  }
}

export async function verifyUserSession(email: string, password: string) {
  const db = await ensureAuthSchema();
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizePassword(password);
  const result = await db.query<UserRow & { password_hash: string }>(
    "select id, email, password_hash from users where email = $1",
    [normalizedEmail]
  );
  const user = result.rows[0];

  if (!user || !verifyPassword(normalizedPassword, user.password_hash)) {
    throw new AuthError("Email or password was not recognized.");
  }

  return createSessionForUser(user);
}

export async function createPasswordResetToken(email: string) {
  const db = await ensureAuthSchema();
  let normalizedEmail: string;

  try {
    normalizedEmail = normalizeEmail(email);
  } catch (error) {
    if (error instanceof AuthError) return null;
    throw error;
  }

  const userResult = await db.query<UserRow>("select id, email from users where email = $1", [normalizedEmail]);
  const user = userResult.rows[0];
  if (!user) return null;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + passwordResetMinutes * 60 * 1000);

  await db.query("delete from password_reset_tokens where user_id = $1 and (used_at is not null or expires_at <= now())", [user.id]);
  await db.query("insert into password_reset_tokens (user_id, token_hash, expires_at) values ($1, $2, $3)", [
    user.id,
    hashToken(token),
    expiresAt
  ]);

  return { email: user.email, token, expiresAt };
}

export async function resetPasswordWithToken(token: string, password: string) {
  const db = await ensureAuthSchema();
  const normalizedToken = token.trim();
  if (!normalizedToken) throw new AuthError("Reset token is required.");
  const normalizedPassword = normalizePassword(password);

  const result = await db.query<PasswordResetRow>(
    `select password_reset_tokens.user_id, users.email
     from password_reset_tokens
     join users on users.id = password_reset_tokens.user_id
     where password_reset_tokens.token_hash = $1
       and password_reset_tokens.expires_at > now()
       and password_reset_tokens.used_at is null
     limit 1`,
    [hashToken(normalizedToken)]
  );
  const reset = result.rows[0];
  if (!reset) throw new AuthError("Reset link is invalid or expired.");

  await db.query("update users set password_hash = $1 where id = $2", [hashPassword(normalizedPassword), reset.user_id]);
  await db.query("update password_reset_tokens set used_at = now() where token_hash = $1", [hashToken(normalizedToken)]);
  await db.query("delete from auth_sessions where user_id = $1", [reset.user_id]);

  return createSessionForUser({ id: reset.user_id, email: reset.email });
}

export async function getAuthSession(request: Request): Promise<AuthSession | null> {
  const token = readCookie(request.headers.get("cookie"), authCookieName);
  if (!token) return null;

  const db = getPool();
  if (!db) return null;

  try {
    await ensureAuthSchema();
    const result = await db.query<SessionRow>(
      `select auth_sessions.user_id, users.email
       from auth_sessions
       join users on users.id = auth_sessions.user_id
       where auth_sessions.token_hash = $1
         and auth_sessions.expires_at > now()
       limit 1`,
      [hashToken(token)]
    );
    const row = result.rows[0];
    if (!row) return null;

    return { user: { id: row.user_id, email: row.email } };
  } catch (error) {
    console.error("Could not read auth session.", error);
    return null;
  }
}

export async function deleteSession(token: string | null) {
  if (!token) return;
  const db = getPool();
  if (!db) return;

  await db.query("delete from auth_sessions where token_hash = $1", [hashToken(token)]);
}

export function readAuthToken(request: Request) {
  return readCookie(request.headers.get("cookie"), authCookieName);
}

export function buildAuthCookie(token: string) {
  const maxAge = sessionDays * 24 * 60 * 60;
  return `${authCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function buildClearAuthCookie() {
  return `${authCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function resolvePersonalizationUserId(request: Request, providedUserId?: string | null) {
  const session = await getAuthSession(request);
  return session?.user.id ?? providedUserId?.trim() ?? "anonymous-user";
}

async function createSessionForUser(user: AuthUser) {
  const db = await ensureAuthSchema();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

  await db.query("insert into auth_sessions (user_id, token_hash, expires_at) values ($1, $2, $3)", [
    user.id,
    hashToken(token),
    expiresAt
  ]);

  return { user, token };
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AuthError("Enter a valid email address.");
  }

  return normalized;
}

function normalizePassword(password: string) {
  if (password.length < 8) throw new AuthError("Password must be at least 8 characters.");
  return password;
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, passwordIterations, passwordKeyLength, passwordDigest).toString("base64url");
  return `pbkdf2$${passwordIterations}$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [scheme, iterations, salt, hash] = storedHash.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash) return false;

  const actual = Buffer.from(hash, "base64url");
  const expected = pbkdf2Sync(password, salt, Number(iterations), actual.length, passwordDigest);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const cookie = cookies.find((item) => item.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
