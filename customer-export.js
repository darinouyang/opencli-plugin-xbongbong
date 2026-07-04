import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, MODULE_CONFIG, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'customer-export',
    access: 'read',
    description: '导出客户数据',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'filter', type: 'string', help: '筛选条件' },
        { name: 'limit', type: 'int', default: 100, help: '导出条数上限' },
    ],
    columns: ['id', 'name', 'phone', 'owner', 'source', 'status', 'created_at', 'address'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        const config = MODULE_CONFIG.customer;

        // 通过列表接口拉取全量数据（分页累积）作为"导出"
        const pageSize = 50;
        const maxPages = Math.ceil((args.limit || 100) / pageSize);
        const allRows = [];

        for (let p = 1; p <= maxPages; p++) {
            const body = {
                businessType: config.businessType,
                subBusinessType: config.subBusinessType,
                pageSize: pageSize,
                currentPage: p,
                queryParam: {},
            };

            if (args.filter) body.queryParam.searchContent = args.filter;

            const resp = await apiCall(page, config.listPath, body, commonParams);

            if (!resp.ok || !resp.data || resp.data.code !== 1) {
                if (resp.status === 401) throw new AuthRequiredError(DOMAIN, 'Session已过期');
                break;
            }

            const list = resp.data.data?.list || resp.data.data?.dataList || [];
            if (list.length === 0) break;

            for (const item of list) {
                allRows.push({
                    id: item.dataId || item.id || '',
                    name: item.text_1 || item.customerName || '',
                    phone: extractPhone(item),
                    owner: item.ownerName || '',
                    source: item.text_4 || item.source || '',
                    status: item.statusName || item.status || '',
                    created_at: formatTime(item.createTime),
                    address: item.address_1 || '',
                });

                if (allRows.length >= (args.limit || 100)) break;
            }

            if (allRows.length >= (args.limit || 100)) break;
            if (list.length < pageSize) break; // 已到最后一页
        }

        if (allRows.length === 0) {
            throw new CommandExecutionError('没有可导出的客户数据');
        }

        return allRows;
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
    if (typeof ts === 'number') return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
    return String(ts);
}
