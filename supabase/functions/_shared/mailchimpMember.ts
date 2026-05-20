// Mailchimp member upsert + tag sync helper.
// All ops are best-effort: returns { ok, skipped?, error? } and never throws.
// Logs every call to `mailchimp_lifecycle_events` for auditing.

import { createClient } from "npm:@supabase/supabase-js@2";

const API = Deno.env.get("MAILCHIMP_API_KEY") ?? "";
const SERVER = Deno.env.get("MAILCHIMP_SERVER_PREFIX") ?? "";
const LIST = Deno.env.get("MAILCHIMP_AUDIENCE_ID") ?? "";

async function md5Lower(email: string): Promise<string> {
  // Mailchimp identifies subscribers by md5(lowercase(email)).
  // Browser/Deno crypto has no md5; use a tiny pure-JS implementation.
  const txt = email.trim().toLowerCase();
  return md5(txt);
}

// Minimal MD5 (RFC 1321) — public domain. ~1.5KB. Sufficient for hashing emails.
function md5(str: string): string {
  function L(k: number, d: number) { return (k << d) | (k >>> (32 - d)); }
  function K(G: number, k: number) { let I, d, F, H, x;
    F = (G & 2147483648); H = (k & 2147483648);
    I = (G & 1073741824); d = (k & 1073741824);
    x = (G & 1073741823) + (k & 1073741823);
    if (I & d) return (x ^ 2147483648 ^ F ^ H);
    if (I | d) {
      if (x & 1073741824) return (x ^ 3221225472 ^ F ^ H);
      return (x ^ 1073741824 ^ F ^ H);
    }
    return (x ^ F ^ H);
  }
  function r(d:number,F:number,k:number){return (d & F) | ((~d) & k);}
  function q(d:number,F:number,k:number){return (d & k) | (F & (~k));}
  function p(d:number,F:number,k:number){return d ^ F ^ k;}
  function n(d:number,F:number,k:number){return F ^ (d | (~k));}
  function u(G:number,F:number,aa:number,Z:number,k:number,H:number,I:number){G=K(G,K(K(r(F,aa,Z),k),I));return K(L(G,H),F);}
  function f(G:number,F:number,aa:number,Z:number,k:number,H:number,I:number){G=K(G,K(K(q(F,aa,Z),k),I));return K(L(G,H),F);}
  function D(G:number,F:number,aa:number,Z:number,k:number,H:number,I:number){G=K(G,K(K(p(F,aa,Z),k),I));return K(L(G,H),F);}
  function t(G:number,F:number,aa:number,Z:number,k:number,H:number,I:number){G=K(G,K(K(n(F,aa,Z),k),I));return K(L(G,H),F);}
  function e(G:string){let Z; const F=G.length; const x=F+8; const k=(x-(x%64))/64; const I=(k+1)*16;
    const aa=Array(I-1); let d=0,H=0;
    while(H<F){Z=(H-(H%4))/4; d=(H%4)*8; aa[Z]=(aa[Z]|(G.charCodeAt(H)<<d)); H++;}
    Z=(H-(H%4))/4; d=(H%4)*8; aa[Z]=aa[Z]|(128<<d); aa[I-2]=F<<3; aa[I-1]=F>>>29; return aa;
  }
  function B(G:number){let k="",F="",d,H; for(H=0;H<=3;H++){d=(G>>>(H*8))&255; F="0"+d.toString(16); k=k+F.substr(F.length-2,2);} return k;}
  function J(k:string){k=k.replace(/\r\n/g,"\n"); let d=""; for(let F=0;F<k.length;F++){const G=k.charCodeAt(F); if(G<128){d+=String.fromCharCode(G);} else if(G>127&&G<2048){d+=String.fromCharCode((G>>6)|192); d+=String.fromCharCode((G&63)|128);} else {d+=String.fromCharCode((G>>12)|224); d+=String.fromCharCode(((G>>6)&63)|128); d+=String.fromCharCode((G&63)|128);}} return d;}
  const S=7,T=12,U=17,V=22,W=5,X=9,Y=14,Z=20,a=4,b=11,c=16,d2=23,e2=6,f2=10,g=15,h=21;
  str=J(str); const x=e(str);
  let a1=1732584193,b1=4023233417,c1=2562383102,d1=271733878;
  for(let i=0;i<x.length;i+=16){
    const o=a1,P=b1,Q=c1,R=d1;
    a1=u(a1,b1,c1,d1,x[i+0],S,3614090360);d1=u(d1,a1,b1,c1,x[i+1],T,3905402710);
    c1=u(c1,d1,a1,b1,x[i+2],U,606105819);b1=u(b1,c1,d1,a1,x[i+3],V,3250441966);
    a1=u(a1,b1,c1,d1,x[i+4],S,4118548399);d1=u(d1,a1,b1,c1,x[i+5],T,1200080426);
    c1=u(c1,d1,a1,b1,x[i+6],U,2821735955);b1=u(b1,c1,d1,a1,x[i+7],V,4249261313);
    a1=u(a1,b1,c1,d1,x[i+8],S,1770035416);d1=u(d1,a1,b1,c1,x[i+9],T,2336552879);
    c1=u(c1,d1,a1,b1,x[i+10],U,4294925233);b1=u(b1,c1,d1,a1,x[i+11],V,2304563134);
    a1=u(a1,b1,c1,d1,x[i+12],S,1804603682);d1=u(d1,a1,b1,c1,x[i+13],T,4254626195);
    c1=u(c1,d1,a1,b1,x[i+14],U,2792965006);b1=u(b1,c1,d1,a1,x[i+15],V,1236535329);
    a1=f(a1,b1,c1,d1,x[i+1],W,4129170786);d1=f(d1,a1,b1,c1,x[i+6],X,3225465664);
    c1=f(c1,d1,a1,b1,x[i+11],Y,643717713);b1=f(b1,c1,d1,a1,x[i+0],Z,3921069994);
    a1=f(a1,b1,c1,d1,x[i+5],W,3593408605);d1=f(d1,a1,b1,c1,x[i+10],X,38016083);
    c1=f(c1,d1,a1,b1,x[i+15],Y,3634488961);b1=f(b1,c1,d1,a1,x[i+4],Z,3889429448);
    a1=f(a1,b1,c1,d1,x[i+9],W,568446438);d1=f(d1,a1,b1,c1,x[i+14],X,3275163606);
    c1=f(c1,d1,a1,b1,x[i+3],Y,4107603335);b1=f(b1,c1,d1,a1,x[i+8],Z,1163531501);
    a1=f(a1,b1,c1,d1,x[i+13],W,2850285829);d1=f(d1,a1,b1,c1,x[i+2],X,4243563512);
    c1=f(c1,d1,a1,b1,x[i+7],Y,1735328473);b1=f(b1,c1,d1,a1,x[i+12],Z,2368359562);
    a1=D(a1,b1,c1,d1,x[i+5],a,4294588738);d1=D(d1,a1,b1,c1,x[i+8],b,2272392833);
    c1=D(c1,d1,a1,b1,x[i+11],c,1839030562);b1=D(b1,c1,d1,a1,x[i+14],d2,4259657740);
    a1=D(a1,b1,c1,d1,x[i+1],a,2763975236);d1=D(d1,a1,b1,c1,x[i+4],b,1272893353);
    c1=D(c1,d1,a1,b1,x[i+7],c,4139469664);b1=D(b1,c1,d1,a1,x[i+10],d2,3200236656);
    a1=D(a1,b1,c1,d1,x[i+13],a,681279174);d1=D(d1,a1,b1,c1,x[i+0],b,3936430074);
    c1=D(c1,d1,a1,b1,x[i+3],c,3572445317);b1=D(b1,c1,d1,a1,x[i+6],d2,76029189);
    a1=D(a1,b1,c1,d1,x[i+9],a,3654602809);d1=D(d1,a1,b1,c1,x[i+12],b,3873151461);
    c1=D(c1,d1,a1,b1,x[i+15],c,530742520);b1=D(b1,c1,d1,a1,x[i+2],d2,3299628645);
    a1=t(a1,b1,c1,d1,x[i+0],e2,4096336452);d1=t(d1,a1,b1,c1,x[i+7],f2,1126891415);
    c1=t(c1,d1,a1,b1,x[i+14],g,2878612391);b1=t(b1,c1,d1,a1,x[i+5],h,4237533241);
    a1=t(a1,b1,c1,d1,x[i+12],e2,1700485571);d1=t(d1,a1,b1,c1,x[i+3],f2,2399980690);
    c1=t(c1,d1,a1,b1,x[i+10],g,4293915773);b1=t(b1,c1,d1,a1,x[i+1],h,2240044497);
    a1=t(a1,b1,c1,d1,x[i+8],e2,1873313359);d1=t(d1,a1,b1,c1,x[i+15],f2,4264355552);
    c1=t(c1,d1,a1,b1,x[i+6],g,2734768916);b1=t(b1,c1,d1,a1,x[i+13],h,1309151649);
    a1=t(a1,b1,c1,d1,x[i+4],e2,4149444226);d1=t(d1,a1,b1,c1,x[i+11],f2,3174756917);
    c1=t(c1,d1,a1,b1,x[i+2],g,718787259);b1=t(b1,c1,d1,a1,x[i+9],h,3951481745);
    a1=K(a1,o);b1=K(b1,P);c1=K(c1,Q);d1=K(d1,R);
  }
  return (B(a1)+B(b1)+B(c1)+B(d1)).toLowerCase();
}

async function mc(path: string, method: string, body?: unknown) {
  const r = await fetch(`https://${SERVER}.api.mailchimp.com/3.0${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`anystring:${API}`)}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data };
}

export interface MailchimpSyncInput {
  email: string;
  userId?: string | null;
  eventType: string;            // e.g. 'wine_club_joined', 'wine_club_cancelled'
  tagsAdded?: string[];
  tagsRemoved?: string[];
  mergeFields?: Record<string, unknown>;
  firstName?: string | null;
  lastName?: string | null;
}

export async function syncMailchimpMember(input: MailchimpSyncInput): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!API || !SERVER || !LIST) return { ok: true, skipped: true };
  if (!input.email) return { ok: false, error: 'email required' };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  // Kill switch
  try {
    const { data: setting } = await supabase
      .from("app_settings").select("value").eq("key", "mailchimp_wine_club_sync_enabled").maybeSingle();
    if (setting && (setting.value as any) === false) {
      return { ok: true, skipped: true };
    }
  } catch { /* fall through */ }

  const hash = await md5Lower(input.email);
  let error: string | null = null;
  let response: unknown = null;

  try {
    // 1. Upsert subscriber (PUT members) — keeps existing status if already there.
    const merge: Record<string, unknown> = { ...(input.mergeFields ?? {}) };
    if (input.firstName) merge.FNAME = input.firstName;
    if (input.lastName) merge.LNAME = input.lastName;
    const upsert = await mc(`/lists/${LIST}/members/${hash}`, "PUT", {
      email_address: input.email,
      status_if_new: "subscribed",
      merge_fields: merge,
    });
    response = upsert.data;
    if (!upsert.ok) error = `upsert ${upsert.status}: ${JSON.stringify(upsert.data).slice(0, 200)}`;

    // 2. Tag add/remove
    const tags: { name: string; status: "active" | "inactive" }[] = [];
    (input.tagsAdded ?? []).forEach((t) => tags.push({ name: t, status: "active" }));
    (input.tagsRemoved ?? []).forEach((t) => tags.push({ name: t, status: "inactive" }));
    if (tags.length > 0 && !error) {
      const tagRes = await mc(`/lists/${LIST}/members/${hash}/tags`, "POST", { tags });
      if (!tagRes.ok) error = `tags ${tagRes.status}: ${JSON.stringify(tagRes.data).slice(0, 200)}`;
    }
  } catch (e) {
    error = (e as Error).message;
  }

  // Audit log (best-effort).
  try {
    await supabase.from("mailchimp_lifecycle_events").insert({
      email: input.email,
      user_id: input.userId ?? null,
      event_type: input.eventType,
      tags_added: input.tagsAdded ?? [],
      tags_removed: input.tagsRemoved ?? [],
      merge_fields: input.mergeFields ?? {},
      success: !error,
      response: response as any,
      error,
    });
  } catch { /* swallow */ }

  return error ? { ok: false, error } : { ok: true };
}