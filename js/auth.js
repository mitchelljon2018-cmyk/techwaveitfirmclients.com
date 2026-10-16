/* ============================================================
   auth.js — login page behaviour + shared helpers
   (the theme/toast helpers at the top are also used by app.html)
   ============================================================ */

function showToast(message, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function applyTheme(settings) {
  const root = document.documentElement;
  const theme = (settings && settings.theme) || {};
  if (theme.primary) {
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--primary-dark', shadeColor(theme.primary, -12));
    root.style.setProperty('--primary-light', hexToTint(theme.primary));
  }
  if (theme.accent) root.style.setProperty('--accent', theme.accent);
  document.body.classList.toggle('dark', theme.mode === 'dark');
}
function shadeColor(hex, percent) {
  try {
    let [r, g, b] = hexToRgb(hex);
    r = Math.min(255, Math.max(0, Math.round(r + (percent / 100) * 255)));
    g = Math.min(255, Math.max(0, Math.round(g + (percent / 100) * 255)));
    b = Math.min(255, Math.max(0, Math.round(b + (percent / 100) * 255)));
    return rgbToHex(r, g, b);
  } catch (e) { return hex; }
}
function hexToTint(hex) {
  try {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, 0.12)`;
  } catch (e) { return '#EEF2FF'; }
}
function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const num = parseInt(hex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/* ---------- login page background slider ---------- */
let _sliderTimer = null;
function startLoginSlider(images, seconds) {
  const visual = document.getElementById('loginVisual');
  const dotsWrap = document.getElementById('sliderDots');
  if (_sliderTimer) clearInterval(_sliderTimer);

  if (!images || !images.length) {
    visual.style.backgroundImage = '';
    dotsWrap.innerHTML = '';
    return;
  }
  let i = 0;
  const show = (idx) => {
    visual.style.backgroundImage = `url(${images[idx]})`;
    dotsWrap.querySelectorAll('.dot').forEach((d, di) => d.classList.toggle('active', di === idx));
  };
  dotsWrap.innerHTML = images.map((_, di) => `<span class="dot" data-i="${di}"></span>`).join('');
  dotsWrap.querySelectorAll('.dot').forEach(dot => {
    dot.addEventListener('click', () => { i = Number(dot.dataset.i); show(i); resetTimer(); });
  });
  function resetTimer() {
    if (_sliderTimer) clearInterval(_sliderTimer);
    if (images.length > 1) {
      _sliderTimer = setInterval(() => { i = (i + 1) % images.length; show(i); }, Math.max(2, seconds || 6) * 1000);
    }
  }
  show(0);
  resetTimer();
}

/* ---------- login page boot ---------- */
async function initLoginPage() {
  if (!document.getElementById('loginForm')) return; // only run on index.html

  document.getElementById('loginBox').classList.add('hidden');
  document.getElementById('setupBox').classList.add('hidden');
  document.getElementById('loadingBox').classList.remove('hidden');

  // Warn (without blocking) if this page was opened directly as a file
  // instead of through a web server — data won't be saved between visits.
  if (typeof LocalStore !== 'undefined' && !LocalStore.isPersistent()) {
    showToast('Your browser is blocking saved data on this page — open this app through a local web server (e.g. XAMPP) so your data is kept between visits.', 'error');
  }

  try {
    // branding + login background slider (readable by anyone, even signed out)
    try {
      const settings = await DB.getSettings();
      applyTheme(settings);
      document.getElementById('loginCompanyName').textContent = settings.companyName || 'Techwave IT Firm';
      const mark = document.getElementById('loginLogoMark');
      if (settings.logo) mark.innerHTML = `<img src="${settings.logo}" alt="logo">`;
      else mark.textContent = (settings.companyName || 'T').trim().charAt(0).toUpperCase();
      startLoginSlider(settings.loginBackgrounds, settings.loginSlideSeconds);
    } catch (e) { /* settings may not exist before bootstrap — fine */ }

    // already signed in? skip straight to the app
    const existingProfile = await DB.waitForSession();
    if (existingProfile) {
      window.location.href = 'app.html';
      return;
    }

    // first run: no admin account exists yet
    const bootstrap = await DB.bootstrapStatus();
    document.getElementById('loadingBox').classList.add('hidden');
    if (!bootstrap.done) {
      document.getElementById('setupBox').classList.remove('hidden');
    } else {
      document.getElementById('loginBox').classList.remove('hidden');
    }
  } catch (e) {
    // Whatever went wrong, never leave the person staring at "Loading…"
    // forever with no explanation.
    document.getElementById('loadingBox').classList.add('hidden');
    document.getElementById('setupBox').classList.remove('hidden');
    document.getElementById('setupError').textContent =
      'Something went wrong starting the app: ' + (e && e.message ? e.message : e) +
      '. Try opening this app through a local web server (e.g. XAMPP) instead of double-clicking the file, then reload this page.';
    document.getElementById('setupError').style.display = 'block';
    console.error('TCMS failed to start:', e);
  }

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginSubmitBtn');
    const errorBox = document.getElementById('loginError');
    errorBox.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
      await DB.login(document.getElementById('username').value, document.getElementById('password').value);
      window.location.href = 'app.html';
    } catch (err) {
      errorBox.textContent = err.message || 'Incorrect username or password.';
      errorBox.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  });

  document.getElementById('setupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('setupSubmitBtn');
    const errorBox = document.getElementById('setupError');
    errorBox.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Creating account…';
    try {
      await DB.createFirstAdmin({
        name: document.getElementById('setupName').value,
        username: document.getElementById('setupUsername').value,
        password: document.getElementById('setupPassword').value
      });
      window.location.href = 'app.html';
    } catch (err) {
      errorBox.textContent = err.message || 'Could not create the account. Please try again.';
      errorBox.style.display = 'block';
      btn.disabled = false; btn.textContent = 'Create administrator account';
    }
  });
}

document.addEventListener('DOMContentLoaded', initLoginPage);
