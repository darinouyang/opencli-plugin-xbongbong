import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, MODULE_CONFIG, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'customer-transfer',
    access: 'write',
    description: '移交客户给其他销售人员',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'id', type: 'string', required: true, positional: true, help: '客户ID（支持逗号分隔批量）' },
        { name: 'to', type: 'string', required: true, help: '目标销售人员userId' },
    ],
    columns: ['id', 'to', 'status', 'message'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        if (!args.to?.trim()) throw new ArgumentError('目标销售人员 --to 不能为空');

        const ids = args.id.split(',').map(s => s.trim()).filter(Boolean);
        const config = MODULE_CONFIG.customer;

        const body = {
            businessType: config.businessType,
            subBusinessType: config.subBusinessType,
            dataIds: ids,
            toUserId: args.to,
            operationType: 'transfer', // 移交
        };

        const resp = await apiCall(page, '/form/data/transfer', body, commonParams);

        if (!resp.ok || !resp.data) {
            if (resp.status === 401) throw new AuthRequiredError(DOMAIN, 'Session已过期');
            throw new CommandExecutionError(`移交客户失败: ${resp.data?.msg || resp.error || 'HTTP ' + resp.status}`);
        }

        if (resp.data.code !== 1) {
            throw new CommandExecutionError(`移交客户失败: ${resp.data.msg || '未知错误'}`);
        }

        return ids.map(id => ({
            id: id,
            to: args.to,
            status: 'success',
            message: '移交成功',
        }));
    },
});
