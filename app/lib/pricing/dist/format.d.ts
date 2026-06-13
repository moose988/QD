import type { PricingResult } from './engine.js';
export declare function formatEstimateText(estimate: Record<string, any>, { businessName }?: {
    businessName?: string | undefined;
}): string;
export declare function threeLineClientView(result: PricingResult): readonly string[];
