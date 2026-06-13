export type Fils = number & {
    readonly __brand: 'Fils';
};
export type DisplayMode = 'exact' | 'aed' | 'rack50';
export type FxCurrency = keyof typeof FX;
export declare const FX: Readonly<{
    USD: 3.6725;
    EUR: 4.235;
    GBP: 4.918;
    INR: 0.03835;
}>;
export declare function roundFils(value: number): Fils;
export declare function AED(value: number): Fils;
export declare function toAED(value: Fils): number;
export declare function fromFils(value: number): Fils;
export declare function addFils(values: readonly Fils[]): Fils;
export declare function pct(base: Fils, percent: number): Fils;
export declare function displayAED(value: Fils, mode?: DisplayMode): number;
export declare function toAEDfromFX(amount: number, currency: FxCurrency): Fils;
