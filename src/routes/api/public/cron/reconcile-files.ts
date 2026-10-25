import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

const BUCKET = "evidence";
const URL_PREFIX = `${BUCKET}/`;
const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24h: never touch fresh uploads

// Daily reconciliation: removes storage objects that are older than the grace
// period and are not referenced by any submission_files row. Protected by the
// managed cron bearer secret (LOVABLE_CRON_SECRET).
export const Route = createFileRoute("/api/public/cron/reconcile-files")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;

        // Loaded after the caller check — route modules enter the client graph.
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const cutoff = new Date(Date.now() - GRACE_PERIOD_MS).toISOString();

        // Referenced storage paths (url values beginning with "evidence/").
        const { data: files, error: filesError } = await supabaseAdmin
          .from("submission_files")
          .select("url");
        if (filesError) {
          console.error("[reconcile-files] submission_files read failed", filesError);
          return Response.json({ ok: false, error: "files_read_failed" }, { status: 500 });
        }
        const referenced = new Set(
          (files ?? [])
            .filter((f): f is { url: string } => Boolean(f.url?.startsWith(URL_PREFIX)))
            .map((f) => f.url),
        );

        // The generated Database type only covers the public schema, so the
        // storage-schema PostgREST query is typed through a minimal surface.
        type ObjectsQuery = {
          schema: (name: string) => {
            from: (table: string) => {
              select: (columns: string) => {
                eq: (
                  column: string,
                  value: string,
                ) => Promise<{ data: unknown; error: unknown }>;
              };
            };
          };
        };
        const { data: objects, error: objectsError } = await (
          supabaseAdmin as unknown as ObjectsQuery
        )
          .schema("storage")
          .from("objects")
          .select("name, created_at")
          .eq("bucket_id", BUCKET);
        if (objectsError) {
          console.error("[reconcile-files] storage listing failed", objectsError);
          return Response.json({ ok: false, error: "storage_read_failed" }, { status: 500 });
        }
        const bucketObjects = (objects as { name: string; created_at: string }[] | null) ?? [];

        const orphans = bucketObjects
          .filter(
            (o) =>
              !referenced.has(`${URL_PREFIX}${o.name}`) &&
              o.created_at < cutoff,
          )
          .map((o) => o.name);

        let deleted = 0;
        const failures: string[] = [];
        for (let i = 0; i < orphans.length; i += 50) {
          const chunk = orphans.slice(i, i + 50);
          const { error: removeError } = await supabaseAdmin.storage
            .from(BUCKET)
            .remove(chunk);
          if (removeError) {
            failures.push(...chunk);
            console.error("[reconcile-files] remove failed", removeError);
          } else {
            deleted += chunk.length;
          }
        }

        console.log(
          `[reconcile-files] scanned=${bucketObjects.length} referenced=${referenced.size} orphans=${orphans.length} deleted=${deleted} failed=${failures.length}`,
        );
        return Response.json({ ok: true, scanned: bucketObjects.length, referenced: referenced.size, orphans: orphans.length, deleted, failed: failures.length });
      },
    },
  },
});
