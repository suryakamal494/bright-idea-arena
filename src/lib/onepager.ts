import { supabase } from "@/integrations/supabase/client";
import { resolveAttachmentUrl } from "@/lib/attachments";
import { fetchSutras, type SubmissionRow } from "@/lib/team";

/** Build and open a printable one-pager for a submission (admin view includes school). */
export async function printOnePager(
  submission: SubmissionRow,
  files: { name: string; url: string; title?: string | null }[],
  opts?: { theme?: string | null; school?: string | null; teamName?: string | null },
) {
  const [sutras, resolved] = await Promise.all([
    fetchSutras(),
    Promise.all(files.map((f) => resolveAttachmentUrl(f.url))),
  ]);
  const sutraNames = (submission.sutra_ids ?? [])
    .map((id) => sutras.find((s) => s.id === id)?.name)
    .filter(Boolean) as string[];

  const esc = (s: string | null | undefined) =>
    (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const attachmentList = files
    .map(
      (f, i) =>
        `<li>${esc(f.title || f.name)}${
          resolved[i] && /^https?:\/\//.test(resolved[i])
            ? ` — <a href="${resolved[i]}">view</a>`
            : ""
        }</li>`,
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(submission.title ?? "Project one-pager")} — Social Innovation Ideathon</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #1c2a22; margin: 40px auto; max-width: 720px; line-height: 1.55; }
  header { border-bottom: 3px solid #152b20; padding-bottom: 12px; margin-bottom: 20px; }
  .brand { font-size: 12px; letter-spacing: 2.5px; text-transform: uppercase; color: #c85a32; font-weight: 700; }
  h1 { font-size: 24px; margin: 8px 0 4px; color: #152b20; }
  .meta { font-size: 13px; color: #5a6b60; }
  h2 { font-size: 13px; letter-spacing: 1.5px; text-transform: uppercase; color: #3d7055; margin: 22px 0 6px; }
  p { margin: 0 0 10px; white-space: pre-wrap; }
  .chips span { display: inline-block; border: 1px solid #d9822b; color: #a35c10; border-radius: 999px; padding: 2px 10px; font-size: 12px; margin: 0 6px 6px 0; }
  .footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 11px; color: #7a8a80; }
  @media print { body { margin: 12mm; } }
</style></head><body>
<header>
  <div class="brand">Social Innovation Ideathon · Organized by ICORG</div>
  <h1>${esc(submission.title ?? "Untitled project")}</h1>
  <div class="meta">
    Team ${esc(submission.team_code ?? "—")}${opts?.teamName ? ` · ${esc(opts.teamName)}` : ""}
    ${opts?.theme ? ` · Theme: ${esc(opts.theme)}` : ""}
    ${opts?.school ? ` · School: ${esc(opts.school)}` : ""}
    · Stage ${submission.stage} · ${submission.status === "submitted" ? "Submitted" : "Draft"}
    ${submission.submitted_at ? ` · ${new Date(submission.submitted_at).toLocaleDateString()}` : ""}
  </div>
</header>
${sutraNames.length ? `<h2>Swarna Andhra Sutras</h2><div class="chips">${sutraNames.map((n) => `<span>${esc(n)}</span>`).join("")}</div>` : ""}
${submission.sutras_explanation ? `<p>${esc(submission.sutras_explanation)}</p>` : ""}
${submission.problem_statement ? `<h2>What is the problem?</h2><p>${esc(submission.problem_statement)}</p>` : ""}
${submission.methodology ? `<h2>What is your proposed solution?</h2><p>${esc(submission.methodology)}</p>` : ""}
${submission.stage === 2 ? `
  ${submission.technical_reasoning ? `<h2>Technical reasoning</h2><p>${esc(submission.technical_reasoning)}</p>` : ""}
  ${submission.prototype_status ? `<h2>Prototype status</h2><p>${esc(submission.prototype_status)}</p>` : ""}
  ${submission.test_outcomes ? `<h2>Test outcomes</h2><p>${esc(submission.test_outcomes)}</p>` : ""}` : ""}
${submission.links || submission.evidence_links ? `<h2>Links</h2><p>${[submission.links, submission.evidence_links].filter(Boolean).map(esc).join("<br/>")}</p>` : ""}
${files.length ? `<h2>Attachments (${files.length})</h2><ul style="margin:0 0 10px;padding-left:18px">${attachmentList}</ul>` : ""}
<div class="footer">Generated from the Social Innovation Ideathon platform · ${new Date().toLocaleDateString()}</div>
<script>window.onload = () => { window.print(); };</script>
</body></html>`;

  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) throw new Error("Allow pop-ups to download the one-pager");
  w.document.write(html);
  w.document.close();
  void supabase;
}
