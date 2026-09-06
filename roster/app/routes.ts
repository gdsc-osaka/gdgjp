import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"), // "/" — event list (auth + chapter).

  route("events/new", "routes/events.new.tsx"),
  route("e/:id/design", "routes/e.$id.design.tsx"),

  route("apply/:token", "routes/apply.$token.tsx"), // public — sign-in only, no Chapter required

  route("signin", "routes/signin.tsx"),
  route("no-chapter", "routes/no-chapter.tsx"),
  route("api/auth/*", "routes/api.auth.$.ts"),
  route("auth/signout", "routes/auth.signout.ts"),
  route("dev/login", "routes/dev.login.tsx"), // 404 when ENVIRONMENT === "production"
  route("dev/seed", "routes/dev.seed.tsx"), // 404 when ENVIRONMENT === "production"
] satisfies RouteConfig;
