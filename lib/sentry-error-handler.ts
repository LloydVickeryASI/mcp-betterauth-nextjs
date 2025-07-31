import * as Sentry from "@sentry/nextjs";

export interface MscpErrorResponse {
  message: string;
  eventId: string;
}

export function handleMcpError(err: unknown): MscpErrorResponse {
  const eventId = Sentry.captureException(err);

  const message = [
    "**Error**",
    "There was a problem with your request.",
    "",
    `**Event ID**: ${eventId}`,
    "",
    "You can report this issue using:",
    `\`report_issue\` tool with sentryEventId: "${eventId}"`,
    "",
    process.env.NODE_ENV !== "production"
      ? err instanceof Error
        ? `**Details**: ${err.message}`
        : `**Details**: ${String(err)}`
      : "",
  ].join("\n");

  return { message, eventId };
}