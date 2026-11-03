export const PARTNERS = ['mohammedqudaih107@gmail.com', 'mdaya0089@gmail.com'];
export function changeLedger(ledger, { type, amount, actor, allowOverShare = false }) {
  const shares = [...(ledger.shares || [0, 0])];
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Enter a valid positive amount.');
  if (type === 'deposit') { shares[0] += Math.ceil(amount / 2); shares[1] += Math.floor(amount / 2); }
  else if (type === 'withdraw') {
    const index = PARTNERS.indexOf(actor);
    if (index < 0) throw new Error('Unknown partner.');
    if (amount > shares[index] && !allowOverShare) throw new Error('Withdrawal exceeds your available share.');
    if (amount > shares[0] + shares[1]) throw new Error('Withdrawal exceeds the total shared balance.');
    const fromOwn = Math.min(amount, Math.max(0, shares[index]));
    shares[index] -= fromOwn;
    shares[1 - index] -= amount - fromOwn;
  } else if (type === 'expense') {
    // Spend available shares proportionally, then split any shortfall equally.
    const available = shares.map(value => Math.max(0, value));
    const total = available[0] + available[1];
    const covered = Math.min(amount, total);
    const first = total ? Math.min(available[0], Math.round(covered * available[0] / total)) : 0;
    shares[0] -= first; shares[1] -= covered - first;
    const shortfall = amount - covered;
    shares[0] -= Math.ceil(shortfall / 2); shares[1] -= Math.floor(shortfall / 2);
  } else throw new Error('Unknown transaction type.');
  return { ...ledger, shares };
}
