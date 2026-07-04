import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, MODULE_CONFIG, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'customer-delete',
    access: 'write',
    description: '删除客户（移入回收站）',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'id', type: 'string', required: true, positional: true, help: '客户ID（支持逗号分隔批量）' },
    ],
    columns: ['id', 'status', 'message'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        const ids = args.id.split(',').map(s => s.trim()).filter(Boolean);
        const config = MODULE_CONFIG.customer;

        const body = {
            businessType: config.businessType,
            subBusinessType: config.subBusinessType,
            dataIds: ids,
        };

        const resp = await apiCall(page, '/form/data/delete', body, commonParams);

        if (!resp.ok || !resp.data) {
            if (resp.status === 401) throw new AuthRequiredError(DOMAIN, 'Session已过期');
            throw new CommandExecutionError(`删除客户失败: ${resp.data?.msg || resp.error || 'HTTP ' + resp.status}`);
        }

        if (resp.data.code !== 1) {
            throw new CommandExecutionError(`删除客户失败: ${resp.data.msg || '未知错误'}`);
        }

        return ids.map(id => ({
            id: id,
            status: 'success',
            message: '已移入回收站',
        }));
    },
});
