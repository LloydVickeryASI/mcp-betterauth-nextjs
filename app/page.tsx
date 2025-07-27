import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between text-sm">
        <h1 className="text-4xl font-bold text-center mb-8">
          MCP Server with Better Auth
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
          Model Context Protocol server with OAuth authentication
        </p>
        <div className="flex justify-center gap-4">
          <Link
            href="/sign-in"
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/connections"
            className="px-6 py-3 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            Manage Connections
          </Link>
        </div>
      </div>
    </main>
  );
}