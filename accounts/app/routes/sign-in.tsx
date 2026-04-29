import { SignIn } from "@clerk/react-router";

export function meta() {
  return [{ title: "Sign in — GDG Japan Accounts" }];
}

export default function SignInPage() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100dvh" }}>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </main>
  );
}
