type EmailUrlEnvironment = Partial<
  Record<
    "AUTH_URL" | "NEXTAUTH_URL" | "NODE_ENV" | "PORT" | "VERCEL_URL",
    string
  >
>;

export function getEmailBaseUrl(
  environment: EmailUrlEnvironment = process.env,
) {
  const configuredUrl = environment.AUTH_URL ?? environment.NEXTAUTH_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  if (environment.VERCEL_URL) return `https://${environment.VERCEL_URL}`;
  if (environment.NODE_ENV === "production") {
    throw new Error("AUTH_URL is required outside Vercel in production");
  }

  return `http://localhost:${environment.PORT ?? 3000}`;
}
