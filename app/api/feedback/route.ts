import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { Octokit } from '@octokit/rest';
import * as Sentry from '@sentry/nextjs';

const REPO_OWNER = process.env.GITHUB_REPO_OWNER || "your-github-username";
const REPO_NAME = process.env.GITHUB_REPO_NAME || "mcp-betterauth-nextjs";

export async function POST(req: NextRequest) {
  try {
    // Get session from cookies (web session)
    const session = await auth.api.getSession({
      headers: headers(),
    });

    const body = await req.json();
    const { title, description, type = 'feedback', sentryEventId } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

    // Check if GitHub token is available
    if (!process.env.GITHUB_TOKEN) {
      return NextResponse.json(
        { 
          error: 'GitHub integration not configured',
          message: 'Please report issues manually at: https://github.com/' + REPO_OWNER + '/' + REPO_NAME + '/issues'
        },
        { status: 500 }
      );
    }

    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    // Build issue body
    const contextInfo = [];
    
    if (session?.user) {
      contextInfo.push(
        "## User Information",
        "",
        "**Email:** " + session.user.email,
        "**Name:** " + session.user.name,
        "",
      );
    }

    if (sentryEventId) {
      contextInfo.push(
        "## Error Tracking",
        "",
        "**Sentry Event ID:** `" + sentryEventId + "`",
        "",
      );
    }

    contextInfo.push(
      "**Submitted via:** Web feedback form",
      "**User Agent:** " + req.headers.get('user-agent'),
      "",
    );

    const labels = ['web-feedback'];
    if (type === 'bug') labels.push('bug');
    else if (type === 'feature') labels.push('enhancement');
    else labels.push('feedback');

    const issueBody = [
      "## Description",
      "",
      description,
      "",
      ...contextInfo,
      "---",
      "_This issue was submitted via the web feedback form._",
    ].join("\n");

    const { data: issue } = await octokit.issues.create({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      title: `[${type.toUpperCase()}] ${title}`,
      body: issueBody,
      labels,
    });

    // Track in Sentry
    Sentry.addBreadcrumb({
      category: "feedback",
      message: `Web feedback submitted: Issue #${issue.number}`,
      level: "info",
      data: {
        issueNumber: issue.number,
        issueUrl: issue.html_url,
        type,
      },
    });

    return NextResponse.json({
      success: true,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
    });

  } catch (error) {
    console.error('Error creating feedback issue:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to submit feedback',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}