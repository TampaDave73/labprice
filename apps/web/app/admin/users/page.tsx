'use client';

import { useEffect, useState } from 'react';

type User = { id: string; email: string; name: string | null; role: string; createdAt: string };
const ROLES = ['USER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN'];

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    setLoading(true);
    const res = await fetch('/api/v1/admin/users');
    const json = await res.json();
    setUsers(json.data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const changeRole = async (userId: string, role: string) => {
    await fetch(`/api/v1/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    fetchUsers();
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-900">Users</h1>
      <div className="overflow-x-auto rounded-xl border border-brand-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-100 bg-brand-50 text-left text-brand-600">
              <th className="p-3">Email</th>
              <th className="p-3">Name</th>
              <th className="p-3">Role</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-6 text-center text-brand-400">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={4} className="p-6 text-center text-brand-400">No users found.</td></tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-brand-100 hover:bg-brand-50/50">
                  <td className="p-3 font-medium text-brand-900">{u.email}</td>
                  <td className="p-3 text-brand-600">{u.name ?? '—'}</td>
                  <td className="p-3">
                    <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                      className="rounded-lg border border-brand-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="p-3 text-brand-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
