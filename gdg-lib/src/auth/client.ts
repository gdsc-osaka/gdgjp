import { createAuthClient } from "better-auth/client";
import { genericOAuthClient } from "better-auth/client/plugins";

export { SSO_PROVIDER_ID } from "./core";

export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});
