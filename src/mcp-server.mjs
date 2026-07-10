#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import readline from 'node:readline';
import {
  executeTask,
  estimateTask,
  planTask,
  RouterAdapterError,
  RouterConfigError,
  RouterInputError
} from './router.mjs';

const packageVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

function booleanEnv(name) {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

const exposeExecuteTool = booleanEnv('MODEL_ROUTER_EXPOSE_EXECUTE_TOOL');

const baseTools = [
  {
    name: 'estimate_task',
    description: 'Deterministic safety/cost estimate only. This tool does not call Sol; use plan_task for actual Sol judgment.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', minLength: 1, maxLength: 12000 },
        requested_mode: { type: 'string', enum: ['auto', 'cheap', 'normal', 'deep', 'critical'] },
        requested_model: { type: 'string', enum: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'openai/gpt-5.6-luna', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-sol'] },
        max_cost_usd: { type: 'number', minimum: 0, maximum: 1000 },
        allow_external_actions: { type: 'boolean' },
        data_class: { type: 'string', enum: ['internal_normal', 'secret', 'credential', 'personal_sensitive', 'production'] }
      },
      required: ['task'],
      additionalProperties: false
    }
  },
  {
    name: 'plan_task',
    description: 'Call GPT-5.6 Sol through the OpenClaw Gateway and Codex auth profile, then apply server safety gates. No direct provider fallback is allowed.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', minLength: 1, maxLength: 12000 },
        max_cost_usd: { type: 'number', minimum: 0, maximum: 1000 },
        allow_external_actions: { type: 'boolean' },
        data_class: { type: 'string', enum: ['internal_normal', 'secret', 'credential', 'personal_sensitive', 'production'] }
      },
      required: ['task'],
      additionalProperties: false
    }
  }
];

const executeTool = {
  name: 'execute_task',
  description: 'Phase 2 execution wrapper entrypoint. Hidden by default until execution-layer QC; only server-owned config can expose and enable it.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', minLength: 1, maxLength: 12000 },
      max_cost_usd: { type: 'number', minimum: 0, maximum: 1000 },
      allow_external_actions: { type: 'boolean' },
      data_class: { type: 'string', enum: ['internal_normal', 'secret', 'credential', 'personal_sensitive', 'production'] }
    },
    required: ['task'],
    additionalProperties: false
  }
};

const tools = exposeExecuteTool ? [...baseTools, executeTool] : baseTools;

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, payload) {
  send({ jsonrpc: '2.0', id, result: payload });
}

function error(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

async function handle(request) {
  if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
    error(request?.id ?? null, -32600, 'Invalid Request');
    return;
  }
  const { id, method, params } = request;

  if (method === 'initialize') {
    result(id, {
      protocolVersion: '2025-06-18',
      serverInfo: {
        name: 'openclaw-model-router',
        version: packageVersion
      },
      capabilities: {
        tools: {}
      }
    });
    return;
  }

  if (method === 'tools/list') {
    result(id, { tools });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};
    if (!['estimate_task', 'plan_task'].includes(toolName) && !(exposeExecuteTool && toolName === 'execute_task')) {
      error(id, -32601, `Unknown or disabled tool: ${toolName}`);
      return;
    }
    const input = toolName === 'estimate_task'
      ? {
          requested_mode: 'auto',
          max_cost_usd: 0.5,
          allow_external_actions: false,
          data_class: 'internal_normal',
          ...args,
          requested_by: 'mcp_client'
        }
      : {
          max_cost_usd: 0.5,
          allow_external_actions: false,
          data_class: 'internal_normal',
          ...args,
          requested_by: 'mcp_client'
        };
    let output;
    try {
      if (toolName === 'plan_task') output = await planTask(input);
      else if (toolName === 'execute_task') output = await executeTask(input);
      else output = estimateTask(input);
    } catch (err) {
      if (err instanceof RouterInputError) {
        error(id, -32602, `${err.code}: ${err.message}`);
        return;
      }
      if (err instanceof RouterConfigError) {
        error(id, -32002, `${err.code}: ${err.message}`);
        return;
      }
      if (err instanceof RouterAdapterError) {
        error(id, -32001, `${err.code}: ${err.message}`);
        return;
      }
      error(id, -32603, 'Internal router error');
      return;
    }
    result(id, {
      content: [
        {
          type: 'text',
          text: JSON.stringify(output, null, 2)
        }
      ],
      structuredContent: output
    });
    return;
  }

  if (method === 'notifications/initialized') return;
  error(id, -32601, `Unknown method: ${method}`);
}

const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
  if (!line.trim()) continue;
  try {
    await handle(JSON.parse(line));
  } catch (err) {
    error(null, -32700, `Parse error: ${err.message}`);
  }
}
