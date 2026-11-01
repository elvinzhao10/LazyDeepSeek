window.__ModuleLoader__.load({
  id: 'lazydeepseek',
  factory(require) {
    const React = require('react');
    const { SettingsForm, SettingsValueField, SettingsFormModel, settingsNumberField } = require('@deepseek-ai/dsh-client-ui-primitives');
    const h = React.createElement;
    const copy = {
      en: {
        description: 'Native roles, jobs, goals and evidence-based workflows.',
        bundle: 'LazyDeepSeek 1.4.1 · DeepSeek Harness 0.2.1-rc.5',
        limits: 'These are the shared Harness delegation limits. Individual role depth limits still apply.',
        depth: 'Maximum delegation depth', capacity: 'Maximum active subagents',
        unavailable: 'The Harness subagent service is unavailable.', readOnly: 'These settings are read-only.',
        save: 'Save', saving: 'Saving…', saveFailed: 'Changes were refused. Review the latest values before retrying.',
        overridden: 'Overridden', reset: 'Reset to default', invalid: 'Enter a whole number in range.',
      },
      zh: {
        description: '原生角色、后台任务、目标与证据工作流。',
        bundle: 'LazyDeepSeek 1.4.1 · DeepSeek Harness 0.2.1-rc.5',
        limits: '这些设置与 Harness 子智能体设置共享。各角色自身的递归上限仍然生效。',
        depth: '最大递归层级', capacity: '最大活跃子智能体数',
        unavailable: 'Harness 子智能体服务当前不可用。', readOnly: '这些设置为只读。',
        save: '保存', saving: '保存中…', saveFailed: '修改未被接受，请查看最新设置后重试。',
        overridden: '已覆盖', reset: '恢复默认', invalid: '请输入范围内的整数。',
      },
    };
    return {
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        const ns = 'lazydeepseek.settings';
        const t = ctx.locale.bind(ns);
        ctx.effect(() => ctx.locale.register(ns, copy));
        const form = new SettingsFormModel(ctx.configForms.get('subagent'), [
          settingsNumberField('maxDepth'), settingsNumberField('maxActiveSubagents'),
        ]);
        const store = form.bind(() => ({ ...form.shell(), maxDepth: form.field('maxDepth'), maxActiveSubagents: form.field('maxActiveSubagents') }));
        ctx.effect(() => () => form.dispose());
        function Panel(props) {
          const state = props.useLazyDeepSeekSettings(snapshot => snapshot);
          if (props.view === 'summary') return t('description');
          const fields = [['maxDepth', 'depth'], ['maxActiveSubagents', 'capacity']];
          return h(SettingsForm, {
            state, onSave: props.save, onDiscard: props.discard,
            labels: { unavailable: t('unavailable'), readOnly: t('readOnly'), save: t('save'), saving: t('saving'), saveFailed: t('saveFailed') },
          }, h('p', null, t('bundle')), h('p', null, t('limits')),
          ...fields.map(([field, label]) => h(SettingsValueField, {
            key: field, id: `lazydeepseek-${field}`, label: t(label), numeric: true,
            disabled: !state.writable, overriddenLabel: t('overridden'), resetLabel: t('reset'), invalidLabel: t('invalid'),
            ...state[field], onEdit: value => props.edit(field, value), onReset: () => props.resetField(field),
          })));
        }
        ctx.effect(() => ctx.configForms.whileServed(['subagent'], () => ctx.slots.inject('plugins.item', () => ctx.slots.register({
          name: 'plugins.item', id: 'lazydeepseek-settings', order: 45,
          label: () => 'LazyDeepSeek', locale: ns,
          inject: () => ({ hooks: { lazyDeepSeekSettings: store }, ...form.actions() }),
        }, Panel))));
      },
    };
  },
});
