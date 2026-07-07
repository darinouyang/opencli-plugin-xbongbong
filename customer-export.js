import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { assertAuth, fetchModuleList, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'customer-export',
    access: 'read',
    description: '导出客户数据（单次拉取，通过 --limit 控制条数，最大受SPA页面size限制）',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'filter', type: 'string', help: '筛选关键词（客户名称）' },
        { name: 'limit', type: 'int', default: 100, help: '导出条数上限，默认100' },
    ],
    columns: ['id', 'name', 'phone', 'owner', 'source', 'status', 'created_at', 'address'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        const resp = await fetchModuleList(page, 'customer', commonParams, { timeoutSec: 20 });

        if (!resp || resp.code !== 1) {
            throw new CommandExecutionError(`导出失败: ${resp?.msg || 'unknown'}`);
        }

        const list = resp.result?.paasFormDataESList || resp.result?.list || [];
        if (list.length === 0) {
            throw new CommandExecutionError('没有可导出的客户数据');
        }

        let filtered = list;
        if (args.filter) {
            const kw = args.filter.toLowerCase();
            filtered = list.filter(item => {
                const d = item.data || {};
                const name = (d.text_1 || d.customerName || '').toLowerCase();
                return name.includes(kw);
            });
        }

        const limited = filtered.slice(0, args.limit || 100);

        return limited.map(item => {
            const d = item.data || {};
            const owner = typeof item.ownerId === 'string' ? item.ownerId
                : (Array.isArray(item.ownerId) && item.ownerId.length > 0 ? item.ownerId[0].name : (d.ownerName || ''));
            return {
                id: item.dataId || item.id || '',
                name: d.text_1 || d.customerName || '',
                phone: extractPhone(d),
                owner: owner,
                source: d.text_4 || d.source || '',
                status: d.statusName || d.status || '',
                created_at: formatTime(item.addTime || item.createTime),
                address: d.address_1 || '',
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
        const ms = ts < 1e12 ? ts * 1000 : ts;
        return new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
    }
    return String(ts);
}
