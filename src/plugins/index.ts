import type { ScraperPlugin } from "./types";
import { yad2Plugin } from "./yad2/yad2.plugin";

export const plugins: ScraperPlugin[] = [yad2Plugin];
export const DEFAULT_PLUGIN_ID = plugins[0].id;

export type { ScraperPlugin, PluginFlow, FlowAction } from "./types";
