import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createOpenClawExecutionAdapter,
  createOpenClawSolAdapter,
  executeTask,
  estimateTask,
  loadRouterConfig,
  planTask,
  RouterAdapterError,
  RouterConfigError,
  RouterInputError
} from '../src/router.mjs';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'model-router-test-'));
const config = loadRouterConfig({ logDir: path.join(tempRoot, 'logs'), logRetentionDays: 1 });
assert.equal(config.models.arbiter.default_model, 'openai/gpt-5.6-sol');
assert.equal(config.policy.status, 'openclaw_codex_native_planning_execution_wrapper_default_off');
assert.equal(
  Object.prototype.hasOwnProperty.call(
    config.policy.execution_layer,
    ['standard', 'allocation', 'percent'].join('_')
  ),
  false
);
assert.equal(config.policy.execution_layer.allocation_policy, 'sol_dynamic_subtask_judgment_no_fixed_ratio');
assert.equal(config.policy.execution_layer.enabled, false);
assert.equal(config.policy.execution_layer.timeout_ms, 180000);
assert.equal(config.policy.execution_layer.max_attempts_per_model_call, 2);

const normal = estimateTask({
  task: '短い説明文を整形して',
  requested_model: null,
  data_class: 'internal_normal',
  requested_by: 'router-smoke'
}, { config, disableLog: true });
assert.equal(normal.status, 'estimated');
assert.equal(normal.mode, 'deterministic_safety_estimate_only');
assert.equal(normal.arbiter_executed, false);
assert.match(normal.price_disclaimer, /not official pricing/);

const uppercaseSecret = estimateTask({
  task: '設定を確認して',
  data_class: 'SECRET',
  requested_by: 'router-smoke'
}, { config, disableLog: true });
assert.equal(uppercaseSecret.recommended_tier, 'critical');

for (const badInput of [
  { task: 'x', max_cost_usd: -1 },
  { task: 'x', max_cost_usd: Infinity },
  { task: 'x', surprise: true },
  { task: 'x'.repeat(12001) }
]) {
  assert.throws(
    () => estimateTask(badInput, { config, disableLog: true }),
    RouterInputError
  );
}

assert.throws(
  () => estimateTask({ task: 'x', requested_model: 'gpt-5.6-ultra' }, { config, disableLog: true }),
  /unsupported_requested_model/
);

const oldLog = path.join(config.logDir, 'estimates-2000-01-01.jsonl');
fs.mkdirSync(config.logDir, { recursive: true });
fs.writeFileSync(oldLog, '{}\n');
fs.utimesSync(oldLog, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));
estimateTask({ task: '短い要約', requested_by: 'log-retention' }, { config });
assert.equal(fs.existsSync(oldLog), false);

const criticalLogTask = '本番へdeployして連絡先はsomeone@example.com';
const criticalLogged = estimateTask({
  task: criticalLogTask,
  requested_by: 'privacy-log-smoke'
}, { config });
const criticalLogText = fs.readFileSync(criticalLogged.log_path, 'utf8');
assert.ok(criticalLogText.includes('[OMITTED_CRITICAL_INPUT]'));
assert.ok(!criticalLogText.includes('someone@example.com'));
assert.ok(!criticalLogText.includes('本番へdeploy'));

const releaseDraftEstimate = estimateTask({
  task: 'GitHub/npm公開前チェックリスト案とrollback手順案を作る。実公開、投稿、送信、deploy、削除、認証操作は行わない。',
  data_class: 'internal_normal',
  requested_by: 'release-draft-smoke'
}, { config, disableLog: true });
assert.equal(releaseDraftEstimate.recommended_tier, 'deep');
assert.ok(releaseDraftEstimate.risk_flags.includes('read_only_release_or_external_keyword_reference'));

const mockPlan = {
  summary: 'Prepare a small implementation safely.',
  approval_required: false,
  approval_reasons: [],
  subtasks: [
    {
      id: 'format',
      title: 'Format the short result',
      task: 'Format three already-approved bullets.',
      assigned_model: 'openai/gpt-5.6-luna',
      decision: 'downshift_from_sol',
      rationale: 'Bounded mechanical formatting does not need deep judgment.',
      risk_level: 'low',
      approval_required: false,
      quality_guard: 'bounded_low_risk'
    },
    {
      id: 'draft',
      title: 'Draft the routine note',
      task: 'Draft a concise implementation note from approved context.',
      assigned_model: 'openai/gpt-5.6-terra',
      decision: 'downshift_from_sol',
      rationale: 'Routine bounded drafting can be handled by Terra.',
      risk_level: 'low',
      approval_required: false,
      quality_guard: 'bounded_low_risk'
    },
    {
      id: 'architecture',
      title: 'Choose the architecture',
      task: 'Design the architecture and rollback boundary.',
      assigned_model: 'openai/gpt-5.6-sol',
      decision: 'use_sol',
      rationale: 'Architecture requires deep judgment.',
      risk_level: 'high',
      approval_required: false,
      quality_guard: 'sol_quality_required'
    }
  ]
};

let arbiterCalls = 0;
const mockAdapter = async ({ input, model, timeoutMs }) => {
  arbiterCalls += 1;
  assert.match(input.task, /implementation/);
  assert.equal(model, 'openai/gpt-5.6-sol');
  assert.equal(timeoutMs, 180000);
  return {
    plan: mockPlan,
    meta: {
        adapter: 'mock_openclaw_gateway',
      response_id: 'resp_mock_1',
      response_model: 'gpt-5.6-sol',
      usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
      stored_by_provider: false,
      tools_enabled: false
    }
  };
};

const solPlan = await planTask({
  task: 'Create a small implementation and choose its architecture.',
  data_class: 'internal_normal',
  requested_by: 'sol-plan-smoke'
}, { config, arbiterAdapter: mockAdapter, disableLog: true });
assert.equal(arbiterCalls, 1);
assert.equal(solPlan.status, 'planned_by_sol');
assert.equal(solPlan.arbiter_executed, true);
assert.equal(solPlan.arbiter_execution.attempts, 1);
assert.equal(solPlan.arbiter_execution.response_model, 'gpt-5.6-sol');
assert.equal(solPlan.arbiter_execution.stored_by_provider, false);
assert.equal(solPlan.arbiter_execution.tools_enabled, false);
assert.deepEqual(solPlan.subtasks.map((item) => item.decision), ['downshift_from_sol', 'downshift_from_sol', 'use_sol']);
assert.equal(solPlan.execution_allowed, false);

const boundedDomainPlan = {
  summary: 'Draft a bounded product explanation.',
  approval_required: false,
  approval_reasons: [],
  subtasks: [
    {
      id: 'bounded_router_copy',
      title: 'Draft bounded copy',
      task: 'Write a short Model Router explanation from approved facts.',
      assigned_model: 'openai/gpt-5.6-terra',
      decision: 'downshift_from_sol',
      rationale: 'This is bounded low-risk drafting despite the product name containing Router.',
      risk_level: 'low',
      approval_required: false,
      quality_guard: 'bounded_low_risk'
    }
  ]
};
const boundedDomainResult = await planTask({
  task: 'Prepare one bounded product sentence.',
  data_class: 'internal_normal'
}, {
  config,
  disableLog: true,
  arbiterAdapter: async () => ({
    plan: boundedDomainPlan,
    meta: {
      adapter: 'mock_openclaw_gateway',
      response_id: 'resp_bounded_domain',
      response_model: 'gpt-5.6-sol',
      usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
      stored_by_provider: false,
      tools_enabled: false
    }
  })
});
assert.equal(boundedDomainResult.subtasks[0].assigned_model, 'openai/gpt-5.6-terra');
assert.equal(boundedDomainResult.server_safety_overrides.length, 0);

const unsafeDeepPlan = structuredClone(boundedDomainPlan);
unsafeDeepPlan.subtasks[0] = {
  ...unsafeDeepPlan.subtasks[0],
  task: 'Design the Model Router architecture and rollback boundary.',
  risk_level: 'normal',
  quality_guard: 'sol_quality_required'
};
const unsafeDeepResult = await planTask({
  task: 'Prepare an architecture decision.',
  data_class: 'internal_normal'
}, {
  config,
  disableLog: true,
  arbiterAdapter: async () => ({
    plan: unsafeDeepPlan,
    meta: {
      adapter: 'mock_openclaw_gateway',
      response_id: 'resp_unsafe_deep',
      response_model: 'gpt-5.6-sol',
      usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
      stored_by_provider: false,
      tools_enabled: false
    }
  })
});
assert.equal(unsafeDeepResult.subtasks[0].assigned_model, 'openai/gpt-5.6-sol');
assert.equal(unsafeDeepResult.server_safety_overrides[0].reason, 'server_safety_gate_prevented_downshift');

const retryConfig = structuredClone(config);
retryConfig.policy.execution_layer.max_attempts_per_model_call = 2;
let retryArbiterCalls = 0;
const retryPlan = await planTask({
  task: 'Create a bounded retry test plan.',
  data_class: 'internal_normal'
}, {
  config: retryConfig,
  disableLog: true,
  arbiterAdapter: async ({ timeoutMs }) => {
    retryArbiterCalls += 1;
    if (retryArbiterCalls === 1) throw new RouterAdapterError('openclaw_native_timeout');
    return mockAdapter({
      input: { task: 'Create a small implementation and choose its architecture.' },
      model: 'openai/gpt-5.6-sol',
      timeoutMs
    });
  }
});
assert.equal(retryArbiterCalls, 2);
assert.equal(retryPlan.arbiter_execution.attempts, 2);

const externalPlan = await planTask({
  task: 'Deploy the implementation to production.',
  allow_external_actions: true,
  data_class: 'production',
  requested_by: 'safety-override-smoke'
}, { config, arbiterAdapter: mockAdapter, disableLog: true });
assert.equal(externalPlan.approval_required, true);
assert.ok(externalPlan.subtasks.every((item) => item.assigned_model === 'openai/gpt-5.6-sol'));
assert.ok(externalPlan.subtasks.every((item) => item.quality_guard === 'approval_stop'));
assert.ok(externalPlan.server_safety_overrides.length >= 1);

let disabledExecutionCalls = 0;
const disabledExecution = await executeTask({
  task: 'Format three approved bullets.',
  data_class: 'internal_normal',
  requested_by: 'execution-disabled-smoke'
}, {
  config,
  disableLog: true,
  executionAdapter: async () => {
    disabledExecutionCalls += 1;
    assert.fail('execution adapter must not run while execution is disabled');
  }
});
assert.equal(disabledExecution.status, 'execution_disabled');
assert.equal(disabledExecution.execution_enabled, false);
assert.equal(disabledExecution.provider_call_count, 0);
assert.equal(disabledExecution.allocation_policy, 'sol_dynamic_subtask_judgment_no_fixed_ratio');
assert.equal(disabledExecutionCalls, 0);

const executionCallOrder = [];
const executionArbiter = async ({ model }) => {
  executionCallOrder.push(`sol_planning:${model}`);
  return {
    plan: mockPlan,
    meta: {
        adapter: 'mock_openclaw_gateway',
      response_id: 'resp_exec_plan',
      response_model: 'gpt-5.6-sol',
      usage: { input_tokens: 120, output_tokens: 240, total_tokens: 360 },
      stored_by_provider: false,
      tools_enabled: false
    }
  };
};
const executionAdapter = async ({ phase, model, subtask, input }) => {
  executionCallOrder.push(`${phase}:${model}`);
  if (phase === 'synthesis') {
    return {
      output: {
        final_answer: 'Combined final answer.',
        qc_status: 'passed',
        qc_notes: ['Sol checked the collected outputs.'],
        allocation_decision_reasons: [
          'Sol used Luna/Terra for bounded work and Sol for architecture.',
          'Stale pre-synthesis token share was 12.34%.'
        ]
      },
      meta: {
        adapter: 'mock_openclaw_gateway',
        response_id: 'resp_exec_synthesis',
        response_model: 'gpt-5.6-sol',
        usage: { input_tokens: 300, output_tokens: 200, total_tokens: 500 },
        stored_by_provider: false,
        tools_enabled: false
      }
    };
  }
  const completedBefore = executionCallOrder.filter((entry) => entry.startsWith('subtask:')).length - 1;
  assert.equal(input.prior_subtask_results.length, completedBefore);
  if (completedBefore > 0) {
    assert.equal(input.prior_subtask_results.at(-1).subtask_id, mockPlan.subtasks[completedBefore - 1].id);
  }
  return {
    output: {
      subtask_id: subtask.id,
      status: 'completed',
      result: `Completed ${subtask.id}.`,
      limitations: [],
      safety_notes: ['No external action performed.']
    },
    meta: {
        adapter: 'mock_openclaw_gateway',
      response_id: `resp_exec_${subtask.id}`,
      response_model: model.replace('openai/', ''),
      usage: { input_tokens: 80, output_tokens: 120, total_tokens: 200 },
      stored_by_provider: false,
      tools_enabled: false
    }
  };
};
const executed = await executeTask({
  task: 'Create a small implementation and choose its architecture.',
  data_class: 'internal_normal',
  requested_by: 'execution-enabled-smoke'
}, {
  config,
  executionEnabled: true,
  arbiterAdapter: executionArbiter,
  executionAdapter
});
assert.equal(executed.status, 'executed_by_model_router');
assert.equal(executed.execution_enabled, true);
assert.equal(executed.execution_allowed, true);
assert.deepEqual(executionCallOrder, [
  'sol_planning:openai/gpt-5.6-sol',
  'subtask:openai/gpt-5.6-luna',
  'subtask:openai/gpt-5.6-terra',
  'subtask:openai/gpt-5.6-sol',
  'synthesis:openai/gpt-5.6-sol'
]);
assert.equal(executed.provider_call_count, 5);
assert.deepEqual(executed.measured_allocation.subtask_count, { sol: 1, terra: 1, luna: 1 });
assert.ok(executed.allocation_decision_reasons.some((reason) => reason.includes('openai/gpt-5.6-luna')));
assert.ok(!executed.allocation_decision_reasons.some((reason) => reason.includes('12.34%')));
assert.equal(executed.sol_final_qc.qc_status, 'passed');
assert.ok(executed.log_path);
const executionLog = JSON.parse(fs.readFileSync(executed.log_path, 'utf8').trim().split('\n').at(-1));
assert.deepEqual(executionLog.provider_calls.map((call) => call.model), [
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-luna',
  'openai/gpt-5.6-terra',
  'openai/gpt-5.6-sol',
  'openai/gpt-5.6-sol'
]);
assert.deepEqual(executionLog.measured_subtask_count, { sol: 1, terra: 1, luna: 1 });
assert.ok(executionLog.measured_token_count.sol > 0);
assert.ok(executionLog.reference_estimated_cost_usd.sol > 0);
assert.ok(executionLog.allocation_decision_reasons.some((reason) => reason.includes('openai/gpt-5.6-luna')));
assert.equal(executionLog.sol_final_qc.qc_status, 'passed');
assert.equal(executionLog.sol_final_qc.final_answer_omitted_from_log, true);
assert.equal(executionLog.subtask_results, undefined);
assert.ok(!JSON.stringify(executionLog).includes('Completed format'));

const qcStopCallOrder = [];
const qcStopped = await executeTask({
  task: 'Create a small implementation that Sol should review.',
  data_class: 'internal_normal',
  requested_by: 'execution-qc-stop-smoke'
}, {
  config,
  disableLog: true,
  executionEnabled: true,
  arbiterAdapter: async ({ model }) => {
    qcStopCallOrder.push(`sol_planning:${model}`);
    return {
      plan: mockPlan,
      meta: {
        adapter: 'mock_openclaw_gateway',
        response_id: 'resp_qc_stop_plan',
        response_model: 'gpt-5.6-sol',
        usage: { input_tokens: 120, output_tokens: 240, total_tokens: 360 },
        stored_by_provider: false,
        tools_enabled: false
      }
    };
  },
  executionAdapter: async ({ phase, model, subtask }) => {
    qcStopCallOrder.push(`${phase}:${model}`);
    if (phase === 'synthesis') {
      return {
        output: {
          final_answer: 'Stopped for human review.',
          qc_status: 'requires_human_review',
          qc_notes: ['Sol rejected final quality and requested review.'],
          allocation_decision_reasons: ['Sol final QC found the collected result incomplete.']
        },
        meta: {
        adapter: 'mock_openclaw_gateway',
          response_id: 'resp_qc_stop_synthesis',
          response_model: 'gpt-5.6-sol',
          usage: { input_tokens: 300, output_tokens: 200, total_tokens: 500 },
          stored_by_provider: false,
          tools_enabled: false
        }
      };
    }
    return {
      output: {
        subtask_id: subtask.id,
        status: 'completed',
        result: `Completed ${subtask.id}.`,
        limitations: [],
        safety_notes: ['No external action performed.']
      },
      meta: {
        adapter: 'mock_openclaw_gateway',
        response_id: `resp_qc_stop_${subtask.id}`,
        response_model: model.replace('openai/', ''),
        usage: { input_tokens: 80, output_tokens: 120, total_tokens: 200 },
        stored_by_provider: false,
        tools_enabled: false
      }
    };
  }
});
assert.deepEqual(qcStopCallOrder, [
  'sol_planning:openai/gpt-5.6-sol',
  'subtask:openai/gpt-5.6-luna',
  'subtask:openai/gpt-5.6-terra',
  'subtask:openai/gpt-5.6-sol',
  'synthesis:openai/gpt-5.6-sol'
]);
assert.equal(qcStopped.status, 'execution_stopped');
assert.equal(qcStopped.stop_reason, 'sol_final_qc_requires_human_review');
assert.equal(qcStopped.execution_allowed, false);
assert.equal(qcStopped.sol_final_qc.qc_status, 'requires_human_review');
assert.equal(qcStopped.provider_call_count, 5);
assert.equal(qcStopped.subtask_results.length, 3);
assert.ok(qcStopped.allocation_decision_reasons.includes('sol_final_qc_requires_human_review'));

const solOnlyPlan = {
  summary: 'Perform a high-risk architecture review with Sol only.',
  approval_required: false,
  approval_reasons: [],
  subtasks: [
    {
      id: 'review',
      title: 'Review architecture and risk',
      task: 'Review security architecture, rollback, and risk boundaries.',
      assigned_model: 'openai/gpt-5.6-sol',
      decision: 'use_sol',
      rationale: 'Security architecture and risk review require Sol judgment.',
      risk_level: 'high',
      approval_required: false,
      quality_guard: 'sol_quality_required'
    }
  ]
};
const solOnlyCallOrder = [];
const solOnlyExecuted = await executeTask({
  task: 'Review security architecture and rollback risk boundaries.',
  data_class: 'internal_normal',
  requested_by: 'execution-sol-only-smoke'
}, {
  config,
  disableLog: true,
  executionEnabled: true,
  arbiterAdapter: async ({ model }) => {
    solOnlyCallOrder.push(`sol_planning:${model}`);
    return {
      plan: solOnlyPlan,
      meta: {
        adapter: 'mock_openclaw_gateway',
        response_id: 'resp_sol_only_plan',
        response_model: 'gpt-5.6-sol',
        usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
        stored_by_provider: false,
        tools_enabled: false
      }
    };
  },
  executionAdapter: async ({ phase, model, subtask }) => {
    solOnlyCallOrder.push(`${phase}:${model}`);
    if (phase === 'synthesis') {
      return {
        output: {
          final_answer: 'Sol-only final answer.',
          qc_status: 'passed',
          qc_notes: ['Sol kept all execution because the task required risk judgment.'],
          allocation_decision_reasons: ['Sol-only allocation matched the task risk.']
        },
        meta: {
        adapter: 'mock_openclaw_gateway',
          response_id: 'resp_sol_only_synthesis',
          response_model: 'gpt-5.6-sol',
          usage: { input_tokens: 120, output_tokens: 120, total_tokens: 240 },
          stored_by_provider: false,
          tools_enabled: false
        }
      };
    }
    return {
      output: {
        subtask_id: subtask.id,
        status: 'completed',
        result: 'Sol completed risk review.',
        limitations: [],
        safety_notes: ['No external action performed.']
      },
      meta: {
        adapter: 'mock_openclaw_gateway',
        response_id: `resp_sol_only_${subtask.id}`,
        response_model: model.replace('openai/', ''),
        usage: { input_tokens: 90, output_tokens: 90, total_tokens: 180 },
        stored_by_provider: false,
        tools_enabled: false
      }
    };
  }
});
assert.deepEqual(solOnlyCallOrder, [
  'sol_planning:openai/gpt-5.6-sol',
  'subtask:openai/gpt-5.6-sol',
  'synthesis:openai/gpt-5.6-sol'
]);
assert.deepEqual(solOnlyExecuted.measured_allocation.subtask_count, { sol: 1, terra: 0, luna: 0 });
assert.notDeepEqual(solOnlyExecuted.measured_allocation.subtask_count, executed.measured_allocation.subtask_count);
assert.ok(solOnlyExecuted.allocation_decision_reasons.some((reason) => reason.includes('risk review')));

let budgetProviderCalls = 0;
const budgetStopped = await executeTask({
  task: 'Create a small implementation.',
  max_cost_usd: 0.000001,
  data_class: 'internal_normal',
  requested_by: 'budget-stop-smoke'
}, {
  config,
  disableLog: true,
  executionEnabled: true,
  arbiterAdapter: async () => {
    budgetProviderCalls += 1;
    assert.fail('budget guard must stop before provider calls');
  },
  executionAdapter
});
assert.equal(budgetStopped.status, 'execution_stopped');
assert.equal(budgetStopped.stop_reason, 'execution_budget_exceeded_before_sol_planning');
assert.equal(budgetStopped.provider_call_count, 0);
assert.equal(budgetProviderCalls, 0);

const partialBudgetCallOrder = [];
const partialBudgetStopped = await executeTask({
  task: 'Create implementation.',
  max_cost_usd: 0.13,
  data_class: 'internal_normal',
  requested_by: 'partial-budget-stop-smoke'
}, {
  config,
  disableLog: true,
  executionEnabled: true,
  arbiterAdapter: async ({ model }) => {
    partialBudgetCallOrder.push(`sol_planning:${model}`);
    return {
      plan: mockPlan,
      meta: {
        adapter: 'mock_openclaw_gateway',
        response_id: 'resp_partial_budget_plan',
        response_model: 'gpt-5.6-sol',
        usage: { input_tokens: 120, output_tokens: 240, total_tokens: 360 },
        stored_by_provider: false,
        tools_enabled: false
      }
    };
  },
  executionAdapter: async ({ phase, model, subtask }) => {
    partialBudgetCallOrder.push(`${phase}:${model}`);
    return {
      output: {
        subtask_id: subtask.id,
        status: 'completed',
        result: `Completed ${subtask.id}.`,
        limitations: [],
        safety_notes: ['No external action performed.']
      },
      meta: {
        adapter: 'mock_openclaw_gateway',
        response_id: `resp_partial_budget_${subtask.id}`,
        response_model: model.replace('openai/', ''),
        usage: { input_tokens: 80, output_tokens: 120, total_tokens: 200 },
        stored_by_provider: false,
        tools_enabled: false
      }
    };
  }
});
assert.deepEqual(partialBudgetCallOrder, [
  'sol_planning:openai/gpt-5.6-sol',
  'subtask:openai/gpt-5.6-luna',
  'subtask:openai/gpt-5.6-terra'
]);
assert.equal(partialBudgetStopped.status, 'execution_stopped');
assert.equal(partialBudgetStopped.stop_reason, 'execution_budget_exceeded_before_subtask');
assert.equal(partialBudgetStopped.subtask_results.length, 2);
assert.equal(partialBudgetStopped.provider_call_count, 3);

await assert.rejects(
  () => executeTask({
    task: 'Send this to Discord',
    allow_external_actions: true,
    data_class: 'internal_normal'
  }, { config, disableLog: true, executionEnabled: true, arbiterAdapter: executionArbiter, executionAdapter }),
  (error) => error instanceof RouterAdapterError && error.code === 'execution_external_actions_blocked'
);

await assert.rejects(
  () => executeTask({
    task: 'GitHubへ公開してnpmへpublishして',
    data_class: 'internal_normal'
  }, { config, disableLog: true, executionEnabled: true, arbiterAdapter: executionArbiter, executionAdapter }),
  (error) => error instanceof RouterAdapterError && error.code === 'execution_critical_input_blocked'
);

const releaseDraftExecuted = await executeTask({
  task: 'GitHub/npm公開前チェックリスト案とrollback手順案を作る。実公開、投稿、送信、deploy、削除、認証操作は行わない。',
  data_class: 'internal_normal',
  requested_by: 'release-draft-execution-smoke'
}, {
  config,
  disableLog: true,
  executionEnabled: true,
  arbiterAdapter: async () => ({
    plan: mockPlan,
    meta: {
      adapter: 'mock_openclaw_gateway',
      response_id: 'resp_release_draft_plan',
      response_model: 'gpt-5.6-sol',
      usage: { input_tokens: 120, output_tokens: 240, total_tokens: 360 },
      stored_by_provider: false,
      tools_enabled: false
    }
  }),
  executionAdapter: async ({ phase, model, subtask }) => {
    if (phase === 'synthesis') {
      return {
        output: {
          final_answer: 'Release preparation draft completed.',
          qc_status: 'passed',
          qc_notes: ['Read-only release preparation only; no external action performed.'],
          allocation_decision_reasons: ['Sol kept external actions blocked while allowing documentation drafting.']
        },
        meta: {
          adapter: 'mock_openclaw_gateway',
          response_id: 'resp_release_draft_synthesis',
          response_model: 'gpt-5.6-sol',
          usage: { input_tokens: 200, output_tokens: 160, total_tokens: 360 },
          stored_by_provider: false,
          tools_enabled: false
        }
      };
    }
    return {
      output: {
        subtask_id: subtask.id,
        status: 'completed',
        result: `Prepared ${subtask.id}.`,
        limitations: [],
        safety_notes: ['No publish, post, send, deploy, delete, or auth operation performed.']
      },
      meta: {
        adapter: 'mock_openclaw_gateway',
        response_id: `resp_release_draft_${subtask.id}`,
        response_model: model.replace('openai/', ''),
        usage: { input_tokens: 80, output_tokens: 120, total_tokens: 200 },
        stored_by_provider: false,
        tools_enabled: false
      }
    };
  }
});
assert.equal(releaseDraftExecuted.status, 'executed_by_model_router');
assert.equal(releaseDraftExecuted.preflight_tier, 'deep');

const readOnlyApprovalPlan = {
  summary: 'Prepare read-only release documentation.',
  approval_required: true,
  approval_reasons: [],
  subtasks: [
    {
      id: 'release_scope',
      title: 'Define read-only release scope',
      task: 'Create a GitHub/npm公開前チェックリスト案 only. 実公開、送信、deploy、削除、認証操作は行わない。',
      assigned_model: 'openai/gpt-5.6-sol',
      decision: 'use_sol',
      rationale: 'Read-only release documentation needs Sol.',
      risk_level: 'normal',
      approval_required: true,
      quality_guard: 'approval_stop'
    }
  ]
};
const readOnlyApprovalCleared = await executeTask({
  task: 'GitHub/npm公開前チェックリスト案を作る。実公開、送信、deploy、削除、認証操作は行わない。',
  data_class: 'internal_normal',
  requested_by: 'release-approval-clear-smoke'
}, {
  config,
  disableLog: true,
  executionEnabled: true,
  arbiterAdapter: async () => ({
    plan: readOnlyApprovalPlan,
    meta: {
      adapter: 'mock_openclaw_gateway',
      response_id: 'resp_read_only_approval_plan',
      response_model: 'gpt-5.6-sol',
      usage: { input_tokens: 120, output_tokens: 200, total_tokens: 320 },
      stored_by_provider: false,
      tools_enabled: false
    }
  }),
  executionAdapter: async ({ phase, model, subtask }) => {
    if (phase === 'synthesis') {
      return {
        output: {
          final_answer: 'Read-only release documentation completed.',
          qc_status: 'passed',
          qc_notes: ['No external action performed.'],
          allocation_decision_reasons: ['Read-only documentation approval was cleared by server policy.']
        },
        meta: {
          adapter: 'mock_openclaw_gateway',
          response_id: 'resp_read_only_approval_synthesis',
          response_model: 'gpt-5.6-sol',
          usage: { input_tokens: 100, output_tokens: 100, total_tokens: 200 },
          stored_by_provider: false,
          tools_enabled: false
        }
      };
    }
    return {
      output: {
        subtask_id: subtask.id,
        status: 'completed',
        result: 'Prepared release scope checklist draft.',
        limitations: [],
        safety_notes: ['Read-only draft.']
      },
      meta: {
        adapter: 'mock_openclaw_gateway',
        response_id: 'resp_read_only_approval_subtask',
        response_model: model.replace('openai/', ''),
        usage: { input_tokens: 80, output_tokens: 80, total_tokens: 160 },
        stored_by_provider: false,
        tools_enabled: false
      }
    };
  }
});
assert.equal(readOnlyApprovalCleared.status, 'executed_by_model_router');
assert.equal(readOnlyApprovalCleared.plan.approval_required, false);
assert.equal(readOnlyApprovalCleared.plan.subtasks[0].approval_required, false);
assert.equal(readOnlyApprovalCleared.plan.server_safety_overrides[0].reason, 'server_safety_gate_cleared_read_only_documentation_approval');

await assert.rejects(
  () => executeTask({
    task: 'Use the credential value',
    data_class: 'credential'
  }, { config, disableLog: true, executionEnabled: true, arbiterAdapter: executionArbiter, executionAdapter }),
  (error) => error instanceof RouterAdapterError && error.code === 'execution_sensitive_input_blocked'
);

let sensitiveAdapterCalled = false;
await assert.rejects(
  () => planTask({
    task: 'Use the credential value',
    data_class: 'credential'
  }, {
    config,
    disableLog: true,
    arbiterAdapter: async () => {
      sensitiveAdapterCalled = true;
      return { plan: mockPlan, meta: {} };
    }
  }),
  (error) => error instanceof RouterAdapterError && error.code === 'sensitive_input_blocked_before_sol'
);
assert.equal(sensitiveAdapterCalled, false);

await assert.rejects(
  () => planTask({ task: 'Plan a safe document.' }, {
    config,
    disableLog: true,
    arbiterAdapter: async () => ({
      plan: {
        ...mockPlan,
        subtasks: [{ ...mockPlan.subtasks[0], assigned_model: 'unknown/model' }]
      },
      meta: { adapter: 'bad_mock' }
    })
  }),
  (error) => error instanceof RouterAdapterError && error.code === 'unsupported_sol_plan_model'
);

function nativePayload(model, text, runId = 'run_native_mock') {
  return {
    runId,
    status: 'ok',
    result: {
      payloads: [{ text }],
      meta: {
        finalAssistantVisibleText: text,
        agentMeta: {
          provider: 'openai',
          model,
          agentHarnessId: 'codex',
          usage: { input: 12, output: 34, total: 46 }
        },
        executionTrace: { fallbackUsed: false },
        requestShaping: { authMode: 'auth-profile' },
        systemPromptReport: { tools: { entries: [{ name: 'sessions_yield' }] } }
      }
    }
  };
}

let capturedCommand;
const nativeAdapter = createOpenClawSolAdapter({
  agentId: 'asuna',
  runCommand: async (command, args) => {
    capturedCommand = { command, args };
    return { stdout: JSON.stringify(nativePayload('gpt-5.6-sol', JSON.stringify(mockPlan))), stderr: '' };
  }
});
const adapterOutput = await nativeAdapter({
  input: { task: 'Plan one safe task.', data_class: 'internal_normal', allow_external_actions: false },
  model: 'openai/gpt-5.6-sol',
  timeoutMs: 1000
});
assert.equal(capturedCommand.command, 'openclaw');
assert.ok(capturedCommand.args.includes('agent'));
assert.ok(capturedCommand.args.includes('--json'));
assert.ok(capturedCommand.args.includes('openai/gpt-5.6-sol'));
assert.ok(!capturedCommand.args.includes('codex/gpt-5.6-sol'));
assert.ok(!capturedCommand.args.includes('--local'));
assert.equal(adapterOutput.meta.adapter, 'openclaw_gateway_codex');
assert.equal(adapterOutput.meta.auth_mode, 'auth-profile');
assert.equal(adapterOutput.meta.response_id, 'run_native_mock');

const missingAgentAdapter = createOpenClawSolAdapter({
  agentId: '',
  runCommand: async () => assert.fail('command must not run without an agent id')
});
const previousAgent = process.env.MODEL_ROUTER_OPENCLAW_AGENT;
delete process.env.MODEL_ROUTER_OPENCLAW_AGENT;
await assert.rejects(
  () => missingAgentAdapter({ input: { task: 'x' }, model: 'openai/gpt-5.6-sol' }),
  (error) => error instanceof RouterAdapterError && error.code === 'openclaw_agent_not_configured'
);
if (previousAgent !== undefined) process.env.MODEL_ROUTER_OPENCLAW_AGENT = previousAgent;

let capturedExecutionCommand;
const nativeExecutionAdapter = createOpenClawExecutionAdapter({
  agentId: 'asuna',
  runCommand: async (command, args) => {
    capturedExecutionCommand = { command, args };
    return {
      stdout: JSON.stringify(nativePayload('gpt-5.6-terra', JSON.stringify({
        subtask_id: 'draft',
        status: 'completed',
        result: 'Drafted.',
        limitations: [],
        safety_notes: []
      }), 'run_native_execution')),
      stderr: ''
    };
  }
});
const executionAdapterOutput = await nativeExecutionAdapter({
  model: 'openai/gpt-5.6-terra',
  instructions: 'Return schema only.',
  input: { subtask_id: 'draft' },
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      subtask_id: { type: 'string' },
      status: { type: 'string' },
      result: { type: 'string' },
      limitations: { type: 'array', items: { type: 'string' } },
      safety_notes: { type: 'array', items: { type: 'string' } }
    },
    required: ['subtask_id', 'status', 'result', 'limitations', 'safety_notes']
  },
  schemaName: 'test_execution_result',
  timeoutMs: 1000
});
assert.equal(capturedExecutionCommand.command, 'openclaw');
assert.ok(capturedExecutionCommand.args.includes('openai/gpt-5.6-terra'));
assert.ok(!capturedExecutionCommand.args.includes('codex/gpt-5.6-terra'));
assert.equal(executionAdapterOutput.meta.response_id, 'run_native_execution');

const timeoutExecutionAdapter = createOpenClawExecutionAdapter({
  agentId: 'asuna',
  runCommand: async () => {
    const error = new Error('timed out');
    error.killed = true;
    throw error;
  }
});
await assert.rejects(
  () => timeoutExecutionAdapter({
    model: 'openai/gpt-5.6-terra',
    instructions: 'Return schema only.',
    input: { subtask_id: 'draft' },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        subtask_id: { type: 'string' },
        status: { type: 'string' },
        result: { type: 'string' },
        limitations: { type: 'array', items: { type: 'string' } },
        safety_notes: { type: 'array', items: { type: 'string' } }
      },
      required: ['subtask_id', 'status', 'result', 'limitations', 'safety_notes']
    },
    schemaName: 'test_execution_timeout',
    timeoutMs: 10
  }),
  (error) => error instanceof RouterAdapterError && error.code === 'openclaw_native_timeout'
);

const wrongHarnessAdapter = createOpenClawSolAdapter({
  agentId: 'asuna',
  runCommand: async () => {
    const payload = nativePayload('gpt-5.6-sol', JSON.stringify(mockPlan));
    payload.result.meta.agentMeta.agentHarnessId = 'other';
    return { stdout: JSON.stringify(payload), stderr: '' };
  }
});
await assert.rejects(
  () => wrongHarnessAdapter({ input: { task: 'x' }, model: 'openai/gpt-5.6-sol' }),
  (error) => error instanceof RouterAdapterError && error.code === 'openclaw_codex_auth_required'
);

const unsafeToolAdapter = createOpenClawSolAdapter({
  agentId: 'asuna',
  runCommand: async () => {
    const payload = nativePayload('gpt-5.6-sol', JSON.stringify(mockPlan));
    payload.result.meta.systemPromptReport.tools.entries.push({ name: 'message' });
    return { stdout: JSON.stringify(payload), stderr: '' };
  }
});
await assert.rejects(
  () => unsafeToolAdapter({ input: { task: 'x' }, model: 'openai/gpt-5.6-sol' }),
  (error) => error instanceof RouterAdapterError && error.code === 'openclaw_router_agent_tools_not_isolated'
);

const malformedConfigPath = path.join(tempRoot, 'broken.json');
fs.writeFileSync(malformedConfigPath, '{broken');
assert.throws(
  () => loadRouterConfig({ modelsPath: malformedConfigPath }),
  RouterConfigError
);

fs.rmSync(tempRoot, { recursive: true, force: true });
console.log('router smoke PASS');
