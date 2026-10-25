import { useQuery } from "@tanstack/react-query";
import type { Database } from "@/integrations/supabase/types";
import { fetchSutras } from "@/lib/team";
import { AttachmentPreviewGrid } from "@/components/attachment-preview";

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
  const { data: sutras } = useQuery({ queryKey: ["sutras"], queryFn: fetchSutras });
  const sutraNames = (submission.sutra_ids ?? [])
    .map((id) => sutras?.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[];

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-forest px-2.5 py-0.5 font-mono text-xs font-semibold text-linen">
            {submission.team_code ?? "TEAM"}
          </span>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
            Stage {submission.stage} · {submission.stage === 1 ? "Project One-Pager" : "Final Submission"}
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
          {submission.submitted_at && (
            <span className="text-xs text-muted-foreground">
              {new Date(submission.submitted_at).toLocaleString()}
            </span>
          )}
        </div>
        <h2 className="font-display mt-3 text-xl font-semibold text-forest">
          {submission.title ?? "Untitled project"}
        </h2>
      </div>

      <div className="space-y-5">
        <Section title="Theme">
          <p className="text-sm text-foreground/90">{submission.theme_name ?? "—"}</p>
        </Section>
        {sutraNames.length > 0 && (
          <Section title="Swarna Andhra Sutras">
            <div className="flex flex-wrap gap-1.5">
              {sutraNames.map((n) => (
                <span key={n} className="rounded-full bg-ochre/10 px-2.5 py-0.5 text-xs font-medium text-ochre">
                  {n}
                </span>
              ))}
            </div>
          </Section>
        )}
        <Section title="How it connects to the Sutras">{submission.sutras_explanation}</Section>
        <Section title="What is the problem?">{submission.problem_statement}</Section>
        <Section title="What is your proposed solution?">{submission.methodology}</Section>
        {submission.stage === 2 && (
          <>
            <Section title="Technical reasoning">{submission.technical_reasoning}</Section>
            <Section title="Prototype status">{submission.prototype_status}</Section>
            <Section title="Test outcomes">{submission.test_outcomes}</Section>
          </>
        )}
        {(submission.links || submission.evidence_links) && (
          <Section title="Additional information · links">
            <div className="space-y-1">
              {[submission.links, submission.evidence_links].filter(Boolean).map((l, i) => (
                <a
                  key={i}
                  href={l!}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-clay underline underline-offset-2"
                >
                  {l}
                </a>
              ))}
            </div>
          </Section>
        )}
        {files.length > 0 && (
          <Section title={`Attachments (${files.length})`}>
            <AttachmentPreviewGrid
              files={files.map((f) => ({
                id: f.id,
                name: f.name,
                url: f.url,
                title: (f as { title?: string | null }).title ?? null,
              }))}
            />
          </Section>
        )}
      </div>
    </div>
  );
}
