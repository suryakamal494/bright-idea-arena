import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Resolve a submission_files.url value to a viewable URL.
 * Values beginning with "evidence/" are storage object paths; anything else is external. */

const TTL_MS = 55 * 60 * 1000; // signed URLs last 1h; refresh at 55m
const cache = new Map<string, { url: string; exp: number }>();

export async function resolveAttachmentUrl(url: string): Promise<string> {
  if (!url.startsWith("evidence/")) return url;
  const path = url.replace(/^evidence\//, "");
  const hit = cache.get(path);
  if (hit && hit.exp > Date.now()) return hit.url;
  const { data } = await supabase.storage.from("evidence").createSignedUrl(path, 3600);
  const signed = data?.signedUrl ?? "";
  if (signed) cache.set(path, { url: signed, exp: Date.now() + TTL_MS });
  return signed;
}

export function useResolvedAttachments(urls: string[]) {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      // Parallel resolution: one roundtrip per file, all in flight together.
      const entries = await Promise.all(
        urls.map(async (u) => {
          try {
            return [u, await resolveAttachmentUrl(u)] as const;
          } catch {
            return [u, ""] as const;
          }
        }),
      );
      if (alive) setResolved(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
  }, [urls.join("|")]);
  return resolved;
}
