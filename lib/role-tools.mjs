export const name = 'lazydeepseek-role-tools';
export const inject = ['tools'];

export function apply(ctx, config) {
  if (!Array.isArray(config.allow) || !config.allow.every(name => typeof name === 'string')) {
    throw new Error('role tool allowlist must be an array of names');
  }
  const allowed = new Set(config.allow);
  let previous;
  let lift;
  const update = () => {
    const inherited = ctx.tools.schemas().map(tool => tool.name).filter(name => name !== 'run_code' && !allowed.has(name)).sort();
    const key = JSON.stringify(inherited);
    if (key === previous) return;
    previous = key;
    const next = ctx.tools.restrict({ deny: inherited });
    lift?.();
    lift = next;
  };
  update();
  ctx.on('tools/change', update);
}
