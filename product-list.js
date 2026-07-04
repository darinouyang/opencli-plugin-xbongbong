import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { assertAuth, fetchModuleList, DOMAIN, MODULE_CONFIG } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'product-list',
    access: 'read',
    description: '查询销帮帮CRM产品目录',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'keyword', type: 'string', help: '搜索关键词（产品名称）' },
        { name: 'limit', type: 'int', default: 20, help: '返回条数，默认20' },
        { name: 'page_num', type: 'int', default: 1, help: '页码，默认1' },
    ],
    columns: ['id', 'name', 'price', 'unit', 'category', 'status', 'stock', 'created_at'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        const resp = await fetchModuleList(page, 'product', commonParams, { timeoutSec: 15 });

        if (!resp || resp.code !== 1) {
            throw new AuthRequiredError(DOMAIN, `请求失败: ${resp?.msg || 'unknown'}`);
        }

        const list = resp.data?.list || resp.data?.dataList || [];
        if (list.length === 0) {
            throw new EmptyResultError('product list', args.keyword ? `未找到匹配"${args.keyword}"的产品` : '产品列表为空');
        }

        let filtered = list;
        if (args.keyword) {
            const kw = args.keyword.toLowerCase();
            filtered = list.filter(item => {
                const name = (item.text_1 || item.productName || item.name || '').toLowerCase();
                return name.includes(kw);
            });
        }

        const limit = args.limit || 20;
        const results = filtered.slice(0, limit);

        if (results.length === 0) {
            throw new EmptyResultError('product list', args.keyword ? `未找到匹配"${args.keyword}"的产品` : '产品列表为空');
        }

        return results.map(item => ({
            id: item.dataId || item.id || '',
            name: item.text_1 || item.productName || item.name || '',
            price: item.number_1 || item.price || '',
            unit: item.text_2 || item.unit || '',
            category: item.text_3 || item.category || '',
            status: item.statusName || item.status || '',
            stock: item.number_2 || item.stock || '',
            created_at: formatTime(item.createTime || item.createdAt),
        }));
    },
});

function formatTime(ts) {
    if (!ts) return '';
    if (typeof ts === 'number') {
        return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
    }
    return String(ts);
}
