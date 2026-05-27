// Generates overlay preset suggestions from a background image via vision AI.
// Not yet implemented — returns 501 until the feature is specced and built.
export async function POST(): Promise<Response> {
  return Response.json({ error: "not implemented" }, { status: 501 });
}
