import Presets from '@deepseek-ai/dsh-agent-preset-registry';
export const name = 'lazydeepseek-preset-registry';
export const inject = ['loader', 'sessionProjections'];
export async function apply(ctx) {
  if (ctx.get('agentPresets')) return;
  if ([...ctx.loader.entries()].some(entry => !entry.disabled && entry.options.name === '@deepseek-ai/dsh-agent-preset-registry')) return;
  const fiber = ctx.plugin(Presets, { default: 'lazydeepseek-inherited' });
  await fiber.inertia;
  ctx.effect(() => ctx.get('agentPresets').register({ id: 'lazydeepseek-inherited', plugins: [] }));
}
