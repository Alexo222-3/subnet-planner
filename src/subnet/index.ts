// The public face of the subnet logic. The UI should import from here only.
export { planNetwork } from "./planner";
export { calculateSubnet, describeSubnet } from "./calculator";
export type { CalculatorResult } from "./calculator";
export { DEFAULT_BUFFER_PERCENT, requiredAddresses, roundUpToBlockSize, prefixForBlockSize } from "./sizing";
export { formatIPv4, parseIPv4 } from "./ip";
export { planToCsv } from "./csv";
export { growthAddresses, planToMarkdown, planToText, planToHtml } from "./format";
export { encodePlan, decodePlan } from "./share";
export { serializePlan, parseSavedPlan } from "./persistence";
export type { LoadResult, SavedPlan } from "./persistence";
export type * from "./types";
