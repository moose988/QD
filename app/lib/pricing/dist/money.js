export const FX = Object.freeze({
    USD: 3.6725,
    EUR: 4.235,
    GBP: 4.918,
    INR: 0.03835
});
export function roundFils(value) {
    assertFinite(value, 'fils');
    return (Math.sign(value) * Math.round(Math.abs(value)));
}
export function AED(value) {
    assertFinite(value, 'AED');
    return roundFils(value * 100);
}
export function toAED(value) {
    return value / 100;
}
export function fromFils(value) {
    if (!Number.isInteger(value))
        throw new TypeError(`Expected integer fils, got ${value}`);
    return value;
}
export function addFils(values) {
    return fromFils(values.reduce((sum, value) => sum + value, 0));
}
export function pct(base, percent) {
    assertFinite(percent, 'percent');
    return roundFils((base * percent) / 100);
}
export function displayAED(value, mode = 'exact') {
    const aed = toAED(value);
    if (mode === 'exact')
        return aed;
    if (mode === 'rack50')
        return Math.round(aed / 50) * 50;
    return Math.round(aed);
}
export function toAEDfromFX(amount, currency) {
    assertFinite(amount, 'FX amount');
    return AED(amount * FX[currency]);
}
function assertFinite(value, label) {
    if (!Number.isFinite(value))
        throw new TypeError(`Expected finite ${label}, got ${value}`);
}
