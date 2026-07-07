import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { assertAuth, fetchModuleList, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'dashboard-summary',
    access: 'read',
    description: '获取销帮帮CRM销售看板摘要（客户/商机/合同/产品/回款总量）',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'period', type: 'string', default: '本月', help: '统计周期（当前实现仅返回全量计数，参数保留兼容）' },
    ],
    columns: ['metric', 'value', 'unit'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        const modules = [
            { name: '客户总数', key: 'customer', unit: '个' },
            { name: '商机总数', key: 'opportunity', unit: '个' },
            { name: '合同总数', key: 'contract', unit: '份' },
            { name: '产品总数', key: 'product', unit: '个' },
            { name: '回款单总数', key: 'payment', unit: '笔' },
        ];

        const rows = [];
        for (const mod of modules) {
            try {
                const resp = await fetchModuleList(page, mod.key, commonParams, { timeoutSec: 15 });
                if (resp && resp.code === 1) {
                    const total = resp.totalCount || resp.result?.pageHelper?.rowsCount || (resp.result?.paasFormDataESList || []).length;
                    rows.push({ metric: mod.name, value: String(total), unit: mod.unit });
                }
            } catch (e) {
                // 模块不可用则跳过
            }
        }

        if (rows.length === 0) {
            throw new EmptyResultError('dashboard', '暂无看板数据（所有模块均无权限或为空）');
        }

        return rows;
    },
});
