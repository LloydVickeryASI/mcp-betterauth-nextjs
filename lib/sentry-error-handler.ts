import * as Sentry from "@sentry/nextjs";

export function handleMcpError(err: unknown): string {
  const eventId = Sentry.captureException(err);

  return [
    "**Error**",
    "There was a problem with your request.",
    "Please report the following to the user:",
    `**Event ID**: ${eventId}`,
    process.env.NODE_ENV !== "production"
      ? err instanceof Error
        ? err.message
        : String(err)
      : "",
  ].join("\n\n");
}