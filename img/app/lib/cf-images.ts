export type CfUploadResult = {
  cfImageId: string;
  width: number | null;
  height: number | null;
};

type CfApiResponse<T> = {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
};

type CfImageResult = {
  id: string;
  meta?: Record<string, string>;
  variants?: string[];
};

export async function uploadToCfImages(
  env: Env,
  bytes: Blob,
  meta: Record<string, string>,
): Promise<CfUploadResult> {
  if (!env.CF_IMAGES_API_TOKEN) throw new Error("missing CF_IMAGES_API_TOKEN");
  if (!env.CF_ACCOUNT_ID) throw new Error("missing CF_ACCOUNT_ID");

  const form = new FormData();
  form.append("file", bytes);
  form.append("metadata", JSON.stringify(meta));
  form.append("requireSignedURLs", "false");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_IMAGES_API_TOKEN}` },
      body: form,
    },
  );
  if (!res.ok) {
    throw new Error(`cf images upload failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as CfApiResponse<CfImageResult>;
  if (!json.success) {
    throw new Error(`cf images upload error: ${JSON.stringify(json.errors)}`);
  }
  return { cfImageId: json.result.id, width: null, height: null };
}

export async function deleteFromCfImages(env: Env, cfImageId: string): Promise<void> {
  if (!env.CF_IMAGES_API_TOKEN) throw new Error("missing CF_IMAGES_API_TOKEN");
  if (!env.CF_ACCOUNT_ID) throw new Error("missing CF_ACCOUNT_ID");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/images/v1/${encodeURIComponent(cfImageId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.CF_IMAGES_API_TOKEN}` },
    },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`cf images delete failed: ${res.status} ${await res.text()}`);
  }
}

export function deliveryUrl(env: Env, cfImageId: string): string {
  return `https://imagedelivery.net/${env.CF_IMAGES_ACCOUNT_HASH}/${cfImageId}/${env.CF_IMAGES_VARIANT}`;
}
