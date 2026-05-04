export * from "./core";
export {
  initializeAuth,
  initializeIdpAuth,
} from "./server";
export type {
  AuthConfig,
  AuthInstance,
  IdpAuthConfig,
  IdpAuthInstance,
  IdpClient,
} from "./server";
export { authClient } from "./client";
