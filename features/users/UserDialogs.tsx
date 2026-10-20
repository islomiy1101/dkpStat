"use client";

import { useMemo, useState } from "react";
import type { UserRow } from "@/lib/auth-server";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/roles";

/**
 * "Foydalanuvchilar" oynalari: yangi foydalanuvchi / tahrirlash va bloklash.
 * Uslub — globals.css (.sb-confirm) + styles/users.css (.us-dlg-*).
 */

async function sendJson(url: string, body: unknown, method: "POST" | "PATCH" = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) window.location.replace("/login?next=/users");
  if (!res.ok || !json.success) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

function Dialog({ title, icon, tone, onClose, busy, children }: {
  title: string;
  icon: string;
  tone: "blue" | "red";
  onClose: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="sb-confirm" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="sb-confirm-card us-dlg">
        <button type="button" className="sb-pw-x" onClick={onClose} disabled={busy} aria-label="Yopish"><i className="fa-solid fa-xmark" /></button>
        <div className={`sb-confirm-icon ${tone === "red" ? "" : "sb-pw-icon"}`}><i className={icon} /></div>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/* ---------------- Yangi foydalanuvchi / tahrirlash ---------------- */

/**
 * Yaratish (mode="create") yoki tahrirlash (mode="edit": login faqat o'qish uchun, faqat o'zgarganda saqlanadi).
 * Rol yoki filial o'zgarsa xodim ~1 daqiqada tizimdan chiqariladi va qayta kirib yangi huquqlarni oladi.
 */
export function UserFormDialog({ mode, user, self, users, onClose, onCreated, onSaved }: {
  mode: "create" | "edit";
  /** Tahrirlanayotgan foydalanuvchi (mode="edit") */
  user?: UserRow;
  /** Tizimga kirgan superadmin login'i — o'z rolini o'zgartira olmaydi */
  self: string;
  users: UserRow[];
  onClose: () => void;
  onCreated?: (u: { fullName: string; login: string }, password: string) => void;
  onSaved?: (revoked: boolean) => void;
}) {
  const edit = mode === "edit" && !!user;
  const initial = {
    fullName: user?.fullName ?? "",
    branch: user?.branch ?? "",
    department: user?.department ?? "",
    login: user?.login ?? "",
    role: (user?.role ?? "") as Role | "",
  };
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branches = useMemo(() => [...new Set(users.map((u) => u.branch).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [users]);
  const isSelf = edit && user!.login.toLowerCase() === self.toLowerCase();
  const taken = !edit && f.login !== "" && users.some((u) => u.login.toLowerCase() === f.login.toLowerCase());
  const loginBad = !edit && f.login !== "" && !/^\S{3,64}$/.test(f.login);
  const norm = (v: string) => v.trim().replace(/\s+/g, " ");
  const dirty = (Object.keys(initial) as (keyof typeof initial)[]).some((k) => norm(f[k]) !== norm(initial[k]));
  const accessChanged = edit && (f.role !== initial.role || norm(f.branch) !== norm(initial.branch));
  const ok = norm(f.fullName) && norm(f.branch) && f.role && f.login && !taken && !loginBad && (!edit || dirty);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: k === "login" ? e.target.value.replace(/\s/g, "") : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (edit) {
        const j = await sendJson("/api/admin/users", f, "PATCH");
        onSaved?.(!!j.revoked);
      } else {
        const j = await sendJson("/api/admin/users", f);
        onCreated?.({ fullName: norm(f.fullName), login: f.login }, j.password);
      }
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog title={edit ? "Ma'lumotlarni tahrirlash" : "Yangi foydalanuvchi"} icon={edit ? "fa-solid fa-user-pen" : "fa-solid fa-user-plus"}
      tone="blue" onClose={onClose} busy={busy}>
      <form className="us-form" onSubmit={submit}>
        {error && <p className="us-err"><i className="fa-solid fa-circle-exclamation" /> {error}</p>}
        <label>
          <span>F.I.O. *</span>
          <input value={f.fullName} onChange={set("fullName")} placeholder="Familiya Ism Otasining ismi" maxLength={120} autoFocus required />
        </label>
        <div className="us-form-row">
          <label>
            <span>Filial *</span>
            <input value={f.branch} onChange={set("branch")} list="us-branches" placeholder="Tanlang yoki yozing" maxLength={120} required />
            <datalist id="us-branches">{branches.map((b) => <option key={b} value={b} />)}</datalist>
          </label>
          <label>
            <span>Bo&apos;lim / lavozim</span>
            <input value={f.department} onChange={set("department")} placeholder="Masalan: Bosh mutaxassis" maxLength={120} />
          </label>
        </div>
        <div className="us-form-row">
          <label className={taken || loginBad ? "is-bad" : ""}>
            <span>Login {edit ? "" : "*"}</span>
            <input value={f.login} onChange={set("login")} placeholder="Masalan: PINFL" maxLength={64} autoComplete="off" spellCheck={false}
              readOnly={edit} className={edit ? "is-readonly" : undefined} title={edit ? "Login o'zgarmaydi" : undefined} required />
            {taken && <small>Bu login band</small>}
            {loginBad && <small>Kamida 3 belgi, probelsiz</small>}
          </label>
          <label title={isSelf ? "O'z rolingizni o'zgartira olmaysiz" : undefined}>
            <span>Rol *</span>
            <select value={f.role} onChange={set("role")} disabled={isSelf} required>
              <option value="">Tanlang</option>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            {isSelf && <small className="us-muted-note">O&apos;z rolingizni o&apos;zgartira olmaysiz</small>}
          </label>
        </div>
        {accessChanged ? (
          <p className="us-warn-box">
            <i className="fa-solid fa-triangle-exclamation" />{" "}
            {isSelf
              ? "Filial o'zgarsa, siz ham bir daqiqa ichida tizimdan chiqarilasiz va qayta kirishingiz kerak bo'ladi."
              : "Rol yoki filial o'zgarmoqda: xodim bir daqiqa ichida tizimdan chiqariladi va qayta kirganda yangi huquqlar bilan ishlaydi."}
          </p>
        ) : !edit && (
          <p className="us-note"><i className="fa-solid fa-circle-info" /> Parol avtomatik yaratiladi va bir marta ko&apos;rsatiladi. Xodim birinchi kirishda o&apos;z parolini o&apos;rnatadi.</p>
        )}
        <div className="sb-confirm-actions">
          <button type="button" className="sb-btn-cancel" onClick={onClose} disabled={busy}>Bekor qilish</button>
          <button type="submit" className="us-btn-primary" disabled={!ok || busy}>
            {busy
              ? <><i className="fa-solid fa-spinner fa-spin" /> {edit ? "Saqlanmoqda..." : "Qo'shilmoqda..."}</>
              : edit ? <><i className="fa-solid fa-floppy-disk" /> Saqlash</> : <><i className="fa-solid fa-user-plus" /> Qo&apos;shish</>}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------------- Bloklash ---------------- */

const DURATIONS: { id: string; label: string; ms?: number }[] = [
  { id: "1h", label: "1 soat", ms: 3600_000 },
  { id: "1d", label: "1 kun", ms: 86400_000 },
  { id: "3d", label: "3 kun", ms: 3 * 86400_000 },
  { id: "7d", label: "7 kun", ms: 7 * 86400_000 },
  { id: "30d", label: "30 kun", ms: 30 * 86400_000 },
  { id: "forever", label: "Muddatsiz" },
  { id: "custom", label: "Sana tanlash" },
];

const pad = (n: number) => String(n).padStart(2, "0");
/** datetime-local qiymati (brauzer vaqti) */
const localInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const human = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function BlockDialog({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: () => void }) {
  const [dur, setDur] = useState("1d");
  const [custom, setCustom] = useState(() => localInput(Date.now() + 86400_000));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const preset = DURATIONS.find((d) => d.id === dur);
  const until = dur === "forever" ? "muddatsiz" : dur === "custom" ? new Date(custom).getTime() : now + (preset?.ms || 0);
  const valid = until === "muddatsiz" || (Number.isFinite(until) && (until as number) > Date.now());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Tanlangan muddat tugmani bosgan paytdan hisoblanadi
      const at = dur === "forever" ? "muddatsiz" : dur === "custom" ? until : Date.now() + (preset?.ms || 0);
      await sendJson("/api/admin/users/block", { login: user.login, until: at, reason: reason.trim() });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog title="Foydalanuvchini bloklash" icon="fa-solid fa-ban" tone="red" onClose={onClose} busy={busy}>
      <p><b>{user.fullName || user.login}</b> ({user.login}) tizimga kira olmaydi, ochiq sessiyasi ham bir daqiqa ichida yopiladi.</p>
      {error && <p className="us-err"><i className="fa-solid fa-circle-exclamation" /> {error}</p>}
      <div className="us-form">
        <span className="us-form-label">Muddat</span>
        <div className="us-durations" role="radiogroup" aria-label="Blok muddati">
          {DURATIONS.map((d) => (
            <button key={d.id} type="button" role="radio" aria-checked={dur === d.id} className={dur === d.id ? "active" : ""} onClick={() => setDur(d.id)}>
              {d.label}
            </button>
          ))}
        </div>
        {dur === "custom" && (
          <label>
            <span>Qachongacha</span>
            <input type="datetime-local" value={custom} min={localInput(Date.now() + 60_000)} onChange={(e) => setCustom(e.target.value)} />
          </label>
        )}
        <label>
          <span>Sabab (ixtiyoriy — xodimga ko&apos;rsatiladi)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Masalan: ta'tilda" />
        </label>
        <p className={`us-block-sum${valid ? "" : " is-bad"}`}>
          <i className="fa-solid fa-lock" />{" "}
          {!valid ? "Muddat kelajakda bo'lishi kerak" : until === "muddatsiz" ? "Siz blokdan chiqarmaguningizcha bloklanadi" : <><b>{human(until as number)}</b> gacha bloklanadi, keyin avtomatik ochiladi</>}
        </p>
      </div>
      <div className="sb-confirm-actions">
        <button type="button" className="sb-btn-cancel" onClick={onClose} disabled={busy}>Bekor qilish</button>
        <button type="button" className="sb-btn-danger" onClick={submit} disabled={!valid || busy}>
          {busy ? <><i className="fa-solid fa-spinner fa-spin" /> Bloklanmoqda...</> : <><i className="fa-solid fa-ban" /> Bloklash</>}
        </button>
      </div>
    </Dialog>
  );
}

export function UnblockDialog({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await sendJson("/api/admin/users/unblock", { login: user.login });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <Dialog title="Blokdan chiqarish" icon="fa-solid fa-lock-open" tone="blue" onClose={onClose} busy={busy}>
      <p><b>{user.fullName || user.login}</b> ({user.login}) yana tizimga kira oladi.</p>
      {error && <p className="us-err"><i className="fa-solid fa-circle-exclamation" /> {error}</p>}
      <div className="sb-confirm-actions">
        <button type="button" className="sb-btn-cancel" onClick={onClose} disabled={busy}>Bekor qilish</button>
        <button type="button" className="us-btn-primary" onClick={submit} disabled={busy}>
          {busy ? <><i className="fa-solid fa-spinner fa-spin" /> ...</> : <><i className="fa-solid fa-lock-open" /> Blokdan chiqarish</>}
        </button>
      </div>
    </Dialog>
  );
}
