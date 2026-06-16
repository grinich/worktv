// Helpers for API route error responses.

// Returns a `{ details }` fragment to merge into an error JSON body, but only
// outside production — so internal error strings (stack-ish messages, paths,
// upstream API errors) aren't leaked to clients in prod. Spread into the body:
//   NextResponse.json({ error: "...", ...errorDetails(error) }, { status: 500 })
export function errorDetails(error: unknown): { details?: string } {
  if (process.env.NODE_ENV === "production") return {};
  return { details: String(error) };
}
