const PASSCODES = (window.PASSCODES || 'Denver, Oakland, Seattle').split(/\s*,\s*/);
const API_BASE = 'https://cigyz1wynk.g1.sqlite.cloud/v2/weblite/sql';
const DB = 'buglist-tracer-1';
const API_KEY = 'C8PeAcysNrnuViRfYHIOs2OgxhrjePoiZrvsNa5saVI';

let bugs = [];
let currentBug = null;

function apiQuery(sql) {
  const url = `${API_BASE}?sql=${encodeURIComponent(sql)}&database=${DB}&apikey=${API_KEY}`;
  return fetch(url).then(r => r.json());
}

function requireLogin() {
  const saved = localStorage.getItem('passcode') || '';
  if (PASSCODES.includes(saved)) {
    init();
    return;
  }
  const div = document.createElement('div');
  div.innerHTML = `
    <h1>Login</h1>
    <div class="mb-3">
      <input id="pass" type="password" class="form-control" placeholder="Passcode">
    </div>
    <button class="btn btn-primary" id="login">Login</button>
  `;
  document.getElementById('app').append(div);
  document.getElementById('login').onclick = () => {
    const val = document.getElementById('pass').value.trim();
    if (PASSCODES.includes(val)) {
      localStorage.setItem('passcode', val);
      location.reload();
    } else {
      alert('Invalid passcode');
    }
  };
}

async function loadBugs() {
  const res = await apiQuery('SELECT * FROM buglist');
  bugs = res.rows || [];
}

function renderTable(filter = {}, sort = null, order = 'asc') {
  const app = document.getElementById('app');
  app.innerHTML = '<button class="btn btn-success mb-2" id="newBug">New Bug</button>';
  const table = document.createElement('table');
  table.className = 'table table-bordered table-sm';
  const columns = ['bug_name','platform','feature','by','status'];
  const thead = document.createElement('thead');
  const hdrRow = document.createElement('tr');
  for (const c of columns) {
    const th = document.createElement('th');
    th.innerHTML = `<span class="sort" data-col="${c}">${c}</span><br><input class="form-control form-control-sm" data-filter="${c}" value="${filter[c]||''}">`;
    hdrRow.appendChild(th);
  }
  thead.appendChild(hdrRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  let list = bugs.slice();
  for (const [k,v] of Object.entries(filter)) {
    list = list.filter(b => (b[k]||'').toString().toLowerCase().includes(v.toLowerCase()));
  }
  if (sort) {
    list.sort((a,b)=>{
      const av=(a[sort]||'').toString().toLowerCase();
      const bv=(b[sort]||'').toString().toLowerCase();
      return order==='asc'? av.localeCompare(bv): bv.localeCompare(av);
    });
  }
  for (const bug of list) {
    const tr = document.createElement('tr');
    tr.innerHTML = columns.map(c=>`<td>${bug[c]}</td>`).join('');
    tr.onclick = ()=> openForm(bug);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  app.appendChild(table);
  document.getElementById('newBug').onclick = ()=> openForm();
  app.querySelectorAll('input[data-filter]').forEach(inp => {
    inp.oninput = ()=>{
      filter[inp.dataset.filter] = inp.value;
      renderTable(filter, sort, order);
    };
  });
  app.querySelectorAll('.sort').forEach(el=>{
    el.onclick=()=>{
      const col = el.dataset.col;
      const nextOrder = sort===col && order==='asc' ? 'desc':'asc';
      renderTable(filter, col, nextOrder);
    };
  });
}

function openForm(bug) {
  currentBug = bug || { bug_name:'', platform:'Editor', feature:'Single Player', description:'', by:'', severity:'Medium', status:'New', notes:'' };
  const app = document.getElementById('app');
  app.innerHTML = `
    <h1>${bug ? 'Edit' : 'New'} Bug</h1>
    <form id="bugForm">
      <div class="mb-2"><label class="form-label">Name <input name="bug_name" class="form-control" value="${currentBug.bug_name}"></label></div>
      <div class="mb-2"><label class="form-label">Platform <select name="platform" class="form-select">
        ${['Editor','Game'].map(p=>`<option${currentBug.platform===p?' selected':''}>${p}</option>`).join('')}
      </select></label></div>
      <div class="mb-2"><label class="form-label">Feature <select name="feature" class="form-select">
        ${['Single Player','Classroom','Competitive','Other'].map(f=>`<option${currentBug.feature===f?' selected':''}>${f}</option>`).join('')}
      </select></label></div>
      <input id="desc" type="hidden" name="description" value="${currentBug.description}">
      <trix-editor input="desc"></trix-editor>
      <div class="mb-2"><label class="form-label">By <input name="by" class="form-control" value="${currentBug.by}"></label></div>
      <div class="mb-2"><label class="form-label">Severity <select name="severity" class="form-select">
        ${['Show Stopper','Urgent','Medium','Low','Feature Request'].map(s=>`<option${currentBug.severity===s?' selected':''}>${s}</option>`).join('')}
      </select></label></div>
      <div class="mb-2"><label class="form-label">Status <select name="status" class="form-select">
        ${['New','Assigned','Cannot Reproduce','Pending Question','FIXED!','Retired'].map(s=>`<option${currentBug.status===s?' selected':''}>${s}</option>`).join('')}
      </select></label></div>
      <input id="notes" type="hidden" name="notes" value="${currentBug.notes}">
      <trix-editor input="notes"></trix-editor>
      <div class="mt-2"><button class="btn btn-primary" type="submit">Save</button> <button type="button" id="cancel" class="btn btn-secondary">Cancel</button></div>
    </form>`;
  document.getElementById('cancel').onclick = ()=> { renderTable(); };
  document.getElementById('bugForm').onsubmit = async (e)=>{
    e.preventDefault();
    const form = new FormData(e.target);
    const data = {};
    for (const [k,v] of form.entries()) data[k]=v;
    if (currentBug.id) data.id=currentBug.id;
    await saveBug(data);
    await loadBugs();
    renderTable();
  };
}

async function saveBug(rec) {
  if (rec.id) {
    const sql = `UPDATE buglist SET bug_name='${rec.bug_name}', platform='${rec.platform}', feature='${rec.feature}', description='${rec.description}', by='${rec.by}', severity='${rec.severity}', status='${rec.status}', notes='${rec.notes}' WHERE id=${rec.id}`;
    await apiQuery(sql);
  } else {
    const sql = `INSERT INTO buglist (bug_name,platform,feature,description,by,severity,status,notes) VALUES ('${rec.bug_name}','${rec.platform}','${rec.feature}','${rec.description}','${rec.by}','${rec.severity}','${rec.status}','${rec.notes}')`;
    await apiQuery(sql);
  }
}

async function init() {
  await loadBugs();
  renderTable();
}

requireLogin();
