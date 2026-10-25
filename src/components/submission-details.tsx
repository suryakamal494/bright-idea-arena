import { useEffect, useState } from "react";
import { ExternalLink, FileText, Image as ImageIcon } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { useResolvedAttachments } from "@/lib/attachments";

type Submission = Database["public"]["Tables"]["submissions"]["Row"];
type SubmissionFile = Database["public"]["Tables"]["submission_files"]["Row"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="eyebrow mb-2">{title}</h3>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

export function SubmissionDetails({
  submission,
  files,
}: {
  submission: Submission;
  files: SubmissionFile[];
}) {
  const urls = files.map((f) => f.url);
  const resolved = useResolvedAttachments(urls);
  const [timings, setTimings] = useState(false);
  useEffect(() => setTimings(true), []);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-forest px-2.5 py-0.5 font-mono text-xs font-semibold text-linen">
            {submission.team_code ?? "TEAM"}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
            Stage {submission.stage} · {submission.stage === 1 ? "Concept Note" : "Final Submission"}
          </span>
          <span
            className={
              "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
              (submission.status === "submitted"
                ? "bg-sage/15 text-sage"
                : "bg-ochre/15 text-ochre")
            }
          >
            {submission.status === "submitted" ? "Submitted" : "Draft"}
          </span>
          {timings && submission.submitted_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(submission.submitted_at).toLocaleString()}
            </span>
          )}
        </div>
        <h2 className="font-display mt-3 text-xl font-semibold text-forest">
          {submission.title ?? "Untitled project"}
        </h2>
        {submission.sdg_tags && submission.sdg_tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {submission.sdg_tags.map((t) => (
              <span key={t} className="rounded-full bg-ochre/10 px-2.5 py-0.5 text-xs font-medium text-ochre">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-5">
        <Section title="Problem statement">{submission.problem_statement}</Section>
        <Section title="Proposed methodology">{submission.methodology}</Section>
        {submission.stage === 2 && (
          <>
            <Section title="Technical reasoning">{submission.technical_reasoning}</Section>
            <Section title="Prototype status">{submission.prototype_status}</Section>
            <Section title="Test outcomes">{submission.test_outcomes}</Section>
          </>
        )}
        {(submission.links || submission.evidence_links) && (
          <Section title="Links">
            <div className="space-y-1">
              {[submission.links, submission.evidence_links].filter(Boolean).map((l, i) => (
                <a
                  key={i}
                  href={l!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-clay underline underline-offset-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> {l}
                </a>
              ))}
            </div>
          </Section>
        )}
        {files.length > 0 && (
          <Section title="Attachments">
            <div className="grid gap-3 sm:grid-cols-2">
              {files.map((f) => {
                const url = resolved[f.url];
                const isImage = /\.(png|jpe?g|gif|webp|avif)$/i.test(f.url) || f.url.includes("picsum");
                return (
                  <div key={f.id} className="overflow-hidden rounded-lg border border-border">
                    {isImage && url ? (
                      <img src={url} alt={f.name} className="h-36 w-full object-cover" />
                    ) : (
                      <div className="flex h-36 items-center justify-center bg-muted">
                        {isImage ? (
                          <ImageIcon className="h-8 w-8 text-muted-foreground" />
                        ) : (
                          <FileText className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="truncate text-xs font-medium">{f.name}</span>
                      {url && (
                        <a href={url} target="_blank" rel="noreferrer" className="text-xs text-clay underline">
                          Open
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
