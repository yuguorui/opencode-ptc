import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import type { PluginInput } from "@opencode-ai/plugin"
import {
  fetchAvailableTools,
  fetchAvailableAgents,
  fetchAvailableSkills,
  generateFunctionSignatures,
  resolveDefaultModel,
} from "./generators"
import { createExecutor } from "./runtime"
import type { PTCContext } from "./types"

export function createPTCTools(input: PluginInput): Record<string, ToolDefinition> {
  const { client, directory } = input

  const ptcExecute = tool({
    description: `Execute JavaScript code that can call available tools, agents, and skills programmatically.

This tool allows you to write async JavaScript code that orchestrates multiple tool calls, agents, and skills in a single execution. All functions are async and return Promise<string>.

AVAILABLE GLOBALS:
- tools: Object containing all available tools as async functions
- agents: Object containing all available agents as async functions
- skills: Object containing all available skills as async functions
- log(...args): Function to log messages (captured in output)
- context: { sessionID, messageID } - current session context

EXAMPLE USAGE:
\`\`\`javascript
// Read a file and search for patterns
const content = await tools.read({ filePath: "/path/to/file.ts" });
log("File content length:", content.length);

// Run grep to find matches
const matches = await tools.grep({ pattern: "TODO", path: "." });

// Delegate to an agent
const result = await agents.explore("Find all API endpoints in the codebase");

// Return a value (will be included in output)
return { filesFound: matches.split("\\n").length };
\`\`\`

The code runs in a sandboxed async context. Use 'return' to provide a final result.`,
    args: {
      code: tool.schema.string().describe("JavaScript code to execute. Must be valid async JavaScript."),
      listAvailable: tool.schema.boolean().optional().describe("If true, returns list of available tools/agents/skills instead of executing code"),
    },
    async execute(args, ctx) {
      const { providerID, modelID } = await resolveDefaultModel(client)

      if (args.listAvailable) {
        const [tools, agents, skills] = await Promise.all([
          fetchAvailableTools(client, providerID, modelID),
          fetchAvailableAgents(client),
          fetchAvailableSkills(client),
        ])
        return generateFunctionSignatures(tools, agents, skills)
      }

      const [tools, agents, skills] = await Promise.all([
        fetchAvailableTools(client, providerID, modelID),
        fetchAvailableAgents(client),
        fetchAvailableSkills(client),
      ])

      const ptcContext: PTCContext = {
        sessionID: ctx.sessionID,
        messageID: ctx.messageID,
        providerID,
        agent: ctx.agent,
        client,
      }

      const executor = createExecutor(client, tools, agents, skills)
      const result = await executor.execute(args.code, ptcContext)

      const output: string[] = []

      if (result.logs.length > 0) {
        output.push("=== Logs ===")
        output.push(...result.logs)
        output.push("")
      }

      if (result.toolCalls.length > 0) {
        output.push("=== Tool Calls ===")
        for (const call of result.toolCalls) {
          const status = call.error ? `ERROR: ${call.error}` : "OK"
          output.push(`- ${call.tool}(${JSON.stringify(call.args)}) [${call.duration}ms] ${status}`)
        }
        output.push("")
      }

      if (result.success) {
        output.push("=== Result ===")
        output.push(result.result !== undefined ? JSON.stringify(result.result, null, 2) : "(no return value)")
      } else {
        output.push("=== Error ===")
        output.push(result.error ?? "Unknown error")
      }

      return output.join("\n")
    },
  })

  const ptcList = tool({
    description: `List all available tools, agents, and skills that can be called via ptc_execute.
Returns TypeScript-style function signatures showing the available functions and their parameters.`,
    args: {},
    async execute() {
      const { providerID, modelID } = await resolveDefaultModel(client)
      const [tools, agents, skills] = await Promise.all([
        fetchAvailableTools(client, providerID, modelID),
        fetchAvailableAgents(client),
        fetchAvailableSkills(client),
      ])
      return generateFunctionSignatures(tools, agents, skills)
    },
  })

  return {
    ptc_execute: ptcExecute,
    ptc_list: ptcList,
  }
}
