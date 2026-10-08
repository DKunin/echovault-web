import type { Request } from "express";

export interface AuthenticatedIdentity {
  userId: string;
  username: string;
  roles: string[];
}

export interface AuthenticatedRequest extends Request {
  identity: AuthenticatedIdentity;
}

export interface WebDavCredentials {
  endpoint: string;
  username: string;
  password: string;
  allowsInsecureHttp: boolean;
}

export interface WebDavItem {
  name: string;
  path: string;
  isDirectory: boolean;
  contentLength: number | null;
  contentType: string | null;
  lastModified: string | null;
  eTag: string | null;
}
