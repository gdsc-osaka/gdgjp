import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("sign-in/*", "routes/sign-in.tsx"),
  route("sign-up/*", "routes/sign-up.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("onboarding", "routes/onboarding.tsx"),
  route("admin/chapters", "routes/admin.chapters.tsx"),
  route("chapters/:slug/organize", "routes/chapters.$slug.organize.tsx"),
] satisfies RouteConfig;
