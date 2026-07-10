import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const packageVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;

const cli = spawnSync(process.execPath, ['src/cli.mjs', 'estimate', '短い要約'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
  env: { ...process.env, MODEL_ROUTER_LOG_MODE: 'off' }
});
assert.equal(cli.status, 0, cli.stderr);
assert.equal(JSON.parse(cli.stdout).arbiter_executed, false);

const planCli = spawnSync(
  process.execPath,
  ['src/cli.mjs', 'plan', '短い安全な箇条書きを整形して', '--max-cost', '0.01'],
  {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      MODEL_ROUTER_OPENCLAW_AGENT: '',
      MODEL_ROUTER_LOG_MODE: 'off'
    }
  }
);
assert.equal(planCli.status, 1, planCli.stdout);
const planCliError = JSON.parse(planCli.stderr);
assert.equal(planCliError.error, 'openclaw_agent_not_configured');
assert.doesNotMatch(planCliError.message, /unknown_input_fields/);

const executeCli = spawnSync(process.execPath, ['src/cli.mjs', 'execute', '短い要約'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
  env: { ...process.env, MODEL_ROUTER_LOG_MODE: 'off' }
});
assert.equal(executeCli.status, 0, executeCli.stderr);
const executeCliOutput = JSON.parse(executeCli.stdout);
assert.equal(executeCliOutput.status, 'execution_disabled');
assert.equal(executeCliOutput.provider_call_count, 0);

const executeCliWithPlanningFlags = spawnSync(
  process.execPath,
  ['src/cli.mjs', 'execute', '--mode', 'deep', '--model', 'gpt-5.6-sol', '短い要約'],
  {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: { ...process.env, MODEL_ROUTER_LOG_MODE: 'off' }
  }
);
assert.equal(executeCliWithPlanningFlags.status, 0, executeCliWithPlanningFlags.stderr);
const executeCliWithPlanningFlagsOutput = JSON.parse(executeCliWithPlanningFlags.stdout);
assert.equal(executeCliWithPlanningFlagsOutput.status, 'execution_disabled');
assert.equal(executeCliWithPlanningFlagsOutput.provider_call_count, 0);

const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'estimate_task', arguments: { task: '短い要約' } }
  },
  {
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'estimate_task', arguments: { task: 'x', unknown: true } }
  },
  {
    jsonrpc: '2.0',
    id: 5,
    method: 'tools/call',
    params: { name: 'execute_task', arguments: { task: '安全な短文を整形する' } }
  },
  {
    jsonrpc: '2.0',
    id: 6,
    method: 'tools/call',
    params: { name: 'plan_task', arguments: { task: '安全な計画を作る' } }
  }
];
const input = `${requests.map((item) => JSON.stringify(item)).join('\n')}\n{broken json\n`;
const child = spawnSync(process.execPath, ['src/mcp-server.mjs'], {
  cwd: new URL('..', import.meta.url),
  input,
  encoding: 'utf8',
  env: {
    ...process.env,
    MODEL_ROUTER_OPENCLAW_AGENT: '',
    MODEL_ROUTER_LOG_MODE: 'off'
  }
});
assert.equal(child.status, 0, child.stderr);
const replies = child.stdout.trim().split('\n').map((line) => JSON.parse(line));
assert.equal(replies.length, 7);
assert.equal(replies[0].result.serverInfo.version, packageVersion);
assert.deepEqual(replies[1].result.tools.map((tool) => tool.name), ['estimate_task', 'plan_task']);
assert.equal(replies[2].result.structuredContent.arbiter_executed, false);
assert.equal(replies[3].error.code, -32602);
assert.match(replies[3].error.message, /unknown_input_fields/);
assert.equal(replies[4].error.code, -32601);
assert.match(replies[4].error.message, /execute_task/);
assert.equal(replies[5].error.code, -32001);
assert.match(replies[5].error.message, /openclaw_agent_not_configured/);
assert.equal(replies[6].error.code, -32700);

const exposedExecute = spawnSync(process.execPath, ['src/mcp-server.mjs'], {
  cwd: new URL('..', import.meta.url),
  input: `${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })}\n${JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'execute_task', arguments: { task: '安全な短文を整形する' } }
  })}\n`,
  encoding: 'utf8',
  env: {
    ...process.env,
    MODEL_ROUTER_EXPOSE_EXECUTE_TOOL: 'true',
    MODEL_ROUTER_LOG_MODE: 'off'
  }
});
assert.equal(exposedExecute.status, 0, exposedExecute.stderr);
const exposedReplies = exposedExecute.stdout.trim().split('\n').map((line) => JSON.parse(line));
assert.deepEqual(exposedReplies[0].result.tools.map((tool) => tool.name), ['estimate_task', 'plan_task', 'execute_task']);
assert.equal(exposedReplies[1].result.structuredContent.status, 'execution_disabled');
assert.equal(exposedReplies[1].result.structuredContent.provider_call_count, 0);

const invalidRequest = spawnSync(process.execPath, ['src/mcp-server.mjs'], {
  cwd: new URL('..', import.meta.url),
  input: '{"id":9,"method":"tools/list"}\n',
  encoding: 'utf8',
  env: { ...process.env, MODEL_ROUTER_LOG_MODE: 'off' }
});
assert.equal(invalidRequest.status, 0, invalidRequest.stderr);
assert.equal(JSON.parse(invalidRequest.stdout).error.code, -32600);

console.log('mcp smoke PASS');
