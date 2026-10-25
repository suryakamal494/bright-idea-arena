import { ExternalLink, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useResolvedAttachments } from "@/lib/attachments";

export type AttachmentRow = {
  id: string;
  name: string;
  url: string;
  title?: string | null;
};

export function isImageFile(url: string) {
  return /\.(png|jpe?g|gif|webp|avif)$/i.test(url) || url.includes("picsum");
}

export function isPdfFile(url: string) {
  return /\.pdf($|\?)/i.test(url) || url.toLowerCase().endsWith(".pdf");
}

/** Grid of attachments with inline image previews and PDF preview dialog. */
export function AttachmentPreviewGrid({ files }: { files: AttachmentRow[] }) {
  const urls = files.map((f) => f.url);
  const resolved = useResolvedAttachments(urls);
  const [preview, setPreview] = useState<AttachmentRow | null>(null);

  if (files.length === 0) return null;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {files.map((f) => {
          const url = resolved[f.url];
          const image = isImageFile(f.url);
          const pdf = isPdfFile(f.url);
          return (
            <div key={f.id} className="overflow-hidden rounded-lg border border-border">
              {image && url ? (
                <img src={url} alt={f.title || f.name} className="h-36 w-full object-cover" />
              ) : (
                <div className="flex h-36 items-center justify-center bg-muted">
                  {pdf ? (
                    <FileText className="h-8 w-8 text-clay" />
                  ) : url ? (
                    <img src={url} alt={f.title || f.name} className="h-36 w-full object-cover" />
                  ) : (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  )}
                </div>
              )}
              <div className="space-y-0.5 px-3 py-2">
                <p className="truncate text-xs font-semibold">{f.title || f.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{f.name}</p>
                <div className="flex items-center gap-3 pt-0.5">
                  {(url && (image || pdf)) && (
                    <button
                      onClick={() => setPreview(f)}
                      className="text-xs font-medium text-clay underline underline-offset-2"
                    >
                      Preview
                    </button>
                  )}
                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-clay underline underline-offset-2"
                    >
                      <ExternalLink className="h-3 w-3" /> Open
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview ? preview.title || preview.name : ""}</DialogTitle>
          </DialogHeader>
          {preview &&
            (isPdfFile(preview.url) ? (
              <iframe
                src={resolved[preview.url] ?? ""}
                title={preview.title || preview.name}
                className="h-[70vh] w-full rounded-lg border border-border"
              />
            ) : (
              <img
                src={resolved[preview.url] ?? ""}
                alt={preview.title || preview.name}
                className="w-full rounded-lg"
              />
            ))}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AttachmentDownloadButton({ className }: { className?: string }) {
  return (
    <Button variant="outline" size="sm" className={className}>
      Download
    </Button>
  );
}
