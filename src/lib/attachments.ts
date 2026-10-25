import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Resolve a submission_files.url value to a viewable URL.
 * Values beginning with "evidence/" are storage object paths; anything else is external. */
export async function resolveAttachmentUrl(url: string): Promise<string> {
  if (!url.startsWith("evidence/")) return url;
  const path = url.replace(/^evidence\//, "");
  const { data } = await supabase.storage.from("evidence").createSignedUrl(path, 3600);
  return data?.signedUrl ?? "";
}

export function useResolvedAttachments(urls: string[]) {
  const [resolved, setResolved] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const u of urls) {
        out[u] = await resolveAttachmentUrl(u);
      }
      if (alive) setResolved(out);
    })();
    return () => {
      alive = false;
    };
  }, [urls.join("|")]);
  return resolved;
}
