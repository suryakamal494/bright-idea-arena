import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { USERNAME_RE, normalizeUsername, type Profile } from "@/lib/auth";

/** Shown when a signed-in student's profile is missing key fields (e.g. social sign-up). */
export function CompleteProfile({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const [grade, setGrade] = useState(profile.grade ? String(profile.grade) : "");
  const [school, setSchool] = useState(profile.school_name ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [parentEmail, setParentEmail] = useState(profile.parent_email ?? "");
  const [username, setUsername] = useState(profile.username ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const cleanUsername = normalizeUsername(username);
    if (!grade || !school.trim() || !city.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail.trim()) || !USERNAME_RE.test(cleanUsername)) {
      setError("Enter a valid username, parent or guardian email, grade, school and city.");
      return;
    }
    setSaving(true);
    const { data: updatedRows, error: err } = await supabase
      .from("profiles")
      .update({
        grade: Number(grade),
        school_name: school.trim(),
        city: city.trim(),
        phone: phone.trim() || null,
        parent_email: parentEmail.trim(),
        username: cleanUsername,
      })
      .eq("id", profile.id)
      .select("id");
    setSaving(false);
    if (err || !updatedRows) {
      setError(err && /profiles_username_lower_key|duplicate key/i.test(err.message)
        ? "That username is already taken. Please choose another."
        : err?.message ?? "Your profile could not be saved. Please try again.");
      return;
    }
    onDone();
  }

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-2xl font-semibold text-forest">Complete your profile</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Add the details needed for your student workspace. Students sign in with a username; the parent email is for contact only.
      </p>
      <div className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5">
        <div className="space-y-1.5">
          <Label>Student username</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3–30 characters" autoComplete="username" />
        </div>
        <div className="space-y-1.5">
          <Label>Class grade (8–12)</Label>
          <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger>
              <SelectValue placeholder="Select grade" />
            </SelectTrigger>
            <SelectContent>
              {[8, 9, 10, 11, 12].map((g) => (
                <SelectItem key={g} value={String(g)}>
                  Grade {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>School name</Label>
          <Input value={school} onChange={(e) => setSchool(e.target.value)} placeholder="e.g. Sunrise Public School" />
        </div>
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Delhi" />
        </div>
        <div className="space-y-1.5">
          <Label>Phone (optional)</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
        </div>
        <div className="space-y-1.5">
          <Label>Parent or guardian email</Label>
          <Input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="parent@example.com" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button className="w-full" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save and continue"}
        </Button>
      </div>
    </div>
  );
}
