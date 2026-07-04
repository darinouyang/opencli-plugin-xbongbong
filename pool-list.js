import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, MODULE_CONFIG, DOMAIN } from './shared.js';

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

        const config = MODULE_CONFIG.customer;
        const body = {
            businessType: config.businessType,
            subBusinessType: config.subBusinessType,
            pageSize: args.limit || 20,
            currentPage: args.page || 1,
            queryParam: {},
            poolFlag: true, // 标识查公海池
        };

        if (args.keyword) body.queryParam.searchContent = args.keyword;

        // 公海池可能是独立接口或带 poolFlag 的客户列表
        let resp = await apiCall(page, '/customer/pool/list', body, commonParams);

        // fallback 到通用列表 + poolFlag
        if (!resp.ok && resp.status === 404) {
            resp = await apiCall(page, config.listPath, body, commonParams);
        }

        if (!resp.ok || !resp.data || resp.data.code !== 1) {
            if (resp.status === 401) throw new AuthRequiredError(DOMAIN, 'Session已过期');
            throw new AuthRequiredError(DOMAIN, `请求失败: ${resp.data?.msg || resp.error || 'unknown'}`);
        }

        const list = resp.data.data?.list || resp.data.data?.dataList || [];
        if (list.length === 0) {
            throw new EmptyResultError('pool list', '公海池暂无客户');
        }

        const now = Date.now();
        return list.map(item => {
            const lastFollow = item.lastFollowTime || item.updateTime;
            const idleDays = lastFollow ? Math.floor((now - lastFollow) / 86400000) : '';

            // 如果设置了闲置天数筛选，客户端过滤
            if (args.idle_days && idleDays && idleDays < args.idle_days) {
                return null;
            }

            return {
                id: item.dataId || item.id || '',
                name: item.text_1 || item.customerName || item.name || '',
                phone: item.phone || item.mobile || '',
                source: item.text_4 || item.source || '',
                idle_days: idleDays ? String(idleDays) : '',
                last_follow: formatTime(lastFollow),
                return_reason: item.returnReason || item.reason || '',
            };
        }).filter(Boolean);
    },
});

function formatTime(ts) {
    if (!ts) return '';
    if (typeof ts === 'number') return new Date(ts).toISOString().slice(0, 10);
    return String(ts);
}
