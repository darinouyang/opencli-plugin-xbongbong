import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { assertAuth, fetchModuleList, DOMAIN, MODULE_CONFIG } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'payment-list',
    access: 'read',
    description: '查询销帮帮CRM回款单列表',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'keyword', type: 'string', help: '搜索关键词' },
        { name: 'status', type: 'string', help: '状态筛选（已回款/未回款/逾期）' },
        { name: 'limit', type: 'int', default: 20, help: '返回条数' },
        { name: 'page_num', type: 'int', default: 1, help: '页码' },
    ],
    columns: ['id', 'contract', 'customer', 'amount', 'status', 'payment_date', 'owner', 'created_at'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        const resp = await fetchModuleList(page, 'payment', commonParams, { timeoutSec: 15 });

        if (!resp || resp.code !== 1) {
            throw new AuthRequiredError(DOMAIN, `请求失败: ${resp?.msg || 'unknown'}`);
        }

        const list = resp.result?.paasFormDataESList || resp.result?.list || resp.data?.list || resp.data?.dataList || [];
        if (list.length === 0) {
            throw new EmptyResultError('payment list', '暂无回款数据');
        }

        let filtered = list;
        if (args.keyword) {
            const kw = args.keyword.toLowerCase();
            filtered = list.filter(item => {
                const d = item.data || item;
                const contract = (d.contractName || d.relateContractName || '').toLowerCase();
                const customer = (d.customerName || d.relateCustomerName || '').toLowerCase();
                return contract.includes(kw) || customer.includes(kw);
            });
        }

        const limit = args.limit || 20;
        const results = filtered.slice(0, limit);

        if (results.length === 0) {
            throw new EmptyResultError('payment list', '暂无匹配的回款数据');
        }

        return results.map(item => {
            const d = item.data || {};
            const owner = typeof item.ownerId === 'string' ? item.ownerId : (Array.isArray(item.ownerId) && item.ownerId.length > 0 ? item.ownerId[0].name : (d.ownerName || ''));
            return {
                id: item.dataId || item.id || '',
                contract: d.contractName || d.relateContractName || '',
                customer: d.customerName || d.relateCustomerName || '',
                amount: d.number_1 || d.amount || '',
                status: d.statusName || d.status || '',
                payment_date: formatTime(d.date_1 || d.paymentDate),
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
