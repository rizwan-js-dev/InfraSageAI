import type { Role } from '@infrasage/shared';

export interface Identity {
  id: string;
  role: Role;
}

declare global {
  // Declaration merging is the documented way to extend Express's Request type.
  namespace Express {
    interface Request {
      correlationId: string;
      identity?: Identity;
    }
  }
}
