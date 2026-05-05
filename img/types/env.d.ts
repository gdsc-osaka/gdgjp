declare global {
  interface Env {
    BETTER_AUTH_SECRET: string;
    IDP_CLIENT_SECRET: string;
    INTERNAL_API_SECRET: string;
    CF_IMAGES_API_TOKEN: string;
  }
}

export {};
