import type { DiscoveredService } from "./types.js";
export declare function discoverFromCompose(composeFilePath: string): Promise<DiscoveredService[]>;
export declare function parseServicesList(input: string): DiscoveredService[];
