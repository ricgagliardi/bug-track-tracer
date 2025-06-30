import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

const PASSCODES = (Deno.env.get("PASSCODES") || "Denver, Oakland, Seattle")
  .split(/\s*,\s*/);

interface BugRecord {
  bug_name: string;
  platform: string;
  feature: string;
  description: string;
  by: string;
  severity: string;
  status: string;
  notes: string;
}

const kv = await Deno.openKv();

function parseCookies(headers: Headers) {
  const cookie = headers.get("cookie") || "";
  const result: Record<string, string> = {};
  for (const pair of cookie.split(/;\s*/)) {
    const [k, v] = pair.split("=");
    if (k) result[k] = decodeURIComponent(v);
  }
  return result;
}

function isAuthed(req: Request): boolean {
  const cookies = parseCookies(req.headers);
  return PASSCODES.includes(cookies["auth"]);
}

function redirect(location: string): Response {
  return new Response("", { status: 303, headers: { Location: location } });
}

async function nextId(): Promise<number> {
  const res = await kv.get<number>(["meta", "next_id"]);
  const id = res.value ?? 1;
  await kv.set(["meta", "next_id"], id + 1);
  return id;
}

async function listBugs(): Promise<{ id: number; value: BugRecord }[]> {
  const bugs = [] as { id: number; value: BugRecord }[];
  for await (const entry of kv.list<BugRecord>({ prefix: ["bug"] })) {
    bugs.push({ id: entry.key[1] as number, value: entry.value });
  }
  return bugs;
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/trix/2.0.0/trix.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/trix/2.0.0/trix.umd.min.js"></script>
  <style>
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 4px; }
    th { background: #eee; }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function loginPage(): Response {
  const body = `<h1>Login</h1>
<form method="POST" action="/login">
  <input type="password" name="passcode" placeholder="Passcode" required>
  <button type="submit">Login</button>
</form>`;
  return new Response(layout("Login", body), { headers: { "content-type": "text/html" } });
}

function bugTablePage(bugs: { id: number; value: BugRecord }[], search: Record<string,string>, sort?: string, order: string = "asc"): Response {
  const headers = { "content-type": "text/html" };
  const columns = ["bug_name", "platform", "feature", "by", "status"];
  function header(name: string): string {
    const nextOrder = sort === name && order === "asc" ? "desc" : "asc";
    const params = new URLSearchParams({ ...search, sort: name, order: nextOrder });
    return `<th><a href="/?${params.toString()}">${name}</a><br><input name="${name}" value="${search[name]??""}"></th>`;
  }
  const headerRow = columns.map(header).join("");
  const filterForm = `<form method="GET"><table><thead><tr>${headerRow}</tr></thead></table><button type="submit">Filter</button></form>`;

  if (sort) {
    bugs.sort((a, b) => {
      const av = (a.value as any)[sort] || "";
      const bv = (b.value as any)[sort] || "";
      return order === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }
  const rows = bugs.map((b) => `<tr onclick="location='/bug?id=${b.id}'"><td>${b.value.bug_name}</td><td>${b.value.platform}</td><td>${b.value.feature}</td><td>${b.value.by}</td><td>${b.value.status}</td></tr>`).join("");
  const body = `<a href="/bug">New Bug</a>${filterForm}<table><thead><tr>${columns.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  return new Response(layout("Bugs", body), { headers });
}

function bugFormPage(bug?: {id:number;value:BugRecord}): Response {
  const record = bug?.value || { bug_name:"", platform:"Editor", feature:"Single Player", description:"", by:"", severity:"Medium", status:"New", notes:"" } as BugRecord;
  const idField = bug ? `<input type="hidden" name="id" value="${bug.id}">` : "";
  const body = `<h1>${bug ? "Edit" : "New"} Bug</h1>
<form method="POST" action="/bug">
${idField}
<label>Name <input name="bug_name" value="${record.bug_name}"></label><br>
<label>Platform <select name="platform"><option${record.platform==="Editor"?" selected":""}>Editor</option><option${record.platform==="Game"?" selected":""}>Game</option></select></label><br>
<label>Feature <select name="feature"><option${record.feature==="Single Player"?" selected":""}>Single Player</option><option${record.feature==="Classroom"?" selected":""}>Classroom</option><option${record.feature==="Competitive"?" selected":""}>Competitive</option><option${record.feature==="Other"?" selected":""}>Other</option></select></label><br>
<input id="desc" type="hidden" name="description" value="${record.description}">
<trix-editor input="desc"></trix-editor><br>
<label>By <input name="by" value="${record.by}"></label><br>
<label>Severity <select name="severity"><option${record.severity==="Show Stopper"?" selected":""}>Show Stopper</option><option${record.severity==="Urgent"?" selected":""}>Urgent</option><option${record.severity==="Medium"?" selected":""}>Medium</option><option${record.severity==="Low"?" selected":""}>Low</option><option${record.severity==="Feature Request"?" selected":""}>Feature Request</option></select></label><br>
<label>Status <select name="status"><option${record.status==="New"?" selected":""}>New</option><option${record.status==="Assigned"?" selected":""}>Assigned</option><option${record.status==="Cannot Reproduce"?" selected":""}>Cannot Reproduce</option><option${record.status==="Pending Question"?" selected":""}>Pending Question</option><option${record.status==="FIXED!"?" selected":""}>FIXED!</option><option${record.status==="Retired"?" selected":""}>Retired</option></select></label><br>
<input id="notes" type="hidden" name="notes" value="${record.notes}">
<trix-editor input="notes"></trix-editor><br>
<button type="submit">Save</button> <a href="/">Cancel</a>
</form>`;
  return new Response(layout("Bug", body), { headers: { "content-type":"text/html" } });
}

serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/login" && req.method === "POST") {
    const form = await req.formData();
    const passcode = form.get("passcode")?.toString() || "";
    if (PASSCODES.includes(passcode)) {
      const headers = new Headers({ "set-cookie": `auth=${encodeURIComponent(passcode)}; HttpOnly; Path=/` });
      return new Response("Logged in", { status:303, headers: { ...headers, Location: "/" } });
    }
    return new Response(layout("Login", "Invalid passcode"), { headers: {"content-type":"text/html"}, status:401 });
  }

  if (!isAuthed(req)) {
    return loginPage();
  }

  if (url.pathname === "/" && req.method === "GET") {
    const search: Record<string,string> = {};
    for (const [k,v] of url.searchParams.entries()) {
      if (["bug_name","platform","feature","by","status"].includes(k)) search[k]=v;
    }
    const sort = url.searchParams.get("sort") || undefined;
    const order = url.searchParams.get("order") || "asc";
    let bugs = await listBugs();
    for (const [k,v] of Object.entries(search)) {
      bugs = bugs.filter(b => (b.value as any)[k]?.toString().toLowerCase().includes(v.toLowerCase()));
    }
    return bugTablePage(bugs, search, sort, order);
  }

  if (url.pathname === "/bug" && req.method === "GET") {
    const id = url.searchParams.get("id");
    if (id) {
      const entry = await kv.get<BugRecord>(["bug", Number(id)]);
      if (entry.value) return bugFormPage({ id: Number(id), value: entry.value });
    }
    return bugFormPage();
  }

  if (url.pathname === "/bug" && req.method === "POST") {
    const form = await req.formData();
    const idStr = form.get("id")?.toString();
    const record: BugRecord = {
      bug_name: form.get("bug_name")?.toString() || "",
      platform: form.get("platform")?.toString() || "",
      feature: form.get("feature")?.toString() || "",
      description: form.get("description")?.toString() || "",
      by: form.get("by")?.toString() || "",
      severity: form.get("severity")?.toString() || "",
      status: form.get("status")?.toString() || "",
      notes: form.get("notes")?.toString() || "",
    };
    const id = idStr ? Number(idStr) : await nextId();
    await kv.set(["bug", id], record);
    return redirect("/");
  }

  return new Response("Not Found", { status: 404 });
});

