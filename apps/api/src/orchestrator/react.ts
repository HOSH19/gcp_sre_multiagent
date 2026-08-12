import { runReactLoop, type ReactAgentOpts } from "./reactLoop.js";

export type { ReactAgentOpts } from "./reactLoop.js";

export async function runReactAgent(opts: ReactAgentOpts): Promise<{ text: string; toolsCalled: string[] }> {
  return runReactLoop(opts);
}
