import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("api/links", "routes/api.links.tsx"),
  route("links/:id", "routes/links.$id.tsx"),
  route("links/:id/analytics", "routes/links.$id.analytics.tsx"),
  route("analytics", "routes/analytics.tsx"),
  route("tags", "routes/tags.tsx"),
  route("notfound", "routes/notfound.tsx"),
  route(":slug", "routes/$slug.tsx"),
] satisfies RouteConfig;
