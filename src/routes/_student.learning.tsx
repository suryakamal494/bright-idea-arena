import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from "@tanstack/react-query";
import { BookOpen, FileDown, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_student/learning")({
  head: () => ({
    meta: [{ title: "Resources — Social Innovation Ideathon" }],
  }),
  component: LearningCenter,
});

type AnnouncementRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
};

function LearningCenter() {
  const { data: items, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id,kind,title,body,link,created_at")
        .order("created_at", { ascending: false });
      return ((data ?? []) as AnnouncementRow[]).filter(
        (a) => a.kind === "guide" || a.kind === "live_session" || a.kind === "resource",
      );
    },
  });

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading resources…</p>;
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Resources</p>
        <h1 className="font-display mt-1.5 text-2xl font-semibold leading-tight text-forest sm:text-3xl">
          Guides, toolkits & live sessions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything the organisers publish to help you through both stages.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {(items ?? []).map((a) => {
          const live = a.kind === "live_session";
          return (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <span
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-full " +
                    (live ? "bg-clay/12 text-clay" : "bg-sage/12 text-sage")
                  }
                >
                  {live ? <Radio className="h-4.5 w-4.5" /> : <BookOpen className="h-4.5 w-4.5" />}
                </span>
                <span
                  className={
                    "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                    (live ? "bg-clay/12 text-clay" : "bg-sage/12 text-sage")
                  }
                >
                  {live ? "Live session" : a.kind === "guide" ? "Guide" : "Toolkit"}
                </span>
              </div>
              <h2 className="font-display mt-3 text-lg font-semibold text-forest">{a.title}</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {a.body}
              </p>
              {a.link && (
                <a
                  href={a.link}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-clay underline underline-offset-2"
                >
                  {live ? "Join session" : <><FileDown className="h-4 w-4" /> Download</>}
                </a>
              )}
            </div>
          );
        })}
      </div>
      {(items ?? []).length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No resources yet — check back soon.
        </p>
      )}
    </div>
  );
}
