#!/usr/bin/env node
import { executeTask, estimateTask, planTask, RouterAdapterError, RouterConfigError, RouterInputError } from './router.mjs';

function usage() {
  console.error('Usage: node src/cli.mjs estimate "<task>" [--mode cheap|normal|deep|critical] [--model gpt-5.6-luna|gpt-5.6-terra|gpt-5.6-sol] [--max-cost 0.5]');
  console.error('       node src/cli.mjs plan|execute "<task>" [--max-cost 0.5] [--allow-external-actions]');
  console.error('plan uses the OpenClaw Gateway and an existing Codex auth profile; set MODEL_ROUTER_OPENCLAW_AGENT.');
  console.error('execute is disabled by default and cannot be enabled by CLI input alone.');
}

const [, , command, ...args] = process.argv;

if (!['estimate', 'plan', 'execute'].includes(command)) {
  usage();
  process.exit(command ? 1 : 0);
}

const taskParts = [];
let requestedMode = 'auto';
let requestedModel = null;
let maxCostUsd = 0.5;
let allowExternalActions = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--mode') {
    requestedMode = args[i + 1] || 'auto';
    i += 1;
  } else if (arg === '--model') {
    requestedModel = args[i + 1] || null;
    i += 1;
  } else if (arg === '--max-cost') {
    maxCostUsd = Number(args[i + 1]);
    i += 1;
  } else if (arg === '--allow-external-actions') {
    allowExternalActions = true;
  } else {
    taskParts.push(arg);
  }
}

const task = taskParts.join(' ').trim();
if (!task) {
  usage();
  process.exit(1);
}

const basePayload = {
  task,
  max_cost_usd: Number.isFinite(maxCostUsd) ? maxCostUsd : 0.5,
  allow_external_actions: allowExternalActions,
  data_class: 'internal_normal',
  requested_by: process.env.USER || 'local_cli'
};
const payload = command === 'estimate'
  ? { ...basePayload, requested_mode: requestedMode, requested_model: requestedModel }
  : basePayload;

try {
  let result;
  if (command === 'plan') result = await planTask(payload);
  else if (command === 'execute') result = await executeTask(payload);
  else result = estimateTask(payload);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const known = error instanceof RouterInputError
    || error instanceof RouterConfigError
    || error instanceof RouterAdapterError;
  console.error(JSON.stringify({
    status: 'error',
    error: known ? error.code : 'router_failed',
    message: known ? error.message : 'Router failed'
  }));
  process.exit(1);
}
