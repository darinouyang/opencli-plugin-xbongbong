import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { assertAuth, fetchModuleList, DOMAIN, MODULE_CONFIG } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'contract-list',
    access: 'read',
    description: '查询销帮帮CRM合同订单列表',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'keyword', type: 'string', help: '搜索关键词' },
        { name: 'status', type: 'string', help: '合同状态筛选' },
        { name: 'limit', type: 'int', default: 20, help: '返回条数' },
        { name: 'page_num', type: 'int', default: 1, help: '页码' },
    ],
    columns: ['id', 'name', 'customer', 'amount', 'status', 'start_date', 'end_date', 'owner', 'created_at'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        const resp = await fetchModuleList(page, 'contract', commonParams, { timeoutSec: 15 });

        if (!resp || resp.code !== 1) {
            throw new AuthRequiredError(DOMAIN, `请求失败: ${resp?.msg || 'unknown'}`);
        }

        const list = resp.result?.paasFormDataESList || resp.result?.list || resp.data?.list || resp.data?.dataList || [];
        if (list.length === 0) {
            throw new EmptyResultError('contract list', '暂无合同数据');
        }

        let filtered = list;
        if (args.keyword) {
            const kw = args.keyword.toLowerCase();
            filtered = list.filter(item => {
                const d = item.data || item;
                const name = (d.text_1 || d.contractName || d.name || '').toLowerCase();
                const customer = (d.customerName || d.relateCustomerName || '').toLowerCase();
                return name.includes(kw) || customer.includes(kw);
            });
        }

        const limit = args.limit || 20;
        const results = filtered.slice(0, limit);

        if (results.length === 0) {
            throw new EmptyResultError('contract list', '暂无匹配的合同数据');
        }

        return results.map(item => {
            const d = item.data || {};
            const owner = typeof item.ownerId === 'string' ? item.ownerId : (Array.isArray(item.ownerId) && item.ownerId.length > 0 ? item.ownerId[0].name : (d.ownerName || ''));
            return {
                id: item.dataId || item.id || '',
                name: d.text_1 || d.contractName || d.name || '',
                customer: d.customerName || d.relateCustomerName || '',
                amount: d.number_1 || d.amount || '',
                status: d.statusName || d.status || '',
                start_date: formatTime(d.date_1 || d.startDate),
                end_date: formatTime(d.date_2 || d.endDate),
                owner: owner,
                created_at: formatTime(item.addTime || item.createTime),
            };
        });
    },
});

function formatTime(ts) {
    if (!ts) return '';
    if (typeof ts === 'number') {
        const ms = ts < 1e12 ? ts * 1000 : ts;
        return new Date(ms).toISOString().slice(0, 10);
    }
    return String(ts);
}
