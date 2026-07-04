import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { assertAuth, fetchModuleList, MODULE_CONFIG, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'opportunity-list',
    access: 'read',
    description: '查询销帮帮CRM销售机会列表',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'keyword', type: 'string', help: '搜索关键词' },
        { name: 'stage', type: 'string', help: '机会阶段筛选' },
        { name: 'limit', type: 'int', default: 20, help: '返回条数' },
        { name: 'page_num', type: 'int', default: 1, help: '页码' },
    ],
    columns: ['id', 'name', 'customer', 'amount', 'stage', 'owner', 'expected_close', 'created_at'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        const resp = await fetchModuleList(page, 'opportunity', commonParams, { timeoutSec: 15 });

        if (!resp || resp.code !== 1) {
            throw new AuthRequiredError(DOMAIN, `请求失败: ${resp?.msg || 'unknown'}`);
        }

        const list = resp.data?.list || resp.data?.dataList || [];
        if (list.length === 0) {
            throw new EmptyResultError('opportunity list', '暂无销售机会数据');
        }

        let filtered = list;
        if (args.keyword) {
            const kw = args.keyword.toLowerCase();
            filtered = list.filter(item => {
                const name = (item.text_1 || item.name || '').toLowerCase();
                const customer = (item.customerName || item.relateCustomerName || '').toLowerCase();
                return name.includes(kw) || customer.includes(kw);
            });
        }

        const limit = args.limit || 20;
        const results = filtered.slice(0, limit);

        if (results.length === 0) {
            throw new EmptyResultError('opportunity list', '暂无匹配的销售机会数据');
        }

        return results.map(item => ({
            id: item.dataId || item.id || '',
            name: item.text_1 || item.name || '',
            customer: item.customerName || item.relateCustomerName || '',
            amount: item.number_1 || item.amount || '',
            stage: item.stageName || item.stage || '',
            owner: item.ownerName || item.owner || '',
            expected_close: formatTime(item.date_1 || item.expectedCloseDate),
            created_at: formatTime(item.createTime),
        }));
    },
});

function formatTime(ts) {
    if (!ts) return '';
    if (typeof ts === 'number') return new Date(ts).toISOString().slice(0, 10);
    return String(ts);
}
