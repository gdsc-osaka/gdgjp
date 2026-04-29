import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("links/new", "routes/links.new.tsx"),
  route("links/:id", "routes/links.$id.tsx"),
  route("notfound", "routes/notfound.tsx"),
] satisfies RouteConfig;
