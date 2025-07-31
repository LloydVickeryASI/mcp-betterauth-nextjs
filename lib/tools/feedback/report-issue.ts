import { z } from "zod";
import { registerTool, ToolContext } from "@/lib/tools/register-tool";
import { Octokit } from "@octokit/rest";
import * as Sentry from "@sentry/nextjs";

const REPO_OWNER = process.env.GITHUB_REPO_OWNER || "your-github-username";
const REPO_NAME = process.env.GITHUB_REPO_NAME || "mcp-betterauth-nextjs";

export function registerReportIssueTool(server: any) {
  registerTool(
    server,
    "report_issue",
    "Report an issue or feature request to the GitHub repository. Automatically includes session context and error tracking information.",
    {
      title: z.string().describe("Brief title for the issue"),
      description: z.string().describe("Detailed description of the issue or feature request"),
      type: z.enum(["bug", "feature", "improvement"]).describe("Type of issue"),
      sentryEventId: z.string().optional().describe("Optional Sentry event ID if reporting an error"),
      toolName: z.string().optional().describe("Name of the tool that had issues (if applicable)"),
      toolArgs: z.record(z.any()).optional().describe("Arguments passed to the tool (if applicable)"),
    },
    async ({ title, description, type, sentryEventId, toolName, toolArgs }, context: ToolContext) => {
      // Check if GitHub token is available
      if (!process.env.GITHUB_TOKEN) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: true,
              message: "GitHub token not configured. Please set GITHUB_TOKEN environment variable.",
              alternative: "You can manually create an issue at: https://github.com/" + REPO_OWNER + "/" + REPO_NAME + "/issues"
            }, null, 2)
          }]
        };
      }

      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
      });

      // Build issue body with context
      const contextInfo = [
        "## Context Information",
        "",
        "**Reported by:** " + (context.userProfile?.email || "Unknown user"),
        "**User ID:** " + context.session.userId,
        "**Client ID:** " + context.session.clientId,
        "**Session Created:** " + context.session.createdAt.toISOString(),
        "",
      ];

      if (sentryEventId) {
        contextInfo.push(
          "## Error Tracking",
          "",
          "**Sentry Event ID:** `" + sentryEventId + "`",
          "**Sentry Link:** https://sentry.io/organizations/YOUR_ORG/issues/?query=" + sentryEventId,
          "",
        );
      }

      if (toolName) {
        contextInfo.push(
          "## Tool Information",
          "",
          "**Tool Name:** `" + toolName + "`",
        );
        
        if (toolArgs) {
          contextInfo.push(
            "**Tool Arguments:**",
            "```json",
            JSON.stringify(toolArgs, null, 2),
            "```",
            "",
          );
        }
      }

      // Get connected providers
      const connectedProviders = [];
      try {
        const accounts = await context.db
          .selectFrom("account")
          .where("userId", "=", context.session.userId)
          .select(["providerId", "createdAt"])
          .execute();
        
        for (const account of accounts) {
          connectedProviders.push("- " + account.providerId + " (connected " + new Date(account.createdAt).toLocaleDateString() + ")");
        }
      } catch (err) {
        // Ignore errors getting connected providers
      }

      if (connectedProviders.length > 0) {
        contextInfo.push(
          "## Connected Providers",
          "",
          ...connectedProviders,
          "",
        );
      }

      const labels = [];
      switch (type) {
        case "bug":
          labels.push("bug", "mcp-reported");
          break;
        case "feature":
          labels.push("enhancement", "mcp-reported");
          break;
        case "improvement":
          labels.push("improvement", "mcp-reported");
          break;
      }

      const issueBody = [
        "## Description",
        "",
        description,
        "",
        ...contextInfo,
        "---",
        "_This issue was automatically created via the MCP `report_issue` tool._",
      ].join("\n");

      try {
        const { data: issue } = await octokit.issues.create({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          title: `[${type.toUpperCase()}] ${title}`,
          body: issueBody,
          labels,
        });

        // Add breadcrumb for issue creation
        Sentry.addBreadcrumb({
          category: "feedback",
          message: `Created GitHub issue #${issue.number}`,
          level: "info",
          data: {
            issueNumber: issue.number,
            issueUrl: issue.html_url,
            type,
          },
        });

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              issueNumber: issue.number,
              issueUrl: issue.html_url,
              message: `Issue #${issue.number} created successfully`,
            }, null, 2)
          }]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              error: true,
              message: "Failed to create GitHub issue",
              details: errorMessage,
              alternative: "You can manually create an issue at: https://github.com/" + REPO_OWNER + "/" + REPO_NAME + "/issues",
              suggestedTitle: title,
              suggestedBody: issueBody,
            }, null, 2)
          }]
        };
      }
    }
  );
}