import bcrypt from "bcryptjs";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const PASSWORD_RESET_IDENTIFIER_PREFIX = "password-reset:";

export function getCredentialsLoginRateLimitRules(
  normalizedEmail: string,
  requestSubject: string,
) {
  return [
    {
      limit: 500,
      scope: "auth:login:global",
      subject: "credentials",
      windowMs: LOGIN_WINDOW_MS,
    },
    {
      limit: 20,
      scope: "auth:login:address",
      subject: requestSubject,
      windowMs: LOGIN_WINDOW_MS,
    },
    {
      limit: 8,
      scope: "auth:login:email",
      subject: normalizedEmail,
      windowMs: LOGIN_WINDOW_MS,
    },
  ];
}

export function getSignupRateLimitRules(
  normalizedEmail: string,
  requestSubject: string,
) {
  return [
    {
      limit: 100,
      scope: "auth:signup:global",
      subject: "signup",
      windowMs: HOUR_MS,
    },
    {
      limit: 5,
      scope: "auth:signup:address",
      subject: requestSubject,
      windowMs: HOUR_MS,
    },
    {
      limit: 3,
      scope: "auth:signup:email",
      subject: normalizedEmail,
      windowMs: HOUR_MS,
    },
  ];
}

export function getVerificationEmailRateLimitRules(
  normalizedEmail: string,
  requestSubject: string,
) {
  return [
    {
      limit: 100,
      scope: "auth:verification:global",
      subject: "verification",
      windowMs: HOUR_MS,
    },
    {
      limit: 10,
      scope: "auth:verification:address",
      subject: requestSubject,
      windowMs: HOUR_MS,
    },
    {
      limit: 3,
      scope: "auth:verification:email",
      subject: normalizedEmail,
      windowMs: HOUR_MS,
    },
  ];
}

export function getPasswordResetRequestRateLimitRules(
  normalizedEmail: string,
  requestSubject: string,
) {
  return [
    {
      limit: 100,
      scope: "auth:password-reset-request:global",
      subject: "password-reset",
      windowMs: HOUR_MS,
    },
    {
      limit: 10,
      scope: "auth:password-reset-request:address",
      subject: requestSubject,
      windowMs: HOUR_MS,
    },
    {
      limit: 3,
      scope: "auth:password-reset-request:email",
      subject: normalizedEmail,
      windowMs: HOUR_MS,
    },
  ];
}

export function getPasswordResetCommitRateLimitRules(
  token: string,
  requestSubject: string,
) {
  return [
    {
      limit: 200,
      scope: "auth:password-reset:global",
      subject: "password-reset",
      windowMs: LOGIN_WINDOW_MS,
    },
    {
      limit: 20,
      scope: "auth:password-reset:address",
      subject: requestSubject,
      windowMs: LOGIN_WINDOW_MS,
    },
    {
      limit: 5,
      scope: "auth:password-reset:token",
      subject: token,
      windowMs: LOGIN_WINDOW_MS,
    },
  ];
}

export function getEmailVerificationCommitRateLimitRules(
  token: string,
  requestSubject: string,
) {
  return [
    {
      limit: 200,
      scope: "auth:verify-token:global",
      subject: "email-verification",
      windowMs: LOGIN_WINDOW_MS,
    },
    {
      limit: 20,
      scope: "auth:verify-token:address",
      subject: requestSubject,
      windowMs: LOGIN_WINDOW_MS,
    },
    {
      limit: 5,
      scope: "auth:verify-token:token",
      subject: token,
      windowMs: LOGIN_WINDOW_MS,
    },
  ];
}

export function isBcryptPasswordSupported(password: string) {
  return !bcrypt.truncates(password);
}

export async function matchesSupportedBcryptPassword(
  password: string,
  passwordHash: string,
) {
  return (
    isBcryptPasswordSupported(password) &&
    (await bcrypt.compare(password, passwordHash))
  );
}

export function isReplaceableLegacyRegistration(input: {
  accountCount: number;
  emailVerified: Date | null;
  passwordHash: string | null;
  sessionCount: number;
}) {
  return (
    input.emailVerified === null &&
    input.passwordHash !== null &&
    input.accountCount === 0 &&
    input.sessionCount === 0
  );
}

export function isVerificationTokenExpired(expires: Date, now = new Date()) {
  return expires.getTime() <= now.getTime();
}

export function getPasswordResetIdentifier(normalizedEmail: string) {
  return `${PASSWORD_RESET_IDENTIFIER_PREFIX}${normalizedEmail}`;
}

export function isPasswordResetIdentifier(identifier: string) {
  return identifier.startsWith(PASSWORD_RESET_IDENTIFIER_PREFIX);
}
