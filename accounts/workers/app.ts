import { createRequestHandler } from "react-router";
import { CloudflareContext } from "./context";

declare global {
  interface Env {
    CLERK_SECRET_KEY: string;
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env?.MODE ?? "production",
);

export default {
  fetch(request, env, ctx) {
    return requestHandler(request, new CloudflareContext({ env, ctx }));
  },
} satisfies ExportedHandler<Env>;
