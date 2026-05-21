// One-shot GTM API deploy: attach All Pages trigger to tag 92 and publish workspace 45.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACCOUNT_ID = "6001966416";
const CONTAINER_ID = "181437300";
const WORKSPACE_ID = "45";
const TAG_ID = "92";
const ALL_PAGES_TRIGGER_ID = "2147479553";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TAG_HTML = `<script>
// GCLID Capture + Vinoshipper Link Append
(function() {
  var urlParams = new URLSearchParams(window.location.search);
  var gclid = urlParams.get('gclid');
  if (gclid) { localStorage.setItem('gclid', gclid); }
  var storedGclid = localStorage.getItem('gclid');
  if (storedGclid) {
    var links = document.querySelectorAll('a[href*="vinoshipper.com"]');
    links.forEach(function(link) {
      var href = link.getAttribute('href');
      if (href.indexOf('gclid=') === -1) {
        href += (href.indexOf('?') === -1 ? '?' : '&') + 'gclid=' + storedGclid;
        link.setAttribute('href', href);
      }
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
  await admin.from("gtm_deploy_log").insert({
    tag_id: TAG_ID,
    action,
    status,
    version_id: opts.version_id ?? null,
    error: opts.error ?? null,
    response: opts.response ?? null,
  });
}

async function notifyLindy(message: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/kennel-alert-dispatch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({
        event_type: "auto_executed",
        channel: "gtm",
        action: "gtm_gclid_tag_deployed",
        message,
        deep_link: "https://tagmanager.google.com/",
      }),
    });
  } catch (_e) { /* swallow */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = Deno.env.get("GTM_ACCESS_TOKEN");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  if (!token) {
    await log(admin, "start", "error", { error: "GTM_ACCESS_TOKEN missing" });
    return json({ ok: false, error: "GTM_ACCESS_TOKEN missing" }, 500);
  }

  const authHeaders = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // Step 1: PATCH the tag with firing trigger + html parameter
  const tagUrl = `https://tagmanager.googleapis.com/tagmanager/v2/accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}/workspaces/${WORKSPACE_ID}/tags/${TAG_ID}`;
  const patchBody = {
    name: "RDW - GCLID Capture + Vinoshipper Link Append",
    type: "html",
    firingTriggerId: [ALL_PAGES_TRIGGER_ID],
    parameter: [
      { type: "template", key: "html", value: TAG_HTML },
      { type: "boolean", key: "supportDocumentWrite", value: "false" },
    ],
  };

  const patchRes = await fetch(tagUrl, {
    method: "PUT", // GTM API uses PUT to replace; PATCH is also accepted but PUT is canonical
    headers: authHeaders,
    body: JSON.stringify(patchBody),
  });
  const patchJson = await patchRes.json().catch(() => ({}));
  if (!patchRes.ok) {
    await log(admin, "patch_tag", "error", { error: `${patchRes.status}: ${JSON.stringify(patchJson)}`, response: patchJson });
    return json({ ok: false, step: "patch_tag", status: patchRes.status, response: patchJson }, 500);
  }
  await log(admin, "patch_tag", "success", { response: patchJson });

  // Step 2: Create workspace version
  const versionUrl = `https://tagmanager.googleapis.com/tagmanager/v2/accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}/workspaces/${WORKSPACE_ID}:create_version`;
  const versionRes = await fetch(versionUrl, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      name: "GCLID Capture Tag - Trigger Fix",
      notes: "Assigned All Pages trigger to tag 92 (RDW GCLID Capture). Deployed by Kennel gtm-deploy edge function.",
    }),
  });
  const versionJson = await versionRes.json().catch(() => ({}));
  if (!versionRes.ok) {
    await log(admin, "create_version", "error", { error: `${versionRes.status}: ${JSON.stringify(versionJson)}`, response: versionJson });
    return json({ ok: false, step: "create_version", status: versionRes.status, response: versionJson }, 500);
  }
  const versionId: string | undefined = versionJson?.containerVersion?.containerVersionId;
  await log(admin, "create_version", "success", { version_id: versionId, response: versionJson });

  if (!versionId) {
    await log(admin, "publish_version", "error", { error: "no versionId returned" });
    return json({ ok: false, step: "publish_version", error: "no versionId", response: versionJson }, 500);
  }

  // Step 3: Publish version
  const publishUrl = `https://tagmanager.googleapis.com/tagmanager/v2/accounts/${ACCOUNT_ID}/containers/${CONTAINER_ID}/versions/${versionId}:publish`;
  const publishRes = await fetch(publishUrl, { method: "POST", headers: authHeaders });
  const publishJson = await publishRes.json().catch(() => ({}));
  if (!publishRes.ok) {
    await log(admin, "publish_version", "error", { version_id: versionId, error: `${publishRes.status}: ${JSON.stringify(publishJson)}`, response: publishJson });
    return json({ ok: false, step: "publish_version", status: publishRes.status, response: publishJson }, 500);
  }
  await log(admin, "publish_version", "success", { version_id: versionId, response: publishJson });

  // Step 4: Notify Lindy
  await notifyLindy(
    "GTM GCLID tag deployed ✅ — tag 92 now fires on All Pages, workspace published. Z3 OCI upload will activate on next 2am run.",
  );

  return json({ ok: true, version_id: versionId, patch: patchJson, version: versionJson, publish: publishJson });
});