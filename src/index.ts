import type { Plugin } from "@opencode-ai/plugin"
import { createPTCTools } from "./ptc-tool"

export const PTCPlugin: Plugin = async (input) => {
  const tools = createPTCTools(input)

  return {
    tool: tools,
  }
}

export default PTCPlugin

export type { PTCContext, PTCExecutionResult, PTCTool, PTCAgent, PTCSkill } from "./types"
