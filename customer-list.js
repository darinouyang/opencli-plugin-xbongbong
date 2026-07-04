import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { assertAuth, fetchModuleList, DOMAIN, MODULE_CONFIG } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'customer-list',
    access: 'read',
    description: '查询销帮帮CRM客户列表，支持分页、关键词搜索',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'keyword', type: 'string', help: '搜索关键词（客户名称）' },
        { name: 'limit', type: 'int', default: 20, help: '返回条数，默认20' },
        { name: 'page_num', type: 'int', default: 1, help: '页码，默认1' },
    ],
    columns: ['id', 'name', 'phone', 'owner', 'source', 'status', 'created_at', 'updated_at'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        // 通过hash-change触发SPA加载客户列表
        const resp = await fetchModuleList(page, 'customer', commonParams, { timeoutSec: 15 });

        if (!resp || resp.code !== 1) {
            throw new AuthRequiredError(DOMAIN, `请求失败: ${resp?.msg || 'unknown'}`);
        }

        const list = resp.data?.list || resp.data?.dataList || [];
        if (list.length === 0) {
            throw new EmptyResultError('customer list', args.keyword ? `未找到匹配"${args.keyword}"的客户` : '客户列表为空');
        }

        // 客户端过滤（SPA默认加载第一页数据，关键词过滤在客户端做）
        let filtered = list;
        if (args.keyword) {
            const kw = args.keyword.toLowerCase();
            filtered = list.filter(item => {
                const name = (item.text_1 || item.customerName || item.name || '').toLowerCase();
                const phone = extractPhone(item).toLowerCase();
                return name.includes(kw) || phone.includes(kw);
            });
        }

        const limit = args.limit || 20;
        const results = filtered.slice(0, limit);

        if (results.length === 0) {
            throw new EmptyResultError('customer list', args.keyword ? `未找到匹配"${args.keyword}"的客户` : '客户列表为空');
        }

        return results.map(item => ({
            id: item.dataId || item.id || '',
            name: item.text_1 || item.customerName || item.name || '',
            phone: extractPhone(item),
            owner: item.ownerName || item.owner || '',
            source: item.text_4 || item.source || '',
            status: item.statusName || item.status || '',
            created_at: formatTime(item.createTime || item.createdAt),
            updated_at: formatTime(item.updateTime || item.updatedAt),
        }));
    },
});

function extractPhone(item) {
    if (item.subForm_1 && Array.isArray(item.subForm_1) && item.subForm_1.length > 0) {
        return item.subForm_1[0].text_2 || '';
    }
    return item.phone || item.mobile || '';
}

function formatTime(ts) {
    if (!ts) return '';
    if (typeof ts === 'number') {
        return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
    }
    return String(ts);
}
