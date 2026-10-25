import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const MIN_PASSWORD = 8;

/** Returns an error message, or null when the pair is acceptable. */
export function validateNewPassword(pw: string, confirm: string, current?: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (pw !== confirm) return "The two passwords don't match.";
  if (current !== undefined && current === pw) return "New password must differ from the current one.";
  return null;
}

export function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("rate") || m.includes("security purposes")) return "Too many attempts. Please wait a minute and try again.";
  if (m.includes("same") && m.includes("password")) return "New password must differ from the current one.";
  if (m.includes("weak") || m.includes("pwned") || m.includes("leaked")) return "This password is too common. Choose a stronger one.";
  if (m.includes("current password") || m.includes("invalid login")) return "Your current password is incorrect.";
  return msg;
}

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [isGoogle, setIsGoogle] = useState(false);
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCurrent(""); setPw(""); setConfirm(""); setError(null); setShow(false);
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setEmail(u?.email ?? null);
      const providers = (u?.identities ?? []).map((i) => i.provider);
      setIsGoogle(providers.length > 0 && !providers.includes("email"));
    });
  }, [open]);

  const isDemo = !!email?.toLowerCase().endsWith("@demo.in");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validateNewPassword(pw, confirm, isGoogle ? undefined : current);
    if (v) return setError(v);
    if (!email) return setError("Your session has expired. Please sign in again.");
    setBusy(true);
    setError(null);
    if (!isGoogle) {
      // Verify current password explicitly so a wrong one never silently passes.
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (authErr) {
        setBusy(false);
        return setError(friendlyAuthError(authErr.message.includes("Invalid") ? "current password" : authErr.message));
      }
    }
    const { error: err } = await supabase.auth.updateUser(
      isGoogle ? { password: pw } : ({ password: pw, current_password: current } as { password: string }),
    );
    setBusy(false);
    if (err) return setError(friendlyAuthError(err.message));
    toast.success("Password updated. Use it next time you sign in.");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isGoogle ? "Set a password" : "Change password"}</DialogTitle>
          <DialogDescription>
            {isGoogle
              ? "You sign in with Google. Setting a password lets you also sign in with your email."
              : "Enter your current password, then choose a new one."}
          </DialogDescription>
        </DialogHeader>
        {isDemo ? (
          <p className="rounded-lg border border-border bg-muted p-3 text-sm">
            Demo accounts share one password so everyone can test them. Changing it is disabled.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {!isGoogle && (
              <div className="space-y-1.5">
                <Label htmlFor="cp-current">Current password</Label>
                <Input id="cp-current" type={show ? "text" : "password"} autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="cp-new">New password</Label>
              <Input id="cp-new" type={show ? "text" : "password"} autoComplete="new-password" required minLength={MIN_PASSWORD} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="8+ characters" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-confirm">Confirm new password</Label>
              <Input id="cp-confirm" type={show ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
            </label>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full bg-clay hover:bg-clay/90" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
