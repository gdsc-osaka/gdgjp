import type { AuthServerEnv } from "@gdgjp/auth-lib/server";

declare global {
  interface Env extends AuthServerEnv {
    INTERNAL_API_SECRET: string;
  }
}
