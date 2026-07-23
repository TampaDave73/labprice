'use client';

import { useEffect, useState } from 'react';

type User = { id: string; email: string; name: string | null; role: string; createdAt: string };
const ROLES = ['USER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN'];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Invite form
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('USER');
  const [inviting, setInviting] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/users');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error?.message ?? 'Could not load users.');
      setUsers(json.data ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not load users — try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const changeRole = async (userId: string, newRole: string) => {
    const res = await fetch(`/api/v1/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error?.message ?? 'Could not change role.');
      return;
    }
    fetchUsers();
  };

  const inviteUser = async () => {
    if (!email.trim()) return;
    setInviting(true); setMsg(null);
    const res = await fetch('/api/v1/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: name || undefined, role }),
    });
    const j = await res.json().catch(() => ({}));
    setInviting(false);
    if (!res.ok) {
      setMsg(j.error?.message ?? 'Could not add user.');
      return;
    }
    setEmail(''); setName(''); setRole('USER');
    setMsg(`${email} added — they'll get admin access as soon as they sign in with this email (magic link or Google).`);
    fetchUsers();
  };

  const removeUser = async (u: User) => {
    if (!confirm(`Remove ${u.email}? They'll lose access immediately and can be re-invited later.`)) return;
    const res = await fetch(`/api/v1/admin/users/${u.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setMsg(j.error?.message ?? 'Could not remove user.');
      return;
    }
    fetchUsers();
  };

  return (
    <div>
      <h1 className="admin-h1 mb-6">Users</h1>

      <div className="admin-card mb-6 p-4">
        <h2 className="mb-3 text-sm font-semibold text-brand-700">Add a user</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-xs font-medium text-brand-600">Email</label>
            <input type="email" className="admin-input" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="min-w-40 flex-1">
            <label className="mb-1 block text-xs font-medium text-brand-600">Name (optional)</label>
            <input className="admin-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-brand-600">Role</label>
            <select className="admin-input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button onClick={inviteUser} disabled={inviting || !email.trim()} className="admin-btn">
            {inviting ? 'Adding…' : 'Add'}
          </button>
        </div>
        <p className="mt-2 text-xs text-brand-400">
          No password needed — they sign in with this exact email via magic link or Google, and land
          with the role you set here.
        </p>
        {msg && <p className="mt-2 text-xs text-brand-600">{msg}</p>}
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className="p-3">Email</th>
              <th className="p-3">Name</th>
              <th className="p-3">Role</th>
              <th className="p-3">Created</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-6 text-center text-brand-400">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="p-6 text-center text-brand-400">No users found.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-brand-100 hover:bg-brand-50/50">
                  <td className="p-3 font-medium text-brand-900">{u.email}</td>
                  <td className="p-3 text-brand-600">{u.name ?? '—'}</td>
                  <td className="p-3">
                    <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                      className="admin-input admin-input-inline">
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-brand-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => removeUser(u)} className="admin-btn admin-btn-ghost text-xs text-red-600">
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
