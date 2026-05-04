import type { AuthServerEnv } from "@gdgjp/auth-lib/server";

declare global {
  interface Env extends AuthServerEnv {}
}
