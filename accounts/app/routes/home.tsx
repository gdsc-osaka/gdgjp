import { redirect } from "react-router";

export function loader() {
  throw redirect("/dashboard");
}

export default function Home() {
  return null;
}
