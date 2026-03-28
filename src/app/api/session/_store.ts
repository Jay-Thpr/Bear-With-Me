// Shared in-memory store for the session — imported by log, status, and summary routes.
export const sessionLog: Array<{
  tier: number;
  description: string;
  timestamp: string;
  createdAt: string;
}> = [];

export const skillStatuses = new Map<string, string>();
