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

        const list = resp.result?.paasFormDataESList || resp.result?.list || resp.data?.list || resp.data?.dataList || [];
        if (list.length === 0) {
            throw new EmptyResultError('customer list', args.keyword ? `未找到匹配"${args.keyword}"的客户` : '客户列表为空');
        }

        // 客户端过滤（SPA默认加载第一页数据，关键词过滤在客户端做）
        let filtered = list;
        if (args.keyword) {
            const kw = args.keyword.toLowerCase();
            filtered = list.filter(item => {
                const d = item.data || item;
                const name = (d.text_1 || d.customerName || d.name || '').toLowerCase();
                const phone = extractPhone(d).toLowerCase();
                return name.includes(kw) || phone.includes(kw);
            });
        }

        const limit = args.limit || 20;
        const results = filtered.slice(0, limit);

        if (results.length === 0) {
            throw new EmptyResultError('customer list', args.keyword ? `未找到匹配"${args.keyword}"的客户` : '客户列表为空');
        }

        return results.map(item => {
            const d = item.data || {};
            const owner = typeof item.ownerId === 'string' ? item.ownerId : (Array.isArray(item.ownerId) && item.ownerId.length > 0 ? item.ownerId[0].name : (d.ownerName || ''));
            return {
                id: item.dataId || item.id || '',
                name: d.text_1 || item.text_1 || d.customerName || d.name || '',
                phone: extractPhone(d),
                owner: owner,
                source: d.text_4 || d.source || '',
                status: d.statusName || d.status || '',
                created_at: formatTime(item.addTime || item.createTime),
                updated_at: formatTime(item.updateTime),
            };
        });
    },
});

function extractPhone(d) {
    if (d.subForm_1 && Array.isArray(d.subForm_1) && d.subForm_1.length > 0) {
        return d.subForm_1[0].text_2 || '';
    }
    return d.phone || d.mobile || '';
}

function formatTime(ts) {
    if (!ts) return '';
    if (typeof ts === 'number') {
        // Xbongbong returns Unix timestamps in SECONDS (10 digits) not ms
        const ms = ts < 1e12 ? ts * 1000 : ts;
        return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    }
    return String(ts);
}
