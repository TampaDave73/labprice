import type { Role } from '@labprice/database';
import { ROLE_HIERARCHY } from '../constants';
import { ForbiddenError, UnauthorizedError } from '../errors';
import type { SessionUser } from '../types';

export function hasRole(user: SessionUser | null | undefined, minRole: Role): boolean {
  if (!user) return false;
  return (ROLE_HIERARCHY[user.role] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? Infinity);
}

export function requireAuth(user: SessionUser | null | undefined): asserts user is SessionUser {
  if (!user) throw new UnauthorizedError();
}

export function requireRole(user: SessionUser | null | undefined, minRole: Role): asserts user is SessionUser {
  requireAuth(user);
  if (!hasRole(user, minRole)) {
    throw new ForbiddenError(`Requires ${minRole} role or higher`);
  }
}
