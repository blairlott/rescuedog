// GTM GCLID Capture Tag deployer for container GTM-5DBQXWP7 (RDW Vinoshipper).
// Uses OAuth refresh-token flow. Self-discovers account/workspace/All-Pages trigger.
// Creates GCLID URL variable + HTML tag, versions, publishes, signals Kennel.
import { createClient } from "npm:@supabase/supabase-js@2";
import { checkSharedSecret } from "../_shared/cronAlert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUBLIC_CONTAINER_ID = "GTM-5DBQXWP7";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TAG_HTML = `<script>
(function() {
  var gclid = '{{URL - GCLID Param}}';
  if (gclid) {
    try { sessionStorage.setItem('gclid', gclid); } catch (e) {}
    var links = document.querySelectorAll('a[href*="vinoshipper.com"]');
    links.forEach(function(link) {
      try {
        var url = new URL(link.href);
        url.searchParams.set('gclid', gclid);
        link.href = url.toString();
      } catch (e) {}
    });
  }
})();
</script>`;

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function log(admin: any, action: string, status: string, opts: { version_id?: string; error?: string; response?: unknown } = {}) {
  try {
    await admin.from("gtm_deploy_log").insert({
      tag_id: PUBLIC_CONTAINER_ID,
      action,
      status,
      version_id: opts.version_id ?? null,
      error: opts.error ?? null,
      response: opts.response ?? null,
    });
  } catch (_e) { /* table may not exist */ }
}

async function getAccessToken(): Promise<string> {
  const client_id = Deno.env.get("GOOGLE_CLIENT_ID");
  const client_secret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refresh_token = Deno.env.get("GTM_REFRESH_TOKEN");
  if (!client_id || !client_secret || !refresh_token) {
    throw new Error("missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GTM_REFRESH_TOKEN");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    throw new Error(`token exchange failed ${res.status}: ${JSON.stringify(j)}`);
  }
  return j.access_token as string;
}

async function gtm(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`https://tagmanager.googleapis.com/tagmanager/v2/${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function signalKennel(versionId: string) {
  const secret = Deno.env.get("KENNEL_EXTERNAL_SIGNAL_SECRET");
  if (!secret) return { ok: false, error: "KENNEL_EXTERNAL_SIGNAL_SECRET missing" };
  const payload = JSON.stringify({
    signal: "gtm_gclid_tag_deployed",
    container: PUBLIC_CONTAINER_ID,
    version_id: versionId,
    deployed_at: new Date().toISOString(),
  });
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/kennel-external-signal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-kennel-signature": `sha256=${hex}`,
    },
    body: payload,
  });
  return { ok: res.ok, status: res.status, body: await res.text().catch(() => "") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Auth: either shared admin secret OR a signed-in owner JWT.
  // Without one of these, anyone could inject JS into the production GTM container.
  let authorized = await checkSharedSecret(req, {
    functionName: "gtm-deploy",
    envVar: "GTM_DEPLOY_ADMIN_SECRET",
    headers: ["x-admin-secret", "x-cron-secret"],
    alertOnFail: false,
  });
  if (!authorized) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Bearer ")) {
      try {
        const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data: claimsData } = await userClient.auth.getClaims(authHeader.slice(7));
        const uid = claimsData?.claims?.sub;
        if (uid) {
          const svc = createClient(SUPABASE_URL, SERVICE_ROLE);
          const { data: isOwner } = await svc.rpc("has_role", { _user_id: uid, _role: "owner" });
          if (isOwner === true) authorized = true;
        }
      } catch (_e) { /* fall through to 401 */ }
    }
  }
  if (!authorized) return json({ ok: false, error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let token: string;
  try {
    token = await getAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log(admin, "oauth", "error", { error: msg });
    return json({ ok: false, step: "oauth", error: msg }, 500);
  }

  // GET = probe scopes only
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("debug") === "creds") {
      const cid = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
      const sec = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
      const rt  = Deno.env.get("GTM_REFRESH_TOKEN") ?? "";
      const tail = (s: string, n = 8) => s ? `…${s.slice(-n)} (len ${s.length})` : "MISSING";
      return json({
        google_client_id: tail(cid, 12),
        google_client_secret: tail(sec, 6),
        gtm_refresh_token: tail(rt, 8),
      });
    }
    const ti = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
    return json({ tokeninfo_status: ti.status, tokeninfo: await ti.json().catch(() => ({})) });
  }

  // Step 1a: find account + container
  const accountsRes = await gtm("accounts", token);
  if (!accountsRes.ok) {
    await log(admin, "list_accounts", "error", { error: `${accountsRes.status}`, response: accountsRes.body });
    return json({ ok: false, step: "list_accounts", ...accountsRes }, 500);
  }
  const accounts: any[] = accountsRes.body.account || [];
  let accountId: string | null = null;
  let containerId: string | null = null;
  for (const acc of accounts) {
    const cRes = await gtm(`accounts/${acc.accountId}/containers`, token);
    if (!cRes.ok) continue;
    const match = (cRes.body.container || []).find((c: any) => c.publicId === PUBLIC_CONTAINER_ID);
    if (match) {
      accountId = acc.accountId;
      containerId = match.containerId;
      break;
    }
  }
  if (!accountId || !containerId) {
    const err = `container ${PUBLIC_CONTAINER_ID} not found in any authorized account`;
    await log(admin, "find_container", "error", { error: err });
    return json({ ok: false, step: "find_container", error: err }, 404);
  }

  // Step 1b: default workspace
  const wsRes = await gtm(`accounts/${accountId}/containers/${containerId}/workspaces`, token);
  if (!wsRes.ok) {
    await log(admin, "list_workspaces", "error", { error: `${wsRes.status}`, response: wsRes.body });
    return json({ ok: false, step: "list_workspaces", ...wsRes }, 500);
  }
  const workspaces: any[] = wsRes.body.workspace || [];
  const workspace = workspaces.find((w) => w.name === "Default Workspace") || workspaces[0];
  if (!workspace) {
    return json({ ok: false, step: "list_workspaces", error: "no workspaces" }, 500);
  }
  const wsPath = `accounts/${accountId}/containers/${containerId}/workspaces/${workspace.workspaceId}`;
  await log(admin, "discovery", "success", { response: { accountId, containerId, workspaceId: workspace.workspaceId, workspaceName: workspace.name } });

  // Step 2: create or reuse GCLID URL variable
  const varsRes = await gtm(`${wsPath}/variables`, token);
  const existingVar = (varsRes.body?.variable || []).find((v: any) => v.name === "URL - GCLID Param");
  if (!existingVar) {
    const varCreate = await gtm(`${wsPath}/variables`, token, {
      method: "POST",
      body: JSON.stringify({
        name: "URL - GCLID Param",
        type: "u",
        parameter: [
          { type: "template", key: "component", value: "QUERY" },
          { type: "template", key: "queryKey", value: "gclid" },
        ],
      }),
    });
    if (!varCreate.ok) {
      await log(admin, "create_variable", "error", { error: `${varCreate.status}`, response: varCreate.body });
      return json({ ok: false, step: "create_variable", ...varCreate }, 500);
    }
    await log(admin, "create_variable", "success", { response: varCreate.body });
  } else {
    await log(admin, "create_variable", "skipped", { response: { reason: "already exists" } });
  }

  // Step 3: All Pages trigger
  const trigRes = await gtm(`${wsPath}/triggers`, token);
  if (!trigRes.ok) {
    await log(admin, "list_triggers", "error", { error: `${trigRes.status}`, response: trigRes.body });
    return json({ ok: false, step: "list_triggers", ...trigRes }, 500);
  }
  const triggers: any[] = trigRes.body.trigger || [];
  // Built-in All Pages trigger has id 2147479553 but may not show in list; fall back if absent.
  let allPages = triggers.find((t) => t.name === "All Pages" || t.type === "pageview");
  const allPagesId = allPages?.triggerId || "2147479553";

  // Step 4: create or update GCLID capture tag
  const tagsRes = await gtm(`${wsPath}/tags`, token);
  const existingTag = (tagsRes.body?.tag || []).find((t: any) => t.name === "RDW - GCLID Capture + Vinoshipper Link Append");
  const tagBody = {
    name: "RDW - GCLID Capture + Vinoshipper Link Append",
    type: "html",
    parameter: [
      { type: "template", key: "html", value: TAG_HTML },
      { type: "boolean", key: "supportDocumentWrite", value: "false" },
    ],
    firingTriggerId: [allPagesId],
  };
  let tagResult;
  if (existingTag) {
    tagResult = await gtm(`${wsPath}/tags/${existingTag.tagId}`, token, {
      method: "PUT",
      body: JSON.stringify(tagBody),
    });
  } else {
    tagResult = await gtm(`${wsPath}/tags`, token, {
      method: "POST",
      body: JSON.stringify(tagBody),
    });
  }
  if (!tagResult.ok) {
    await log(admin, "upsert_tag", "error", { error: `${tagResult.status}`, response: tagResult.body });
    return json({ ok: false, step: "upsert_tag", ...tagResult }, 500);
  }
  await log(admin, "upsert_tag", "success", { response: tagResult.body });

  // Step 5: create version
  const versionRes = await gtm(`${wsPath}:create_version`, token, {
    method: "POST",
    body: JSON.stringify({
      name: "GCLID Capture Tag — Z3 OCI Unblock",
      notes: "Captures gclid URL param and appends to all vinoshipper.com outbound links. Required for Z3 offline conversion uploads.",
    }),
  });
  if (!versionRes.ok) {
    await log(admin, "create_version", "error", { error: `${versionRes.status}`, response: versionRes.body });
    return json({ ok: false, step: "create_version", ...versionRes }, 500);
  }
  const versionId: string | undefined = versionRes.body?.containerVersion?.containerVersionId;
  await log(admin, "create_version", "success", { version_id: versionId, response: versionRes.body });
  if (!versionId) {
    return json({ ok: false, step: "create_version", error: "no versionId returned", response: versionRes.body }, 500);
  }

  // Step 6: publish
  const publishRes = await gtm(`accounts/${accountId}/containers/${containerId}/versions/${versionId}:publish`, token, { method: "POST" });
  if (!publishRes.ok) {
    await log(admin, "publish_version", "error", { version_id: versionId, error: `${publishRes.status}`, response: publishRes.body });
    return json({ ok: false, step: "publish_version", ...publishRes }, 500);
  }
  await log(admin, "publish_version", "success", { version_id: versionId, response: publishRes.body });

  // Step 7: signal Kennel
  const kennel = await signalKennel(versionId);
  await log(admin, "kennel_signal", kennel.ok ? "success" : "error", { version_id: versionId, response: kennel });

  return json({
    ok: true,
    account_id: accountId,
    container_id: containerId,
    workspace_id: workspace.workspaceId,
    all_pages_trigger_id: allPagesId,
    version_id: versionId,
    kennel_signal: kennel,
  });
});