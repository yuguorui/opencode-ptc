import type { createOpencodeClient } from "@opencode-ai/sdk"
import type {
  PTCTool,
  PTCAgent,
  PTCSkill,
  PTCRuntime,
  PTCContext,
  PTCExecutionResult,
  PTCToolCallRecord,
  PTCExecutorOptions,
  PTCToolFunction,
  PTCAgentFunction,
  PTCSkillFunction,
} from "./types"
import {
  createToolFunction,
  createAgentFunction,
  createSkillFunction,
} from "./generators"

type OpencodeClient = ReturnType<typeof createOpencodeClient>

const DEFAULT_TIMEOUT = 300000
const DEFAULT_MAX_TOOL_CALLS = 100

export class PTCExecutor {
  private client: OpencodeClient
  private tools: PTCTool[]
  private agents: PTCAgent[]
  private skills: PTCSkill[]
  private options: Required<PTCExecutorOptions>

  constructor(
    client: OpencodeClient,
    tools: PTCTool[],
    agents: PTCAgent[],
    skills: PTCSkill[],
    options: PTCExecutorOptions = {},
  ) {
    this.client = client
    this.tools = tools
    this.agents = agents
    this.skills = skills
    this.options = {
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
      maxToolCalls: options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS,
    }
  }

  async execute(
    code: string,
    context: PTCContext,
  ): Promise<PTCExecutionResult> {
    const logs: string[] = []
    const callRecords: PTCToolCallRecord[] = []

    const toolFunctions: Record<string, PTCToolFunction> = {}
    for (const tool of this.tools) {
      const safeName = this.sanitizeName(tool.name)
      toolFunctions[safeName] = createToolFunction(
        this.client,
        tool,
        context,
        callRecords,
      )
    }

    const agentFunctions: Record<string, PTCAgentFunction> = {}
    for (const agent of this.agents) {
      const safeName = this.sanitizeName(agent.name)
      agentFunctions[safeName] = createAgentFunction(
        this.client,
        agent,
        context,
        callRecords,
      )
    }

    const skillFunctions: Record<string, PTCSkillFunction> = {}
    for (const skill of this.skills) {
      const safeName = this.sanitizeName(skill.name)
      skillFunctions[safeName] = createSkillFunction(
        this.client,
        skill,
        context,
        callRecords,
      )
    }

    const runtime: PTCRuntime = {
      tools: toolFunctions,
      agents: agentFunctions,
      skills: skillFunctions,
      log: (...args: unknown[]) => {
        logs.push(args.map(arg =>
          typeof arg === "string" ? arg : JSON.stringify(arg)
        ).join(" "))
      },
      context,
    }

    try {
      const result = await this.executeWithTimeout(code, runtime)
      return {
        success: true,
        result,
        logs,
        toolCalls: callRecords,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        logs,
        toolCalls: callRecords,
      }
    }
  }

  private async executeWithTimeout(
    code: string,
    runtime: PTCRuntime,
  ): Promise<unknown> {
    const wrappedCode = this.wrapCode(code)

    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor
    const fn = new AsyncFunction(
      "tools",
      "agents",
      "skills",
      "log",
      "context",
      wrappedCode,
    )

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Execution timed out after ${this.options.timeout}ms`))
      }, this.options.timeout)
    })

    const executionPromise = fn(
      runtime.tools,
      runtime.agents,
      runtime.skills,
      runtime.log,
      runtime.context,
    )

    return Promise.race([executionPromise, timeoutPromise])
  }

  private wrapCode(code: string): string {
    return `
      "use strict";
      ${code}
    `
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, "_")
  }
}

export function createExecutor(
  client: OpencodeClient,
  tools: PTCTool[],
  agents: PTCAgent[],
  skills: PTCSkill[],
  options?: PTCExecutorOptions,
): PTCExecutor {
  return new PTCExecutor(client, tools, agents, skills, options)
}
