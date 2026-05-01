const CLERK_FAPI_HOST = "easy-grackle-92.clerk.accounts.dev";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    url.hostname = CLERK_FAPI_HOST;
    return fetch(new Request(url.toString(), request));
  },
} satisfies ExportedHandler;
