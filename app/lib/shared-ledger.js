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
    const fromOwn = Math.min(amount, shares[index]);
    shares[index] -= fromOwn;
    shares[1 - index] -= amount - fromOwn;
  } else if (type === 'expense') {
    const total = shares[0] + shares[1];
    if (amount > total) throw new Error('Insufficient shared balance.');
    // Existing shares absorb expenses in proportion to the money each still has in the pot.
    const first = Math.min(shares[0], Math.round(amount * shares[0] / total));
    shares[0] -= first; shares[1] -= amount - first;
  } else throw new Error('Unknown transaction type.');
  return { ...ledger, shares };
}
