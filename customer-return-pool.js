import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, MODULE_CONFIG, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'customer-return-pool',
    access: 'write',
    description: '将客户退回公海池',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'id', type: 'string', required: true, positional: true, help: '客户ID（支持逗号分隔批量）' },
        { name: 'reason', type: 'string', help: '退回原因' },
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
            reason: args.reason || '',
        };

        const resp = await apiCall(page, '/customer/returnPool', body, commonParams);

        // 如果专用接口不存在，fallback
        if (!resp.ok && resp.status === 404) {
            const resp2 = await apiCall(page, '/form/data/returnPool', body, commonParams);
            if (!resp2.ok || !resp2.data || resp2.data.code !== 1) {
                throw new CommandExecutionError(`退回公海池失败: ${resp2.data?.msg || resp2.error || 'unknown'}`);
            }
            return ids.map(id => ({ id, status: 'success', message: '已退回公海池' }));
        }

        if (!resp.ok || !resp.data) {
            if (resp.status === 401) throw new AuthRequiredError(DOMAIN, 'Session已过期');
            throw new CommandExecutionError(`退回公海池失败: ${resp.data?.msg || resp.error || 'HTTP ' + resp.status}`);
        }

        if (resp.data.code !== 1) {
            throw new CommandExecutionError(`退回公海池失败: ${resp.data.msg || '未知错误'}`);
        }

        return ids.map(id => ({
            id: id,
            status: 'success',
            message: '已退回公海池',
        }));
    },
});
