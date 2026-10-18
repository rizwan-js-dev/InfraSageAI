import type { RequestHandler } from 'express';
import type { Role } from '@infrasage/shared';
import { AppError } from '../../lib/app-error.js';

/**
 * ADR-0003: MVP identity. Every request is the configured local developer with role `operator`.
 * This is NOT production authentication; replace this function to plug in a real authenticator.
 */
export function localIdentity(userId: string): RequestHandler {
  return (req, _res, next) => {
    req.identity = { id: userId, role: 'operator' };
    next();
  };
}

const RANK: Record<Role, number> = { viewer: 0, operator: 1 };

/** Guards mutating routes. Role comes only from middleware, never from request bodies or the LLM. */
export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    const identity = req.identity;
    if (!identity || RANK[identity.role] < RANK[role]) {
      next(new AppError('FORBIDDEN', 403, `This action requires the '${role}' role.`));
      return;
    }
    next();
  };
}
