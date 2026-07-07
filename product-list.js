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

        const list = resp.result?.paasFormDataESList || resp.result?.list || resp.data?.list || resp.data?.dataList || [];
        if (list.length === 0) {
            throw new EmptyResultError('product list', args.keyword ? `未找到匹配"${args.keyword}"的产品` : '产品列表为空');
        }

        let filtered = list;
        if (args.keyword) {
            const kw = args.keyword.toLowerCase();
            filtered = list.filter(item => {
                const d = item.data || item;
                const name = (d.text_1 || d.productName || d.name || '').toLowerCase();
                return name.includes(kw);
            });
        }

        const limit = args.limit || 20;
        const results = filtered.slice(0, limit);

        if (results.length === 0) {
            throw new EmptyResultError('product list', args.keyword ? `未找到匹配"${args.keyword}"的产品` : '产品列表为空');
        }

        return results.map(item => {
            const d = item.data || {};
            return {
                id: item.dataId || item.id || '',
                name: d.text_1 || d.productName || d.name || '',
                price: d.number_1 || d.price || '',
                unit: d.text_2 || d.unit || '',
                category: d.text_3 || d.category || '',
                status: d.statusName || d.status || '',
                stock: d.number_2 || d.stock || '',
                created_at: formatTime(item.addTime || item.createTime),
            };
        });
    },
});

function formatTime(ts) {
    if (!ts) return '';
    if (typeof ts === 'number') {
        const ms = ts < 1e12 ? ts * 1000 : ts;
        return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    }
    return String(ts);
}
