export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export type VerifyOptions = {
  jwksUrl: string;
  issuer?: string;
  audience?: string;
};

export async function verifyAccessToken(
  _token: string,
  _options: VerifyOptions,
): Promise<AuthUser> {
  throw new Error("verifyAccessToken: not implemented");
}
