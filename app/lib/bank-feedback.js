// Prepare audio during the submit gesture; play only after the server confirms the entry.
export function prepareBankSound() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    const context = new AudioContextClass();
    if (context.state === 'suspended') context.resume().catch(() => {});
    return context;
  } catch { return null; }
}
export function playBankSound(context, type) {
  if (!context) return;
  try {
    const notes = ({deposit:[880,1320,1760], withdraw:[660,480,320], expense:[660,480,320], 'pay-bill':[660,480,320], bill:[700,950], refresh:[540,720], tap:[540]})[type] || [540];
    const start = context.currentTime;
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      const at = start + index * .065;
      gain.gain.setValueAtTime(.0001, at);
      gain.gain.exponentialRampToValueAtTime(type === 'tap' ? .012 : .045, at + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, at + .16);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(at); oscillator.stop(at + .17);
    });
    window.setTimeout(() => context.close().catch(() => {}), 900);
  } catch { context.close().catch(() => {}); }
}
export function showBankFeedback(root, type, amount) {
  const outgoing = ['withdraw', 'expense', 'pay-bill'].includes(type);
  const messages = {deposit:'Deposit recorded', withdraw:'Withdrawal recorded', expense:'Expense recorded', 'pay-bill':'Payment recorded', bill:'Reminder added', refresh:'Balance refreshed'};
  root.querySelector('.qd-bank-feedback')?.remove();
  const feedback = document.createElement('div');
  feedback.className = `qd-bank-feedback ${outgoing ? 'is-withdraw' : 'is-deposit'}`;
  feedback.setAttribute('role', 'status');
  const formatted = amount != null && Number.isFinite(Number(amount)) && Number(amount) > 0 ? `${outgoing ? '−' : '+'} AED ${Number(amount).toFixed(2)} · ` : '';
  const icon = document.createElement('span');
  icon.className = 'qd-bank-feedback-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = outgoing ? '↗' : type === 'deposit' ? '↙' : '✓';
  const content = document.createElement('span');
  content.className = 'qd-bank-feedback-content';
  const label = document.createElement('strong');
  label.textContent = messages[type] || 'Saved';
  content.append(label);
  if (type !== 'bill' && type !== 'refresh' && formatted) {
    const detail = document.createElement('span');
    detail.textContent = formatted.replace(/ · $/, '');
    content.append(detail);
  }
  feedback.append(icon, content);
  root.querySelector('.qd-bank-top')?.insertAdjacentElement('beforebegin', feedback);
  window.setTimeout(() => feedback.remove(), 3000);
}
