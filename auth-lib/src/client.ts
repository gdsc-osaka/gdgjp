import { createAuthClient } from "better-auth/client";
import { genericOAuthClient } from "better-auth/client/plugins";

export { SSO_PROVIDER_ID } from "./index";

export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
});
