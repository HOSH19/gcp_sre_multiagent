import { proxyTo } from "@/lib/serverProxy";

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(req: Request, ctx: Ctx) {
  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!base) return Response.json({ error: "API_URL not configured" }, { status: 500 });
  const { path } = await ctx.params;
  const targetPath = path.join("/");
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
  const upstream = await proxyTo(base, targetPath, { method: req.method, body });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}

export const GET = handle;
export const POST = handle;
