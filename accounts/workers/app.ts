import { RouterContextProvider, createRequestHandler } from "react-router";

declare global {
  interface Env {
    CLERK_SECRET_KEY: string;
  }
}

declare module "react-router" {
  interface RouterContextProvider {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

class CloudflareContext extends RouterContextProvider {
  readonly cloudflare: { env: Env; ctx: ExecutionContext };
  constructor(env: Env, ctx: ExecutionContext) {
    super();
    this.cloudflare = { env, ctx };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  fetch(request, env, ctx) {
    return requestHandler(request, new CloudflareContext(env, ctx));
  },
} satisfies ExportedHandler<Env>;
