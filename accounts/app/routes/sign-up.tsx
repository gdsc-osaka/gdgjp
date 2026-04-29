import { SignUp } from "@clerk/react-router";

export function meta() {
  return [{ title: "Sign up — GDG Japan Accounts" }];
}

export default function SignUpPage() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </main>
  );
}
