// Stub: will be implemented after RED phase
export const maxDuration = 60;

export async function GET(_request: Request): Promise<Response> {
  return Response.json({ success: false }, { status: 500 });
}
