import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/broadcasts")({
  head: () => ({
    meta: [
      { title: "Announcements and resources | Social Innovation Ideathon | ICORG" },
      { name: "description", content: "Publish announcements, learning guides, and resources for students." },
      { property: "og:title", content: "Announcements and resources | Social Innovation Ideathon | ICORG" },
      { property: "og:description", content: "Publish announcements, learning guides, and resources for students." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Broadcasts,
});

type AnnouncementRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
};

const KINDS = [
  { value: "broadcast", label: "Announcement" },
  { value: "guide", label: "Guide / toolkit" },
  { value: "live_session", label: "Live session" },
  { value: "resource", label: "Resource link" },
];

type FormErrors = { title?: string; body?: string; link?: string };

function Broadcasts() {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState("broadcast");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  const { data: items } = useQuery({
    queryKey: ["admin-announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id,kind,title,body,link,created_at")
        .order("created_at", { ascending: false });
      return (data ?? []) as AnnouncementRow[];
    },
  });

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!title.trim()) errs.title = "Give the announcement a title.";
    if (!body.trim()) errs.body = "Write the message students should see.";
    const l = link.trim();
    if (l && !/^https?:\/\/\S+\.\S+/i.test(l)) errs.link = "Enter a full URL starting with https://";
    return errs;
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (errs.title || errs.body || errs.link) return; // inline errors guide the fix
    setBusy(true);
    const user = await getSessionUser();
    const { error } = await supabase.from("announcements").insert({
      kind,
      title: title.trim(),
      body: body.trim(),
      link: link.trim() || null,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Published to every student feed");
    setTitle("");
    setBody("");
    setLink("");
    setErrors({});
    queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
  }

  async function remove(id: string) {
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-announcements"] });
  }

  const flag = (bad?: string) =>
    bad ? "border-destructive focus-visible:ring-destructive" : undefined;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[400px_1fr]">
      <div className="space-y-5">
        <header>
          <p className="eyebrow">Broadcasts & resources</p>
          <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">Publish to students</h1>
        </header>
        <Card>
          <CardContent className="pt-5">
            <form onSubmit={publish} noValidate className="space-y-3.5">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  aria-invalid={!!errors.title}
                  className={flag(errors.title)}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Prototype clinic on Saturday"
                />
                {errors.title && <p className="text-xs text-destructive" role="alert">{errors.title}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Message</Label>
                <Textarea
                  rows={4}
                  aria-invalid={!!errors.body}
                  className={flag(errors.body)}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Details students should see…"
                />
                {errors.body && <p className="text-xs text-destructive" role="alert">{errors.body}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Link (optional)</Label>
                <Input
                  aria-invalid={!!errors.link}
                  className={flag(errors.link)}
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="https://zoom.us/… or toolkit URL"
                />
                {errors.link && <p className="text-xs text-destructive" role="alert">{errors.link}</p>}
              </div>
              <Button type="submit" className="w-full bg-clay hover:bg-clay/90" disabled={busy}>
                <Megaphone className="mr-1.5 h-4 w-4" /> {busy ? "Publishing…" : "Publish"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Published feed</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {(items ?? []).map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{a.kind}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold">{a.title}</p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{a.body}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(a.id)} aria-label="Delete announcement">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          {(items ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing published yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
