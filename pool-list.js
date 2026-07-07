import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { assertAuth, fetchModuleList, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'pool-list',
    access: 'read',
    description: '查询客户公海池',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'keyword', type: 'string', help: '搜索关键词' },
        { name: 'idle_days', type: 'int', help: '闲置天数筛选（超过N天未跟进）' },
        { name: 'limit', type: 'int', default: 20, help: '返回条数' },
        { name: 'page', type: 'int', default: 1, help: '页码' },
    ],
    columns: ['id', 'name', 'phone', 'source', 'idle_days', 'last_follow', 'return_reason'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        const resp = await fetchModuleList(page, 'pool', commonParams, { timeoutSec: 15 });

        if (!resp || resp.code !== 1) {
            throw new AuthRequiredError(DOMAIN, `请求失败: ${resp?.msg || 'unknown'}`);
        }

        const list = resp.result?.paasFormDataESList || resp.result?.list || resp.data?.list || resp.data?.dataList || [];
        if (list.length === 0) {
            throw new EmptyResultError('pool list', '公海池暂无客户');
        }

        const now = Date.now();
        let filtered = list;
        if (args.keyword) {
            const kw = args.keyword.toLowerCase();
            filtered = list.filter(item => {
                const d = item.data || {};
                const name = (d.text_1 || d.customerName || '').toLowerCase();
                return name.includes(kw);
            });
        }

        const results = filtered.map(item => {
            const d = item.data || {};
            const lastFollow = item.updateTime || item.addTime;
            const lastMs = typeof lastFollow === 'number' ? (lastFollow < 1e12 ? lastFollow * 1000 : lastFollow) : 0;
            const idleDays = lastMs ? Math.floor((now - lastMs) / 86400000) : '';

            if (args.idle_days && idleDays && idleDays < args.idle_days) return null;

            return {
                id: item.dataId || item.id || '',
                name: d.text_1 || d.customerName || '',
                phone: extractPhone(d),
                source: d.text_4 || d.source || '',
                idle_days: idleDays !== '' ? String(idleDays) : '',
                last_follow: formatTime(lastFollow),
                return_reason: d.returnReason || '',
            };
        }).filter(Boolean).slice(0, args.limit || 20);

        if (results.length === 0) {
            throw new EmptyResultError('pool list', args.keyword ? `未找到匹配"${args.keyword}"的公海客户` : '公海池暂无客户');
        }
        return results;
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
        const ms = ts < 1e12 ? ts * 1000 : ts;
        return new Date(ms).toISOString().slice(0, 10);
    }
    return String(ts);
}
