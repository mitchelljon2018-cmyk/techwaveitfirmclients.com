/* ============================================================
   db.js — Techwave Client Management System (TCMS)
   Local data layer, backed by browser Local Storage (see
   js/local-store.js). Fully offline — no account, no server,
   no internet connection required.

   Data lives in this browser only. If you need TCMS to be usable
   from more than one computer, either always use the same browser
   profile on a shared machine, or take regular backups (Settings →
   Export, if you add one) and restore them elsewhere.

   Collections (arrays, each record has an `id`):
     users, clients, reports, notes, activities, messages
   Documents (single objects):
     settings, bootstrap, session
   ============================================================ */

/** Converts our local { seconds } timestamp into milliseconds for sorting. */
function tsMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  return 0;
}

const DB = {

  /* ============================================================
     AUTH
     ============================================================ */
  _profile: null, // cached profile of the signed-in user

  currentProfile() { return this._profile; },
  isAdmin() { return !!this._profile && this._profile.role === 'admin'; },

  async bootstrapStatus() {
    return LocalStore.getDoc('bootstrap', { done: false });
  },

  /** Creates the very first administrator account. Only works while
   *  the bootstrap flag is still false. */
  async createFirstAdmin({ name, username, password }) {
    const uname = username.trim().toLowerCase();
    if (!uname || !password || password.length < 6) {
      throw new Error('Please enter a username and a password of at least 6 characters.');
    }
    const bootstrap = LocalStore.getDoc('bootstrap', { done: false });
    if (bootstrap.done) throw new Error('An administrator account already exists.');

    const salt = makeSalt();
    const profile = {
      uid: newId('user'), username: uname, name: name.trim() || uname,
      role: 'admin', status: 'active',
      createdAt: localTimestamp(), createdBy: null
    };
    LocalStore.addRecord('users', { ...profile, id: profile.uid, passwordHash: hashPassword(password, salt), salt });
    LocalStore.setDoc('bootstrap', { done: true });
    LocalStore.setDoc('settings', DB.defaultSettings());

    this._profile = profile;
    LocalStore.setDoc('session', { uid: profile.uid });
    return profile;
  },

  /** Logs in with a username + password. */
  async login(username, password) {
    const uname = username.trim().toLowerCase();
    if (!uname || !password) throw new Error('Enter your username and password.');
    const user = LocalStore.getCollection('users').find(u => u.username === uname);
    if (!user) throw new Error('Incorrect username or password.');
    if (hashPassword(password, user.salt) !== user.passwordHash) {
      throw new Error('Incorrect username or password.');
    }
    if (user.status !== 'active') {
      throw new Error('This account has been disabled. Please contact your administrator.');
    }
    const { passwordHash, salt, ...profile } = user;
    this._profile = profile;
    LocalStore.setDoc('session', { uid: profile.uid });
    await DB.logActivity(`"${profile.username}" logged in`, 'login');
    return profile;
  },

  async logout() {
    if (this._profile) await DB.logActivity(`"${this._profile.username}" logged out`, 'logout');
    this._profile = null;
    LocalStore.setDoc('session', null);
  },

  /** Called on every page load. Restores the profile for an already
   *  signed-in session, or resolves null if nobody is signed in / the
   *  account was disabled or deleted since the last visit. */
  async waitForSession() {
    const session = LocalStore.getDoc('session', null);
    if (!session || !session.uid) return null;
    const user = LocalStore.getCollection('users').find(u => u.uid === session.uid);
    if (!user || user.status !== 'active') {
      LocalStore.setDoc('session', null);
      return null;
    }
    const { passwordHash, salt, ...profile } = user;
    this._profile = profile;
    return profile;
  },

  /** Self-service password change — every account (admin or staff) can do this for itself. */
  async changeOwnPassword(currentPassword, newPassword) {
    if (!this._profile) throw new Error('You are signed out — please sign in again.');
    if (!newPassword || newPassword.length < 6) throw new Error('New password must be at least 6 characters.');
    const user = LocalStore.getCollection('users').find(u => u.uid === this._profile.uid);
    if (!user || hashPassword(currentPassword, user.salt) !== user.passwordHash) {
      throw new Error('Current password is incorrect.');
    }
    const salt = makeSalt();
    LocalStore.updateRecord('users', user.id, { passwordHash: hashPassword(newPassword, salt), salt });
    await DB.logActivity(`"${this._profile.username}" changed their password`, 'security');
  },

  /* ============================================================
     ACCOUNTS (admin-only management, self-service password above)
     ============================================================ */
  subscribeUsers(callback) {
    const run = () => {
      const list = LocalStore.getCollection('users')
        .map(({ passwordHash, salt, ...rest }) => rest)
        .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
      callback(list);
    };
    run();
    return Bus.on('users', run);
  },

  /** Admin creates a new account. */
  async createUser({ name, username, password, role }) {
    if (!this.isAdmin()) throw new Error('Only an administrator can create accounts.');
    const uname = username.trim().toLowerCase();
    if (!uname || !password || password.length < 6) throw new Error('Username and a 6+ character password are required.');
    if (LocalStore.getCollection('users').some(u => u.username === uname)) {
      throw new Error('That username is already taken.');
    }
    const salt = makeSalt();
    const profile = {
      uid: newId('user'), username: uname, name: name.trim() || uname,
      role: role === 'admin' ? 'admin' : 'staff', status: 'active',
      createdAt: localTimestamp(), createdBy: this._profile.uid
    };
    LocalStore.addRecord('users', { ...profile, id: profile.uid, passwordHash: hashPassword(password, salt), salt });
    await DB.logActivity(`Created account "${uname}" (${profile.role})`, 'account');
    return profile;
  },

  async updateUser(uid, updates) {
    if (!this.isAdmin() && this._profile.uid !== uid) throw new Error('You can only edit your own account.');
    const user = LocalStore.getCollection('users').find(u => u.uid === uid);
    if (!user) throw new Error('Account not found.');
    const payload = {};
    if (updates.name !== undefined) payload.name = updates.name.trim();
    if (this.isAdmin() && updates.role !== undefined) payload.role = updates.role;
    LocalStore.updateRecord('users', user.id, payload);
    if (this._profile.uid === uid) this._profile = { ...this._profile, ...payload };
    await DB.logActivity(`Updated account profile`, 'account');
  },

  async setUserStatus(uid, status) {
    if (!this.isAdmin()) throw new Error('Only an administrator can enable or disable accounts.');
    if (uid === this._profile.uid) throw new Error("You can't disable your own account.");
    const user = LocalStore.getCollection('users').find(u => u.uid === uid);
    if (!user) throw new Error('Account not found.');
    LocalStore.updateRecord('users', user.id, { status });
    await DB.logActivity(`${status === 'active' ? 'Enabled' : 'Disabled'} an account`, 'account');
  },

  /** Removes the account's access to Techwave. */
  async deleteUser(uid, username) {
    if (!this.isAdmin()) throw new Error('Only an administrator can delete accounts.');
    if (uid === this._profile.uid) throw new Error("You can't delete your own account.");
    const user = LocalStore.getCollection('users').find(u => u.uid === uid);
    if (user) LocalStore.deleteRecord('users', user.id);
    await DB.logActivity(`Deleted account "${username || uid}"`, 'account');
  },

  /* ============================================================
     CLIENTS (institution registry — shared across the whole team)
     ============================================================ */
  subscribeClients(callback) {
    const run = () => {
      const list = LocalStore.getCollection('clients').sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
      callback(list);
    };
    run();
    return Bus.on('clients', run);
  },
  async addClient(client) {
    const record = { ...client, id: newId('client'), createdAt: localTimestamp(), createdBy: this._profile.uid, createdByName: this._profile.username };
    LocalStore.addRecord('clients', record);
    await DB.logActivity(`Added client "${client.clientName}"`, 'add');
    return record.id;
  },
  async updateClient(id, updates) {
    LocalStore.updateRecord('clients', id, { ...updates, updatedAt: localTimestamp() });
    await DB.logActivity(`Updated client "${updates.clientName || ''}"`, 'edit');
  },
  async deleteClient(id, name) {
    LocalStore.deleteRecord('clients', id);
    await DB.logActivity(`Deleted client "${name || ''}"`, 'delete');
  },

  /* ============================================================
     ENGAGEMENT REPORTS — private to the author; admin sees every report.
     ============================================================ */
  subscribeReports(callback) {
    const uid = this._profile.uid;
    const run = () => {
      let list = LocalStore.getCollection('reports');
      if (!this.isAdmin()) list = list.filter(r => r.createdBy === uid);
      list.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
      callback(list);
    };
    run();
    return Bus.on('reports', run);
  },
  async addReport(report) {
    const record = { ...report, id: newId('report'), createdAt: localTimestamp(), createdBy: this._profile.uid, createdByName: this._profile.username };
    LocalStore.addRecord('reports', record);
    await DB.logActivity(`Filed an engagement report for "${report.clientName}"`, 'report');
  },
  async updateReport(id, updates) {
    LocalStore.updateRecord('reports', id, { ...updates, updatedAt: localTimestamp() });
    await DB.logActivity(`Updated an engagement report`, 'report');
  },
  async deleteReport(id) {
    LocalStore.deleteRecord('reports', id);
    await DB.logActivity(`Deleted an engagement report`, 'delete');
  },

  /* ============================================================
     NOTES & DOCUMENTS (shared org-wide, like the client registry)
     ============================================================ */
  subscribeNotes(callback) {
    const run = () => {
      const list = LocalStore.getCollection('notes').sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
      callback(list);
    };
    run();
    return Bus.on('notes', run);
  },
  async addNote(note) {
    const record = { ...note, id: newId('note'), createdAt: localTimestamp(), createdBy: this._profile.uid, createdByName: this._profile.username };
    LocalStore.addRecord('notes', record);
    await DB.logActivity(`Added a note${note.clientName ? ' for "' + note.clientName + '"' : ''}`, 'note');
  },
  async deleteNote(id) {
    LocalStore.deleteRecord('notes', id);
  },

  /* ============================================================
     ACTIVITY LOG — everyone sees their own actions; admin sees all.
     ============================================================ */
  async logActivity(message, type = 'info') {
    if (!this._profile) return;
    try {
      LocalStore.addRecord('activities', {
        id: newId('activity'), message, type,
        userId: this._profile.uid,
        username: this._profile.username,
        time: localTimestamp()
      });
    } catch (e) { /* non-fatal */ }
  },
  subscribeActivities(callback, max = 300) {
    const uid = this._profile.uid;
    const run = () => {
      let list = LocalStore.getCollection('activities');
      if (!this.isAdmin()) list = list.filter(a => a.userId === uid);
      list.sort((a, b) => tsMillis(b.time) - tsMillis(a.time));
      callback(list.slice(0, max));
    };
    run();
    return Bus.on('activities', run);
  },

  /* ============================================================
     MESSAGES — send to one account or broadcast to everyone.
     ============================================================ */
  subscribeInbox(callback) {
    const uid = this._profile.uid;
    const run = () => {
      const list = LocalStore.getCollection('messages')
        .filter(m => m.to === uid || m.to === 'all')
        .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
      callback(list);
    };
    run();
    return Bus.on('messages', run);
  },
  subscribeSent(callback) {
    const uid = this._profile.uid;
    const run = () => {
      const list = LocalStore.getCollection('messages')
        .filter(m => m.from === uid)
        .sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
      callback(list);
    };
    run();
    return Bus.on('messages', run);
  },
  async sendMessage({ to, toName, subject, body }) {
    LocalStore.addRecord('messages', {
      id: newId('message'),
      to, toName: toName || (to === 'all' ? 'All Accounts' : ''),
      from: this._profile.uid, fromName: this._profile.username,
      subject: subject.trim(), body: body.trim(),
      readBy: [],
      createdAt: localTimestamp()
    });
    await DB.logActivity(`Sent a message to ${to === 'all' ? 'all accounts' : (toName || 'an account')}`, 'message');
  },
  async markMessageRead(id) {
    const uid = this._profile.uid;
    const msg = LocalStore.getCollection('messages').find(m => m.id === id);
    if (!msg) return;
    const readBy = Array.from(new Set([...(msg.readBy || []), uid]));
    LocalStore.updateRecord('messages', id, { readBy });
  },
  async deleteMessage(id) {
    LocalStore.deleteRecord('messages', id);
  },

  /* ============================================================
     SETTINGS — branding, theme, login background slider.
     Anyone signed in can read; only admin can write.
     ============================================================ */
  defaultSettings() {
    return {
      companyName: 'Techwave IT Firm',
      logo: '',
      address: '', phone: '', email: '', website: '',
      facebook: '', instagram: '', whatsapp: '',
      mission: '', vision: '', profile: '',
      footer: 'Techwave IT Firm — Client Management System',
      loginBackgrounds: [],       // array of image data-URLs for the login slider
      loginSlideSeconds: 6,
      theme: { mode: 'light', primary: '#4F46E5', accent: '#14B8A6' }
    };
  },
  async getSettings() {
    const defaults = this.defaultSettings();
    const saved = LocalStore.getDoc('settings', null);
    if (!saved) return defaults;
    return { ...defaults, ...saved, theme: { ...defaults.theme, ...(saved.theme || {}) } };
  },
  subscribeSettings(callback) {
    const run = () => {
      const defaults = this.defaultSettings();
      const saved = LocalStore.getDoc('settings', {});
      callback({ ...defaults, ...saved, theme: { ...defaults.theme, ...(saved.theme || {}) } });
    };
    run();
    return Bus.on('doc_settings', run);
  },
  async updateSettings(updates) {
    if (!this.isAdmin()) throw new Error('Only an administrator can change these settings.');
    const current = await this.getSettings();
    const payload = { ...current, ...updates };
    if (updates.theme) payload.theme = { ...current.theme, ...updates.theme };
    LocalStore.setDoc('settings', payload);
  },

  /* ---------- misc ---------- */
  newId(prefix = 'id') { return newId(prefix); }
};
