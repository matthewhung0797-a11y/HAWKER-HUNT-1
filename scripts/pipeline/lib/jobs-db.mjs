// GHA / node 用嘅 pet_jobs 存取層。未配置 Supabase 時所有操作 graceful skip。

import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { getEnv } from "./env.mjs";

const TABLE = "pet_jobs";
const BUCKET = "pet-job-refs";
const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

export const jobsDbConfigured = Boolean(url && serviceKey);

let clientPromise;

async function getClient() {
  if (!jobsDbConfigured) return null;
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) =>
        createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      )
      .catch((error) => {
        warn("初始化", error);
        return null;
      });
  }
  return clientPromise;
}

function warn(action, error) {
  console.warn(`  [jobs-db] ${action} 失敗：${error?.message ?? error}`);
}

export async function claimNextJob(kind) {
  const sb = await getClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc("claim_pet_job", { p_kind: kind });
    if (error) {
      warn("claim", error);
      return null;
    }
    return (Array.isArray(data) ? data[0] : data) ?? null;
  } catch (error) {
    warn("claim", error);
    return null;
  }
}

export async function getJob(id) {
  const sb = await getClient();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error) {
      warn("get", error);
      return null;
    }
    return data ?? null;
  } catch (error) {
    warn("get", error);
    return null;
  }
}

/** 指定 job 由 queued／failed 原子轉 running；已被其他 runner claim 就唔會誤搶。 */
export async function startJobById(id) {
  const sb = await getClient();
  if (!sb) return null;
  const now = new Date().toISOString();
  try {
    const { data, error } = await sb
      .from(TABLE)
      .update({ status: "running", started_at: now, updated_at: now, error_message: null })
      .eq("id", id)
      .in("status", ["queued", "failed"])
      .select("*")
      .maybeSingle();
    if (error) {
      warn("startJobById", error);
      return null;
    }
    return data ?? null;
  } catch (error) {
    warn("startJobById", error);
    return null;
  }
}

/** 明確 job id 優先；冇 id 先按 kind claim 下一張單。 */
export async function claimOrGetJob({ jobId, kind }) {
  if (!jobId) return claimNextJob(kind);
  const job = await getJob(jobId);
  if (!job || (kind && job.kind !== kind)) return null;
  if (job.status === "queued" || job.status === "failed") return startJobById(jobId);
  return job.status === "running" ? job : null;
}

export async function markConsumed(id, petDraftId) {
  const sb = await getClient();
  if (!sb) return false;
  const now = new Date().toISOString();
  try {
    const { error } = await sb
      .from(TABLE)
      .update({
        status: "consumed",
        pet_draft_id: petDraftId,
        consumed_at: now,
        updated_at: now,
        error_message: null,
      })
      .eq("id", id);
    if (error) warn("markConsumed", error);
    return !error;
  } catch (error) {
    warn("markConsumed", error);
    return false;
  }
}

export async function markFailed(id, errorMessage) {
  const sb = await getClient();
  if (!sb) return false;
  try {
    const { error } = await sb
      .from(TABLE)
      .update({
        status: "failed",
        error_message: String(errorMessage ?? "Unknown pipeline error"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) warn("markFailed", error);
    return !error;
  } catch (error) {
    warn("markFailed", error);
    return false;
  }
}

export async function requeueStale(hours = 6) {
  const sb = await getClient();
  if (!sb) return 0;
  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 6;
  const cutoff = new Date(Date.now() - safeHours * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await sb
      .from(TABLE)
      .update({
        status: "queued",
        started_at: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("status", "running")
      .lt("started_at", cutoff)
      .select("id");
    if (error) {
      warn("requeueStale", error);
      return 0;
    }
    return data?.length ?? 0;
  } catch (error) {
    warn("requeueStale", error);
    return 0;
  }
}

/**
 * 將 job 參考圖落到 runner。ref.url 可係現成 signed/public URL；冇 URL 就即場簽 storage path。
 * 回傳相對 process.cwd() 嘅路徑，方便直接寫入 draft.refImages。
 */
/** 待審縮圖：將 stage1 webp 上 Storage，回 signed URL 畀後台看板（唔靠 main 先有 public/）。 */
export async function uploadApprovalPreview(draftId, localWebpPath) {
  const sb = await getClient();
  if (!sb || !localWebpPath || !existsSync(localWebpPath)) return null;
  try {
    const buf = await readFile(localWebpPath);
    const storagePath = `previews/${draftId}.webp`;
    const { error } = await sb.storage.from(BUCKET).upload(storagePath, buf, {
      contentType: "image/webp",
      upsert: true,
    });
    if (error) {
      warn("uploadApprovalPreview", error);
      return null;
    }
    const { data, error: signErr } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
    if (signErr || !data?.signedUrl) {
      warn("sign preview", signErr ?? new Error("missing url"));
      return null;
    }
    return data.signedUrl;
  } catch (error) {
    warn("uploadApprovalPreview", error);
    return null;
  }
}

/**
 * 上傳面向校準截圖（png）。回 storage path（唔回 signed URL——後台 GET 時再簽）。
 * storage: facing-cal/<draftId>/<filename>
 */
export async function uploadFacingCalPng(draftId, localPngPath, filename) {
  const sb = await getClient();
  if (!sb || !localPngPath || !existsSync(localPngPath)) return null;
  const safeName = String(filename || path.basename(localPngPath)).replace(
    /[^a-zA-Z0-9._-]/g,
    "_"
  );
  try {
    const buf = await readFile(localPngPath);
    const storagePath = `facing-cal/${draftId}/${safeName}`;
    const { error } = await sb.storage.from(BUCKET).upload(storagePath, buf, {
      contentType: "image/png",
      upsert: true,
    });
    if (error) {
      warn("uploadFacingCalPng", error);
      return null;
    }
    return storagePath;
  } catch (error) {
    warn("uploadFacingCalPng", error);
    return null;
  }
}

/** 簽讀任意 bucket path（facing-cal／previews） */
export async function signStoragePath(storagePath, expiresSec = 60 * 60 * 24 * 7) {
  const sb = await getClient();
  if (!sb || !storagePath) return null;
  try {
    const { data, error } = await sb.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresSec);
    if (error || !data?.signedUrl) {
      warn("signStoragePath", error ?? new Error("missing url"));
      return null;
    }
    return data.signedUrl;
  } catch (error) {
    warn("signStoragePath", error);
    return null;
  }
}

export async function downloadJobRefs(job, destDir) {
  const refs = Array.isArray(job?.ref_images) ? job.ref_images.slice(0, 5) : [];
  if (!refs.length) return [];
  const sb = await getClient();
  if (!sb) return [];

  try {
    await mkdir(destDir, { recursive: true });
    const localPaths = [];
    for (const [index, ref] of refs.entries()) {
      const storagePath = typeof ref === "string" ? ref : ref?.path;
      if (!storagePath) continue;

      let downloadUrl = typeof ref === "object" ? ref.url : undefined;
      if (!downloadUrl) {
        const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, 900);
        if (error || !data?.signedUrl) {
          warn(`簽署參考圖 ${storagePath}`, error ?? new Error("missing signed URL"));
          continue;
        }
        downloadUrl = data.signedUrl;
      }

      const response = await fetch(downloadUrl);
      if (!response.ok) {
        warn(`下載參考圖 ${storagePath}`, new Error(`HTTP ${response.status}`));
        continue;
      }

      const originalName = path.basename(storagePath).replace(/[^a-zA-Z0-9._-]/g, "_");
      const filename = `${String(index + 1).padStart(2, "0")}-${originalName || "reference"}`;
      const destination = path.resolve(destDir, filename);
      await writeFile(destination, Buffer.from(await response.arrayBuffer()));
      localPaths.push(path.relative(process.cwd(), destination).replaceAll("\\", "/"));
    }
    return localPaths;
  } catch (error) {
    warn("downloadJobRefs", error);
    return [];
  }
}
