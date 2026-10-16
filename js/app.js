/* ============================================================
   app.js — Techwave Client Management System (TCMS)
   Main application logic. Runs only inside app.html.
   All data comes from Local Storage (see js/db.js) so every screen
   shown here updates live, in this browser, the moment the
   underlying record changes.
   ============================================================ */

const SWATCHES = ['#4F46E5', '#2563EB', '#0EA5E9', '#14B8A6', '#16A34A', '#D97706', '#DC2626', '#DB2777', '#7C3AED', '#0F172A'];
const TYPE_TAG_CLASS = { School: 'tag-school', Business: 'tag-business', Company: 'tag-company', NGO: 'tag-ngo', Government: 'tag-government' };
const REPORT_TYPES = { 'Site Visit': 'var(--primary)', 'Phone Call': 'var(--accent)', 'Training Session': 'var(--success)', 'Support Ticket': 'var(--warning)', 'Follow-up': 'var(--tag-ngo)', 'Other': 'var(--muted)' };

let state = {
  view: 'dashboard',
  clientFilter: 'all',
  statusFilter: '',
  countyFilter: '',
  search: '',
  editingClientId: null,
  msgTab: 'inbox',
  clients: [],
  notes: [],
  reports: [],
  activities: [],
  users: [],
  messagesInbox: [],
  messagesSent: [],
  settings: null
};
let unsubscribers = [];

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  const profile = await DB.waitForSession();
  if (!profile) { window.location.href = 'index.html'; return; }

  applyRoleUI();
  bindNav();
  bindMobileNav();
  bindDashboard();
  bindClients();
  bindClientModal();
  bindDetailModal();
  bindNotes();
  bindReports();
  bindMessages();
  bindAccounts();
  bindSettings();
  bindTopbar();
  bindMyAccount();

  renderShellBranding();

  unsubscribers.push(DB.subscribeSettings(s => { state.settings = s; applyTheme(s); renderShellBranding(); loadSettingsIntoForm(); renderLoginSliderGrid(); }));
  unsubscribers.push(DB.subscribeClients(list => { state.clients = list; renderNavCounts(); renderDashboard(); renderClients(); renderAnalytics(); }));
  unsubscribers.push(DB.subscribeNotes(list => { state.notes = list; renderNotes(); }));
  unsubscribers.push(DB.subscribeReports(list => { state.reports = list; renderReports(); renderNavCounts(); }));
  unsubscribers.push(DB.subscribeActivities(list => { state.activities = list; renderDashboard(); renderActivity(); }));
  unsubscribers.push(DB.subscribeInbox(list => { state.messagesInbox = list; renderMessages(); renderUnreadBadge(); }));
  unsubscribers.push(DB.subscribeSent(list => { state.messagesSent = list; renderMessages(); }));
  if (DB.isAdmin()) {
    unsubscribers.push(DB.subscribeUsers(list => { state.users = list; renderAccounts(); populateMessageRecipients(); }));
  } else {
    populateMessageRecipients();
  }
});

window.addEventListener('beforeunload', () => unsubscribers.forEach(u => { try { u(); } catch (e) {} }));

/* ============================================================
   ROLE-AWARE UI
   ============================================================ */
function applyRoleUI() {
  const isAdmin = DB.isAdmin();
  document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin));
  document.querySelectorAll('.admin-only-pane').forEach(el => el.classList.toggle('hidden', !isAdmin));
  if (!isAdmin) {
    // non-admin lands on "My Account" since branding/appearance/login-slider are admin-only
    document.querySelectorAll('.settings-nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
    document.querySelector('.settings-nav button[data-pane="account"]').classList.add('active');
    document.getElementById('pane-account').classList.add('active');
    document.getElementById('reportsSub').textContent = 'Reports you file are private — only you and an administrator can see them.';
  } else {
    document.getElementById('reportsSub').textContent = 'As an administrator you can see every engagement report filed by your team.';
    document.getElementById('activitySub').textContent = 'A full history of everything added, edited or removed by your whole team.';
  }
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function bindNav() {
  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view;
      if (link.dataset.filter) state.clientFilter = link.dataset.filter;
      switchView(view);
      closeMobileDrawer();
    });
  });
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await DB.logout();
    window.location.href = 'index.html';
  });
}

function bindMobileNav() {
  document.querySelectorAll('.bn-link[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (link.dataset.filter) state.clientFilter = link.dataset.filter;
      switchView(link.dataset.view);
    });
  });
  document.getElementById('mobileMenuBtn').addEventListener('click', openMobileDrawer);
  document.getElementById('bnMenu').addEventListener('click', (e) => { e.preventDefault(); openMobileDrawer(); });
  document.getElementById('mobileNavOverlay').addEventListener('click', closeMobileDrawer);
}
function openMobileDrawer() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('mobileNavOverlay').classList.remove('hidden');
}
function closeMobileDrawer() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('mobileNavOverlay').classList.add('hidden');
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.nav-link[data-view], .bn-link[data-view]').forEach(l => l.classList.remove('active'));
  [...document.querySelectorAll(`.nav-link[data-view="${view}"], .bn-link[data-view="${view}"]`)].forEach(l => {
    if (!l.dataset.filter || l.dataset.filter === state.clientFilter) l.classList.add('active');
  });

  const titles = { dashboard: 'Dashboard', clients: 'Clients', notes: 'Notes & Documents', reports: 'Engagement Reports', analytics: 'Analytics', activity: 'Activity Log', messages: 'Messages', accounts: 'Accounts', settings: 'Settings' };
  document.getElementById('topbarTitle').textContent = titles[view] || 'Techwave';

  if (view === 'clients') renderClients();
  if (view === 'reports') renderReports();
  if (view === 'messages') { renderMessages(); markInboxRead(); }
  window.scrollTo(0, 0);
}

/* ============================================================
   BRANDING (sidebar + topbar + account chip)
   ============================================================ */
function renderShellBranding() {
  const s = state.settings || DB.defaultSettings();
  document.getElementById('sbCompanyName').textContent = s.companyName || 'Techwave IT Firm';
  const mark = document.getElementById('sbLogoMark');
  mark.innerHTML = s.logo ? `<img src="${s.logo}" alt="logo">` : (s.companyName || 'T').trim().charAt(0).toUpperCase();

  const profile = DB.currentProfile();
  if (profile) {
    document.getElementById('sbUserName').textContent = profile.name || profile.username;
    document.getElementById('sbUserRole').textContent = profile.role === 'admin' ? 'Administrator' : 'Reporting Staff';
    document.getElementById('sbUserAv').textContent = (profile.name || profile.username).charAt(0).toUpperCase();
    document.getElementById('dashGreeting').textContent = `Welcome back, ${(profile.name || profile.username).split(' ')[0]} 👋`;
  }
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function bindDashboard() {
  document.getElementById('dashAddClientBtn').addEventListener('click', () => openClientModal());
}

function renderDashboard() {
  const clients = state.clients;
  const counts = {
    total: clients.length,
    School: clients.filter(c => c.type === 'School').length,
    Business: clients.filter(c => c.type === 'Business').length,
    Company: clients.filter(c => c.type === 'Company').length,
    NGO: clients.filter(c => c.type === 'NGO').length,
    Government: clients.filter(c => c.type === 'Government').length,
    expiringSoon: clients.filter(c => isExpiringSoon(c.contractExpiry)).length,
    freeSchools: clients.filter(c => c.freeService === 'Yes').length
  };

  const cards = [
    { label: 'Total Clients', num: counts.total, color: 'var(--primary)', bg: 'var(--primary-light)' },
    { label: 'Schools', num: counts.School, color: 'var(--tag-school)', bg: '#ECFDF9' },
    { label: 'Businesses', num: counts.Business, color: 'var(--tag-business)', bg: '#FEF6EC' },
    { label: 'Companies', num: counts.Company, color: 'var(--tag-company)', bg: 'var(--primary-light)' },
    { label: 'NGOs', num: counts.NGO, color: 'var(--tag-ngo)', bg: '#FAF5FF' },
    { label: 'Government', num: counts.Government, color: 'var(--tag-govt)', bg: '#EEF2F7' },
    { label: 'Contracts Expiring', num: counts.expiringSoon, color: 'var(--warning)', bg: 'var(--warning-light)' },
    { label: DB.isAdmin() ? 'Engagement Reports' : 'My Reports', num: state.reports.length, color: 'var(--success)', bg: 'var(--success-light)' }
  ];

  document.getElementById('statGrid').innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-icon" style="background:${c.bg}; color:${c.color};">●</div>
      <div class="stat-num">${c.num}</div>
      <div class="stat-label">${c.label}</div>
    </div>
  `).join('');

  const activities = state.activities.slice(0, 7);
  document.getElementById('dashActivityList').innerHTML = activities.length ? activities.map(activityRow).join('') :
    `<div class="empty-state"><div class="big">🗂️</div>No activity yet — actions you take will show up here.</div>`;

  const freeSchools = clients.filter(c => c.freeService === 'Yes');
  document.getElementById('freeSchoolCount').textContent = freeSchools.length;
  document.getElementById('dashFreeSchools').innerHTML = freeSchools.length ?
    `<div style="padding:6px 10px;">` + freeSchools.slice(0, 6).map(c => `
      <div style="display:flex; justify-content:space-between; padding:9px 0; border-bottom:1px solid var(--border); font-size:13px;">
        <span>${esc(c.clientName)}</span>
        <span style="color:var(--muted); font-size:12px;">${esc(c.county || '—')}</span>
      </div>
    `).join('') + `</div>` :
    `<div class="empty-state"><div class="big">🎓</div>No free school clients yet.</div>`;
}

function activityRow(a) {
  return `
    <div class="activity-row">
      <div class="activity-dot" style="background:${activityColor(a.type)}"></div>
      <div>
        <div class="msg">${esc(a.message)}${DB.isAdmin() && a.username ? ` <span class="cell-sub">— ${esc(a.username)}</span>` : ''}</div>
        <div class="time">${timeAgo(a.time)}</div>
      </div>
    </div>`;
}
function activityColor(type) {
  return { add: 'var(--success)', edit: 'var(--primary)', delete: 'var(--danger)', note: 'var(--accent)', report: 'var(--success)', login: 'var(--muted)', logout: 'var(--muted)', restore: 'var(--warning)', account: 'var(--tag-ngo)', security: 'var(--warning)', message: 'var(--accent)' }[type] || 'var(--primary)';
}

/* ============================================================
   CLIENTS
   ============================================================ */
function bindClients() {
  document.getElementById('addClientBtn').addEventListener('click', () => openClientModal());
  document.getElementById('statusFilter').addEventListener('change', (e) => { state.statusFilter = e.target.value; renderClients(); });
  document.getElementById('countyFilter').addEventListener('input', (e) => { state.countyFilter = e.target.value; renderClients(); });
  document.getElementById('exportClientsBtn').addEventListener('click', exportClientsJSON);
  document.getElementById('printClientsBtn').addEventListener('click', () => window.print());
}

function getFilteredClients() {
  let list = [...state.clients];
  if (state.clientFilter && state.clientFilter !== 'all') list = list.filter(c => c.type === state.clientFilter);
  if (state.statusFilter) list = list.filter(c => c.status === state.statusFilter);
  if (state.countyFilter) list = list.filter(c => (c.county || '').toLowerCase().includes(state.countyFilter.toLowerCase()));
  if (state.search) {
    const q = state.search.toLowerCase();
    list = list.filter(c =>
      (c.clientName || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.county || '').toLowerCase().includes(q) ||
      (c.type || '').toLowerCase().includes(q) ||
      (c.status || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function renderClients() {
  const list = getFilteredClients();
  const titleMap = { all: 'All Clients', School: 'Schools', Business: 'Businesses', Company: 'Companies', NGO: 'NGOs', Government: 'Government Institutions' };
  document.getElementById('clientsTitle').textContent = titleMap[state.clientFilter] || 'Clients';
  document.getElementById('clientsCountLabel').textContent = list.length;

  const body = document.getElementById('clientsTableBody');
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="big">🗃️</div>No clients found. Try adjusting your filters, or add a new client.</div></td></tr>`;
    return;
  }

  body.innerHTML = list.map(c => `
    <tr>
      <td>
        <div class="cell-name">${esc(c.clientName)}</div>
        <div class="cell-sub">${esc(c.email || c.website || '—')}</div>
      </td>
      <td><span class="tag ${TYPE_TAG_CLASS[c.type] || 'tag-other'}">${esc(c.type)}</span></td>
      <td>
        <div>${esc(c.contactPerson || '—')}</div>
        <div class="cell-sub">${esc(c.phone || '—')}</div>
      </td>
      <td>${esc(c.county || '—')}</td>
      <td><span class="status-pill status-${(c.status || 'active').toLowerCase()}">${esc(c.status || 'Active')}</span></td>
      <td>
        <div class="row-actions">
          <button title="View" data-action="view" data-id="${c.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button title="Edit" data-action="edit" data-id="${c.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </button>
          <button title="Delete" class="danger" data-action="delete" data-id="${c.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === 'view') openDetailModal(id);
      if (action === 'edit') openClientModal(id);
      if (action === 'delete') confirmDeleteClient(id);
    });
  });
}

function renderNavCounts() {
  const clients = state.clients;
  document.getElementById('navCountAll').textContent = clients.length;
  ['School', 'Business', 'Company', 'NGO', 'Government'].forEach(t => {
    document.getElementById(`navCount${t}`).textContent = clients.filter(c => c.type === t).length;
  });
  document.getElementById('navCountReports').textContent = state.reports.length;
}

function confirmDeleteClient(id) {
  const c = state.clients.find(x => x.id === id);
  if (!c) return;
  if (confirm(`Delete "${c.clientName}"? This cannot be undone.`)) {
    DB.deleteClient(id, c.clientName);
    showToast('Client deleted.', 'success');
  }
}

function exportClientsJSON() {
  downloadJSON(getFilteredClients(), `tcms-clients-${dateStamp()}.json`);
  showToast('Clients exported.', 'success');
}

/* ---------- client add/edit modal ---------- */
function bindClientModal() {
  document.getElementById('clientModalClose').addEventListener('click', closeClientModal);
  document.getElementById('clientCancelBtn').addEventListener('click', closeClientModal);
  document.getElementById('clientSaveBtn').addEventListener('click', saveClientForm);
  document.getElementById('clientModal').addEventListener('click', (e) => { if (e.target.id === 'clientModal') closeClientModal(); });
}

function openClientModal(id = null) {
  state.editingClientId = id;
  const form = document.getElementById('clientForm');
  form.reset();
  document.getElementById('fCountry').value = 'Liberia';
  document.getElementById('fStatus').value = 'Active';
  document.getElementById('fFreeService').value = 'No';

  if (id) {
    const c = state.clients.find(x => x.id === id);
    if (!c) return;
    document.getElementById('clientModalTitle').textContent = 'Edit Client';
    document.getElementById('clientId').value = c.id;
    document.getElementById('fClientName').value = c.clientName || '';
    document.getElementById('fType').value = c.type || 'School';
    document.getElementById('fStatus').value = c.status || 'Active';
    document.getElementById('fContact').value = c.contactPerson || '';
    document.getElementById('fPhone').value = c.phone || '';
    document.getElementById('fEmail').value = c.email || '';
    document.getElementById('fWebsite').value = c.website || '';
    document.getElementById('fAddress').value = c.address || '';
    document.getElementById('fCounty').value = c.county || '';
    document.getElementById('fCountry').value = c.country || 'Liberia';
    document.getElementById('fRegNo').value = c.regNo || '';
    document.getElementById('fDateRegistered').value = c.dateRegistered || '';
    document.getElementById('fContractExpiry').value = c.contractExpiry || '';
    document.getElementById('fFreeService').value = c.freeService || 'No';
    document.getElementById('fNotes').value = c.notes || '';
  } else {
    document.getElementById('clientModalTitle').textContent = 'Add Client';
    document.getElementById('clientId').value = '';
  }
  document.getElementById('clientModal').classList.remove('hidden');
}
function closeClientModal() { document.getElementById('clientModal').classList.add('hidden'); }

async function saveClientForm() {
  const name = document.getElementById('fClientName').value.trim();
  if (!name) { showToast('Client name is required.', 'error'); return; }

  const payload = {
    clientName: name,
    type: document.getElementById('fType').value,
    status: document.getElementById('fStatus').value,
    contactPerson: document.getElementById('fContact').value.trim(),
    phone: document.getElementById('fPhone').value.trim(),
    email: document.getElementById('fEmail').value.trim(),
    website: document.getElementById('fWebsite').value.trim(),
    address: document.getElementById('fAddress').value.trim(),
    county: document.getElementById('fCounty').value.trim(),
    country: document.getElementById('fCountry').value.trim(),
    regNo: document.getElementById('fRegNo').value.trim(),
    dateRegistered: document.getElementById('fDateRegistered').value,
    contractExpiry: document.getElementById('fContractExpiry').value,
    freeService: document.getElementById('fFreeService').value,
    notes: document.getElementById('fNotes').value.trim()
  };

  const id = document.getElementById('clientId').value;
  const btn = document.getElementById('clientSaveBtn');
  btn.disabled = true;
  try {
    if (id) { await DB.updateClient(id, payload); showToast('Client updated.', 'success'); }
    else { await DB.addClient(payload); showToast('Client added.', 'success'); }
    closeClientModal();
  } catch (e) {
    showToast(e.message || 'Could not save client.', 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- client detail modal ---------- */
function bindDetailModal() {
  document.getElementById('detailModalClose').addEventListener('click', () => document.getElementById('detailModal').classList.add('hidden'));
  document.getElementById('detailModal').addEventListener('click', (e) => { if (e.target.id === 'detailModal') document.getElementById('detailModal').classList.add('hidden'); });
  document.getElementById('detailPrintBtn').addEventListener('click', () => window.print());
  document.getElementById('detailEditBtn').addEventListener('click', () => {
    const id = document.getElementById('detailEditBtn').dataset.id;
    document.getElementById('detailModal').classList.add('hidden');
    openClientModal(id);
  });
}

function openDetailModal(id) {
  const c = state.clients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('detailModalTitle').textContent = c.clientName;
  document.getElementById('detailEditBtn').dataset.id = id;

  const fields = [
    ['Institution Type', c.type], ['Status', c.status],
    ['Contact Person', c.contactPerson || '—'], ['Phone', c.phone || '—'],
    ['Email', c.email || '—'], ['Website', c.website || '—'],
    ['County', c.county || '—'], ['Country', c.country || '—'],
    ['Registration No.', c.regNo || '—'], ['Date Registered', c.dateRegistered || '—'],
    ['Contract Expiry', c.contractExpiry || '—'], ['Free School Service', c.freeService || 'No']
  ];

  document.getElementById('detailModalBody').innerHTML = `
    <div class="detail-grid">
      ${fields.map(([k, v]) => `<div class="detail-item"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join('')}
      <div class="detail-item full" style="grid-column:1/-1;"><div class="k">Address</div><div class="v">${esc(c.address || '—')}</div></div>
    </div>
    <div class="k" style="margin-bottom:6px;">Notes</div>
    <div class="detail-notes">${esc(c.notes || 'No notes recorded for this client yet.')}</div>
  `;
  document.getElementById('detailModal').classList.remove('hidden');
}

/* ============================================================
   NOTES & DOCUMENTS
   ============================================================ */
function bindNotes() {
  document.getElementById('addNoteBtn').addEventListener('click', openNoteModal);
  document.getElementById('noteModalClose').addEventListener('click', closeNoteModal);
  document.getElementById('noteCancelBtn').addEventListener('click', closeNoteModal);
  document.getElementById('noteSaveBtn').addEventListener('click', saveNoteForm);
  document.getElementById('noteModal').addEventListener('click', (e) => { if (e.target.id === 'noteModal') closeNoteModal(); });
}

function openNoteModal() {
  const select = document.getElementById('nClientId');
  select.innerHTML = `<option value="">General note (not linked to a client)</option>` +
    state.clients.map(c => `<option value="${c.id}">${esc(c.clientName)}</option>`).join('');
  document.getElementById('noteForm').reset();
  document.getElementById('noteModal').classList.remove('hidden');
}
function closeNoteModal() { document.getElementById('noteModal').classList.add('hidden'); }

async function saveNoteForm() {
  const text = document.getElementById('nText').value.trim();
  if (!text) { showToast('Note text is required.', 'error'); return; }
  const clientId = document.getElementById('nClientId').value;
  const client = clientId ? state.clients.find(x => x.id === clientId) : null;
  try {
    await DB.addNote({
      clientId: clientId || null,
      clientName: client ? client.clientName : null,
      category: document.getElementById('nCategory').value,
      text
    });
    showToast('Note saved.', 'success');
    closeNoteModal();
  } catch (e) { showToast(e.message || 'Could not save note.', 'error'); }
}

function renderNotes() {
  const notes = state.notes;
  const wrap = document.getElementById('notesList');
  if (!notes.length) {
    wrap.innerHTML = `<div class="panel"><div class="empty-state"><div class="big">📝</div>No notes yet. Add meeting notes, support history or training records.</div></div>`;
    return;
  }
  wrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Note</th><th>Category</th><th>Client</th><th>By</th><th>Date</th><th></th></tr></thead><tbody>` +
    notes.map(n => `
      <tr>
        <td style="max-width:320px;">${esc(n.text)}</td>
        <td><span class="tag tag-other">${esc(n.category)}</span></td>
        <td>${esc(n.clientName || 'General')}</td>
        <td class="cell-sub">${esc(n.createdByName || '—')}</td>
        <td class="cell-sub">${timeAgo(n.createdAt)}</td>
        <td><div class="row-actions"><button class="danger" data-note-id="${n.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button></div></td>
      </tr>
    `).join('') + `</tbody></table></div>`;

  wrap.querySelectorAll('button[data-note-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this note?')) { DB.deleteNote(btn.dataset.noteId); showToast('Note deleted.', 'success'); }
    });
  });
}

/* ============================================================
   ENGAGEMENT REPORTS (private to the author + admin)
   ============================================================ */
function bindReports() {
  document.getElementById('addReportBtn').addEventListener('click', () => openReportModal());
  document.getElementById('reportModalClose').addEventListener('click', closeReportModal);
  document.getElementById('reportCancelBtn').addEventListener('click', closeReportModal);
  document.getElementById('reportSaveBtn').addEventListener('click', saveReportForm);
  document.getElementById('reportModal').addEventListener('click', (e) => { if (e.target.id === 'reportModal') closeReportModal(); });
}

function openReportModal(id = null) {
  const select = document.getElementById('rClientId');
  select.innerHTML = state.clients.map(c => `<option value="${c.id}">${esc(c.clientName)}</option>`).join('') ||
    `<option value="">Add a client first</option>`;
  document.getElementById('reportForm').reset();
  document.getElementById('rDate').value = dateStamp();

  if (id) {
    const r = state.reports.find(x => x.id === id);
    if (!r) return;
    document.getElementById('reportModalTitle').textContent = 'Edit Engagement Report';
    document.getElementById('reportId').value = r.id;
    select.value = r.clientId;
    document.getElementById('rType').value = r.engagementType || 'Site Visit';
    document.getElementById('rDate').value = r.reportDate || dateStamp();
    document.getElementById('rOutcome').value = r.outcome || 'Positive';
    document.getElementById('rFollowUp').value = r.followUpDate || '';
    document.getElementById('rSummary').value = r.summary || '';
  } else {
    document.getElementById('reportModalTitle').textContent = 'File Engagement Report';
    document.getElementById('reportId').value = '';
  }
  document.getElementById('reportModal').classList.remove('hidden');
}
function closeReportModal() { document.getElementById('reportModal').classList.add('hidden'); }

async function saveReportForm() {
  const clientId = document.getElementById('rClientId').value;
  const client = state.clients.find(c => c.id === clientId);
  const summary = document.getElementById('rSummary').value.trim();
  if (!clientId || !client) { showToast('Choose a client for this report.', 'error'); return; }
  if (!summary) { showToast('A summary is required.', 'error'); return; }

  const payload = {
    clientId, clientName: client.clientName,
    engagementType: document.getElementById('rType').value,
    reportDate: document.getElementById('rDate').value,
    outcome: document.getElementById('rOutcome').value,
    followUpDate: document.getElementById('rFollowUp').value,
    summary
  };
  const id = document.getElementById('reportId').value;
  const btn = document.getElementById('reportSaveBtn');
  btn.disabled = true;
  try {
    if (id) { await DB.updateReport(id, payload); showToast('Report updated.', 'success'); }
    else { await DB.addReport(payload); showToast('Report filed.', 'success'); }
    closeReportModal();
  } catch (e) {
    showToast(e.message || 'Could not save report.', 'error');
  } finally { btn.disabled = false; }
}

function renderReports() {
  const list = state.reports;
  const wrap = document.getElementById('reportsList');
  if (!list.length) {
    wrap.innerHTML = `<div class="panel"><div class="empty-state"><div class="big">📋</div>No engagement reports yet. File one after a visit, call or training session.</div></div>`;
    return;
  }
  wrap.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Client</th><th>Type</th>${DB.isAdmin() ? '<th>Filed by</th>' : ''}<th>Date</th><th>Outcome</th><th></th></tr></thead><tbody>` +
    list.map(r => `
      <tr>
        <td class="cell-name">${esc(r.clientName)}<div class="cell-sub" style="max-width:280px; white-space:normal;">${esc((r.summary || '').slice(0, 90))}${(r.summary || '').length > 90 ? '…' : ''}</div></td>
        <td><span class="tag" style="color:${REPORT_TYPES[r.engagementType] || 'var(--muted)'}; background:var(--bg);">${esc(r.engagementType)}</span></td>
        ${DB.isAdmin() ? `<td class="cell-sub">${esc(r.createdByName || '—')}</td>` : ''}
        <td class="cell-sub">${esc(r.reportDate)}</td>
        <td><span class="status-pill status-${r.outcome === 'Positive' ? 'active' : r.outcome === 'Issue Raised' ? 'expired' : 'pending'}">${esc(r.outcome || '—')}</span></td>
        <td>
          <div class="row-actions">
            <button title="Edit" data-redit="${r.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
            <button title="Delete" class="danger" data-rdel="${r.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>
          </div>
        </td>
      </tr>
    `).join('') + `</tbody></table></div>`;

  wrap.querySelectorAll('button[data-redit]').forEach(btn => btn.addEventListener('click', () => openReportModal(btn.dataset.redit)));
  wrap.querySelectorAll('button[data-rdel]').forEach(btn => btn.addEventListener('click', () => {
    if (confirm('Delete this engagement report?')) { DB.deleteReport(btn.dataset.rdel); showToast('Report deleted.', 'success'); }
  }));
}

/* ============================================================
   ACTIVITY LOG
   ============================================================ */
function renderActivity() {
  const list = state.activities;
  const el = document.getElementById('fullActivityList');
  el.innerHTML = list.length ? list.map(activityRow).join('') :
    `<div class="empty-state"><div class="big">🗂️</div>No activity recorded yet.</div>`;
}

/* ============================================================
   ANALYTICS
   ============================================================ */
function renderAnalytics() {
  const clients = state.clients;
  const types = ['School', 'Business', 'Company', 'NGO', 'Government', 'Church', 'Hospital', 'University', 'Other'];
  const byType = types.map(t => ({ label: t, count: clients.filter(c => c.type === t).length })).filter(x => x.count > 0);
  const statuses = ['Active', 'Pending', 'Expired'];
  const byStatus = statuses.map(s => ({ label: s, count: clients.filter(c => c.status === s).length }));

  document.getElementById('reportByType').innerHTML = byType.length ? barList(byType, clients.length) : emptyReport();
  document.getElementById('reportByStatus').innerHTML = barList(byStatus, clients.length || 1);

  const expiring = clients.filter(c => isExpiringSoon(c.contractExpiry)).sort((a, b) => (a.contractExpiry || '').localeCompare(b.contractExpiry || ''));
  document.getElementById('reportExpiring').innerHTML = expiring.length ?
    `<div class="table-wrap" style="box-shadow:none; border:none;"><table><thead><tr><th>Client</th><th>Type</th><th>Expiry Date</th></tr></thead><tbody>` +
    expiring.map(c => `<tr><td class="cell-name">${esc(c.clientName)}</td><td><span class="tag ${TYPE_TAG_CLASS[c.type] || 'tag-other'}">${esc(c.type)}</span></td><td>${esc(c.contractExpiry)}</td></tr>`).join('') +
    `</tbody></table></div>` :
    `<div class="empty-state"><div class="big">✅</div>No contracts expiring in the next 30 days.</div>`;
}
function barList(items, total) {
  return `<div style="display:flex; flex-direction:column; gap:12px;">` + items.map(i => `
    <div>
      <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:5px;">
        <span>${i.label}</span><span style="color:var(--muted);">${i.count}</span>
      </div>
      <div style="height:7px; background:var(--bg); border-radius:6px; overflow:hidden;">
        <div style="height:100%; width:${total ? (i.count / total * 100) : 0}%; background:var(--primary); border-radius:6px;"></div>
      </div>
    </div>
  `).join('') + `</div>`;
}
function emptyReport() { return `<div class="empty-state"><div class="big">📊</div>Add clients to see analytics.</div>`; }

/* ============================================================
   MESSAGES
   ============================================================ */
function bindMessages() {
  document.getElementById('composeMsgBtn').addEventListener('click', openMessageModal);
  document.getElementById('messageModalClose').addEventListener('click', closeMessageModal);
  document.getElementById('messageCancelBtn').addEventListener('click', closeMessageModal);
  document.getElementById('messageSendBtn').addEventListener('click', sendMessageForm);
  document.getElementById('messageModal').addEventListener('click', (e) => { if (e.target.id === 'messageModal') closeMessageModal(); });
  document.getElementById('msgTabInbox').addEventListener('click', () => switchMsgTab('inbox'));
  document.getElementById('msgTabSent').addEventListener('click', () => switchMsgTab('sent'));
}
function switchMsgTab(tab) {
  state.msgTab = tab;
  document.getElementById('msgTabInbox').classList.toggle('active', tab === 'inbox');
  document.getElementById('msgTabSent').classList.toggle('active', tab === 'sent');
  renderMessages();
  if (tab === 'inbox') markInboxRead();
}
function populateMessageRecipients() {
  const select = document.getElementById('mTo');
  const me = DB.currentProfile().uid;
  const options = ['<option value="all">All Accounts</option>']
    .concat(state.users.filter(u => u.uid !== me).map(u => `<option value="${u.uid}" data-name="${esc(u.username)}">${esc(u.name || u.username)} (${u.role})</option>`));
  select.innerHTML = options.join('');
}
function openMessageModal() {
  document.getElementById('messageForm').reset();
  document.getElementById('messageModal').classList.remove('hidden');
}
function closeMessageModal() { document.getElementById('messageModal').classList.add('hidden'); }

async function sendMessageForm() {
  const select = document.getElementById('mTo');
  const to = select.value;
  const toName = select.options[select.selectedIndex].text;
  const subject = document.getElementById('mSubject').value.trim();
  const body = document.getElementById('mBody').value.trim();
  if (!subject || !body) { showToast('Subject and message are required.', 'error'); return; }
  const btn = document.getElementById('messageSendBtn');
  btn.disabled = true;
  try {
    await DB.sendMessage({ to, toName, subject, body });
    showToast('Message sent.', 'success');
    closeMessageModal();
  } catch (e) {
    showToast(e.message || 'Could not send message.', 'error');
  } finally { btn.disabled = false; }
}

function renderMessages() {
  const list = state.msgTab === 'inbox' ? state.messagesInbox : state.messagesSent;
  const wrap = document.getElementById('messagesList');
  const me = DB.currentProfile().uid;
  if (!list.length) {
    wrap.innerHTML = `<div class="panel"><div class="empty-state"><div class="big">✉️</div>${state.msgTab === 'inbox' ? 'No messages yet.' : "You haven't sent any messages yet."}</div></div>`;
    return;
  }
  wrap.innerHTML = list.map(m => {
    const unread = state.msgTab === 'inbox' && !(m.readBy || []).includes(me) && m.from !== me;
    return `
    <div class="panel message-card ${unread ? 'unread' : ''}" style="margin-bottom:12px;">
      <div class="panel-body pad">
        <div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
          <div>
            <div style="font-weight:600; font-size:14px;">${esc(m.subject)}</div>
            <div class="cell-sub" style="margin-top:2px;">${state.msgTab === 'inbox' ? `From ${esc(m.fromName)}` : `To ${esc(m.toName)}`} · ${timeAgo(m.createdAt)}</div>
          </div>
          <button class="row-actions danger" data-mdel="${m.id}" title="Delete" style="width:30px; height:30px; border-radius:7px; border:1px solid var(--border); display:flex; align-items:center; justify-content:center; color:var(--muted); flex-shrink:0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
        <div style="font-size:13.5px; margin-top:10px; white-space:pre-wrap;">${esc(m.body)}</div>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('button[data-mdel]').forEach(btn => btn.addEventListener('click', () => {
    if (confirm('Delete this message?')) DB.deleteMessage(btn.dataset.mdel);
  }));
}
function markInboxRead() {
  const me = DB.currentProfile().uid;
  state.messagesInbox.filter(m => !(m.readBy || []).includes(me) && m.from !== me).forEach(m => DB.markMessageRead(m.id));
}
function renderUnreadBadge() {
  const me = DB.currentProfile().uid;
  const count = state.messagesInbox.filter(m => !(m.readBy || []).includes(me) && m.from !== me).length;
  const el = document.getElementById('navCountUnread');
  el.textContent = count;
  el.style.display = count ? '' : 'none';
}

/* ============================================================
   ACCOUNTS (admin only)
   ============================================================ */
function bindAccounts() {
  document.getElementById('addAccountBtn').addEventListener('click', () => openAccountModal());
  document.getElementById('accountModalClose').addEventListener('click', closeAccountModal);
  document.getElementById('accountCancelBtn').addEventListener('click', closeAccountModal);
  document.getElementById('accountSaveBtn').addEventListener('click', saveAccountForm);
  document.getElementById('accountModal').addEventListener('click', (e) => { if (e.target.id === 'accountModal') closeAccountModal(); });
}

function openAccountModal(uid = null) {
  document.getElementById('accountForm').reset();
  document.getElementById('accPasswordField').style.display = '';
  document.getElementById('accUsername').disabled = false;
  if (uid) {
    const u = state.users.find(x => x.uid === uid);
    if (!u) return;
    document.getElementById('accountModalTitle').textContent = 'Edit Account';
    document.getElementById('accUid').value = u.uid;
    document.getElementById('accName').value = u.name || '';
    document.getElementById('accUsername').value = u.username;
    document.getElementById('accUsername').disabled = true;
    document.getElementById('accRole').value = u.role;
    document.getElementById('accPasswordField').style.display = 'none';
  } else {
    document.getElementById('accountModalTitle').textContent = 'New Account';
    document.getElementById('accUid').value = '';
  }
  document.getElementById('accountModal').classList.remove('hidden');
}
function closeAccountModal() { document.getElementById('accountModal').classList.add('hidden'); }

async function saveAccountForm() {
  const uid = document.getElementById('accUid').value;
  const name = document.getElementById('accName').value.trim();
  const username = document.getElementById('accUsername').value.trim();
  const password = document.getElementById('accPassword').value;
  const role = document.getElementById('accRole').value;
  if (!name || !username) { showToast('Name and username are required.', 'error'); return; }

  const btn = document.getElementById('accountSaveBtn');
  btn.disabled = true;
  try {
    if (uid) {
      await DB.updateUser(uid, { name, role });
      showToast('Account updated.', 'success');
    } else {
      if (!password || password.length < 6) { showToast('Password must be at least 6 characters.', 'error'); btn.disabled = false; return; }
      await DB.createUser({ name, username, password, role });
      showToast('Account created.', 'success');
    }
    closeAccountModal();
  } catch (e) {
    showToast(e.message || 'Could not save account.', 'error');
  } finally { btn.disabled = false; }
}

function renderAccounts() {
  const body = document.getElementById('accountsTableBody');
  if (!state.users.length) {
    body.innerHTML = `<tr><td colspan="5"><div class="empty-state"><div class="big">👤</div>No accounts yet.</div></td></tr>`;
    return;
  }
  const me = DB.currentProfile().uid;
  body.innerHTML = state.users.map(u => `
    <tr>
      <td class="cell-name">${esc(u.name || u.username)}${u.uid === me ? ' <span class="cell-sub">(you)</span>' : ''}</td>
      <td>${esc(u.username)}</td>
      <td><span class="tag ${u.role === 'admin' ? 'tag-company' : 'tag-other'}">${esc(u.role)}</span></td>
      <td><span class="status-pill status-${u.status === 'active' ? 'active' : 'expired'}">${esc(u.status)}</span></td>
      <td>
        <div class="row-actions">
          <button title="Edit" data-aedit="${u.uid}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
          ${u.uid === me ? '' : `
          <button title="${u.status === 'active' ? 'Disable' : 'Enable'}" data-atoggle="${u.uid}" data-status="${u.status}">
            ${u.status === 'active'
              ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>'
              : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>'}
          </button>
          <button title="Delete" class="danger" data-adel="${u.uid}" data-uname="${esc(u.username)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>`}
        </div>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('button[data-aedit]').forEach(btn => btn.addEventListener('click', () => openAccountModal(btn.dataset.aedit)));
  body.querySelectorAll('button[data-atoggle]').forEach(btn => btn.addEventListener('click', async () => {
    const newStatus = btn.dataset.status === 'active' ? 'disabled' : 'active';
    try { await DB.setUserStatus(btn.dataset.atoggle, newStatus); showToast(`Account ${newStatus}.`, 'success'); }
    catch (e) { showToast(e.message, 'error'); }
  }));
  body.querySelectorAll('button[data-adel]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm(`Delete the account "${btn.dataset.uname}"? This immediately revokes their access to Techwave.`)) return;
    try { await DB.deleteUser(btn.dataset.adel, btn.dataset.uname); showToast('Account deleted.', 'success'); }
    catch (e) { showToast(e.message, 'error'); }
  }));
}

/* ============================================================
   TOPBAR (search, dark mode, quick color, my account)
   ============================================================ */
function bindTopbar() {
  document.getElementById('globalSearch').addEventListener('input', (e) => {
    state.search = e.target.value;
    if (state.view !== 'clients') switchView('clients');
    else renderClients();
  });

  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const newMode = (state.settings.theme.mode === 'dark') ? 'light' : 'dark';
    if (DB.isAdmin()) DB.updateSettings({ theme: { mode: newMode } });
    else applyTheme({ theme: { ...state.settings.theme, mode: newMode } }); // staff can preview locally without saving org-wide
  });

  document.getElementById('colorQuickBtn').addEventListener('click', () => {
    if (!DB.isAdmin()) { showToast('Only an administrator can change the software color.', 'error'); return; }
    renderQuickSwatches();
    document.getElementById('quickColorPicker').value = state.settings.theme.primary;
    document.getElementById('quickColorModal').classList.remove('hidden');
  });
  document.getElementById('quickColorClose').addEventListener('click', () => document.getElementById('quickColorModal').classList.add('hidden'));
  document.getElementById('quickColorModal').addEventListener('click', (e) => { if (e.target.id === 'quickColorModal') document.getElementById('quickColorModal').classList.add('hidden'); });
  document.getElementById('quickColorPicker').addEventListener('input', (e) => DB.updateSettings({ theme: { primary: e.target.value } }));

  document.getElementById('myAccountBtn').addEventListener('click', () => switchView('settings'));
}

/* ============================================================
   MY ACCOUNT (everyone — profile name + self password change)
   ============================================================ */
function bindMyAccount() {
  document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const name = document.getElementById('acctName').value.trim();
    if (!name) { showToast('Name cannot be empty.', 'error'); return; }
    try { await DB.updateUser(DB.currentProfile().uid, { name }); renderShellBranding(); showToast('Profile saved.', 'success'); }
    catch (e) { showToast(e.message, 'error'); }
  });

  document.getElementById('changePasswordBtn').addEventListener('click', async () => {
    const current = document.getElementById('acctCurrentPassword').value;
    const next = document.getElementById('acctNewPassword').value;
    if (!current || !next) { showToast('Enter your current and new password.', 'error'); return; }
    const btn = document.getElementById('changePasswordBtn');
    btn.disabled = true;
    try {
      await DB.changeOwnPassword(current, next);
      document.getElementById('acctCurrentPassword').value = '';
      document.getElementById('acctNewPassword').value = '';
      showToast('Password updated.', 'success');
    } catch (e) {
      showToast(e.code === 'auth/wrong-password' ? 'Current password is incorrect.' : (e.message || 'Could not update password.'), 'error');
    } finally { btn.disabled = false; }
  });

  const p = DB.currentProfile();
  document.getElementById('acctName').value = p.name || '';
  document.getElementById('acctUsername').value = p.username || '';
  document.getElementById('acctRole').value = p.role === 'admin' ? 'Administrator' : 'Reporting Staff';
}

/* ============================================================
   SETTINGS (branding/appearance/login-slider are admin-only)
   ============================================================ */
function bindSettings() {
  document.querySelectorAll('.settings-nav button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('admin-only-pane') && !DB.isAdmin()) return;
      document.querySelectorAll('.settings-nav button').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`pane-${btn.dataset.pane}`).classList.add('active');
    });
  });

  document.getElementById('logoUploadInput').addEventListener('change', (e) => handleImageUpload(e, (dataUrl) => {
    DB.updateSettings({ logo: dataUrl }).then(() => showToast('Logo updated.', 'success')).catch(err => showToast(err.message, 'error'));
  }));
  document.getElementById('removeLogoBtn').addEventListener('click', () => DB.updateSettings({ logo: '' }).then(() => showToast('Logo removed.', 'success')));

  document.getElementById('saveBrandingBtn').addEventListener('click', () => {
    DB.updateSettings({
      companyName: val('setCompanyName'), website: val('setWebsite'), phone: val('setPhone'), email: val('setEmail'),
      address: val('setAddress'), facebook: val('setFacebook'), instagram: val('setInstagram'), whatsapp: val('setWhatsapp'),
      footer: val('setFooter'), mission: val('setMission'), vision: val('setVision'), profile: val('setProfile')
    }).then(() => showToast('Branding saved.', 'success')).catch(err => showToast(err.message, 'error'));
  });

  document.getElementById('lightModeBtn').addEventListener('click', () => DB.updateSettings({ theme: { mode: 'light' } }));
  document.getElementById('darkModeBtn').addEventListener('click', () => DB.updateSettings({ theme: { mode: 'dark' } }));
  document.getElementById('primaryColorPicker').addEventListener('input', (e) => {
    DB.updateSettings({ theme: { primary: e.target.value } });
    renderSwatches('primarySwatches', SWATCHES, e.target.value, (c) => DB.updateSettings({ theme: { primary: c } }));
  });
  document.getElementById('accentColorPicker').addEventListener('input', (e) => {
    DB.updateSettings({ theme: { accent: e.target.value } });
    renderSwatches('accentSwatches', SWATCHES, e.target.value, (c) => DB.updateSettings({ theme: { accent: c } }));
  });

  // login background slider
  document.getElementById('loginBgUploadInput').addEventListener('change', (e) => handleImageUpload(e, async (dataUrl) => {
    const current = state.settings.loginBackgrounds || [];
    try { await DB.updateSettings({ loginBackgrounds: [...current, dataUrl] }); showToast('Image added to the login slider.', 'success'); }
    catch (err) { showToast(err.message, 'error'); }
  }));
  document.getElementById('setSlideSeconds').addEventListener('change', (e) => {
    const seconds = Math.max(2, Number(e.target.value) || 6);
    DB.updateSettings({ loginSlideSeconds: seconds });
  });
}

function loadSettingsIntoForm() {
  const s = state.settings || DB.defaultSettings();
  setVal('setCompanyName', s.companyName); setVal('setWebsite', s.website); setVal('setPhone', s.phone); setVal('setEmail', s.email);
  setVal('setAddress', s.address); setVal('setFacebook', s.facebook); setVal('setInstagram', s.instagram); setVal('setWhatsapp', s.whatsapp);
  setVal('setFooter', s.footer); setVal('setMission', s.mission); setVal('setVision', s.vision); setVal('setProfile', s.profile);

  const logoPrev = document.getElementById('logoPreview');
  logoPrev.innerHTML = s.logo ? `<img src="${s.logo}" alt="logo">` : 'No logo';

  document.getElementById('primaryColorPicker').value = s.theme.primary;
  document.getElementById('accentColorPicker').value = s.theme.accent;
  document.getElementById('setSlideSeconds').value = s.loginSlideSeconds || 6;
  renderSwatches('primarySwatches', SWATCHES, s.theme.primary, (c) => DB.updateSettings({ theme: { primary: c } }));
  renderSwatches('accentSwatches', SWATCHES, s.theme.accent, (c) => DB.updateSettings({ theme: { accent: c } }));
}

function renderLoginSliderGrid() {
  const grid = document.getElementById('loginSliderGrid');
  if (!grid) return;
  const images = (state.settings && state.settings.loginBackgrounds) || [];
  if (!images.length) { grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="big">🖼️</div>No slider images yet — add one above.</div>`; return; }
  grid.innerHTML = images.map((src, i) => `
    <div class="gallery-item">
      <img src="${src}" alt="">
      <button data-slide-i="${i}" title="Remove">✕</button>
    </div>
  `).join('');
  grid.querySelectorAll('button[data-slide-i]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.slideI);
      const updated = images.filter((_, i) => i !== idx);
      DB.updateSettings({ loginBackgrounds: updated });
    });
  });
}

function renderQuickSwatches() {
  renderSwatches('quickSwatches', SWATCHES, state.settings.theme.primary, (color) => {
    DB.updateSettings({ theme: { primary: color } });
    renderQuickSwatches();
  });
}

function renderSwatches(containerId, colors, current, onSelect) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = colors.map(c => `<span class="swatch ${c.toLowerCase() === (current || '').toLowerCase() ? 'selected' : ''}" style="background:${c}" data-color="${c}"></span>`).join('');
  el.querySelectorAll('.swatch').forEach(sw => sw.addEventListener('click', () => onSelect(sw.dataset.color)));
}

/* ============================================================
   UTILITIES
   ============================================================ */
function val(id) { return document.getElementById(id).value; }
function setVal(id, v) { document.getElementById(id).value = v || ''; }
function esc(str) {
  if (str === null || str === undefined || str === '') return '—';
  return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function dateStamp() { return new Date().toISOString().slice(0, 10); }
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function timeAgo(ts) {
  if (!ts) return 'Just now';
  const ms = typeof ts.toMillis === 'function' ? ts.toMillis() : (ts.seconds ? ts.seconds * 1000 : Date.parse(ts));
  if (!ms) return '';
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ms).toLocaleDateString();
}
function isExpiringSoon(dateStr) {
  if (!dateStr) return false;
  const days = (new Date(dateStr) - new Date()) / 86400000;
  return days >= 0 && days <= 30;
}
function handleImageUpload(e, callback) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('Please choose an image file.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = () => callback(reader.result);
  reader.readAsDataURL(file);
  e.target.value = '';
}
