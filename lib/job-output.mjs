import { apply as applyJobs } from '@deepseek-ai/dsh-tool-jobs';

export const name = 'lazydeepseek-job-output';
export const inject = ['tools', 'jobs', 'systemPrompt'];

export function apply(ctx, config = {}) {
  const expected = new Set(['job_output', 'job_list', 'job_kill']);
  const seen = new Set();
  const tools = ctx.tools;
  const filteredTools = new Proxy(tools, {
    get(target, property) {
      if (property === 'register') return definition => {
        if (!expected.has(definition.name) || seen.has(definition.name)) {
          throw new Error(`unexpected upstream jobs tool: ${definition.name}`);
        }
        seen.add(definition.name);
        return definition.name === 'job_output' ? target.register(definition) : () => {};
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const scopedContext = new Proxy(ctx, {
    get(target, property) {
      if (property === 'tools') return filteredTools;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  applyJobs(scopedContext, config);
  if (seen.size !== expected.size) throw new Error('incomplete upstream jobs registration');
}
