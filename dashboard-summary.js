import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'dashboard-summary',
    access: 'read',
    description: '获取销帮帮CRM销售看板摘要数据',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'period', type: 'string', default: '本月', help: '统计周期：本日/本周/本月/本季/本年' },
    ],
    columns: ['metric', 'value', 'unit'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        // 计算时间范围
        const now = new Date();
        let startDate, endDate;
        const period = args.period || '本月';

        if (period === '本日') {
            startDate = endDate = now.toISOString().slice(0, 10);
        } else if (period === '本周') {
            const dayOfWeek = now.getDay() || 7;
            const monday = new Date(now);
            monday.setDate(now.getDate() - dayOfWeek + 1);
            startDate = monday.toISOString().slice(0, 10);
            endDate = now.toISOString().slice(0, 10);
        } else if (period === '本月') {
            startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
            endDate = now.toISOString().slice(0, 10);
        } else if (period === '本季') {
            const quarter = Math.floor(now.getMonth() / 3);
            startDate = `${now.getFullYear()}-${String(quarter * 3 + 1).padStart(2, '0')}-01`;
            endDate = now.toISOString().slice(0, 10);
        } else {
            startDate = `${now.getFullYear()}-01-01`;
            endDate = now.toISOString().slice(0, 10);
        }

        // 尝试获取看板数据（简报接口）
        const resp = await apiCall(page, '/report/briefing', {
            startDate: startDate,
            endDate: endDate,
            dateType: period,
        }, commonParams);

        if (!resp.ok || !resp.data) {
            // fallback：通过各列表接口的 totalCount 聚合
            const metrics = await aggregateFromLists(page, commonParams, startDate, endDate);
            if (metrics.length === 0) {
                throw new EmptyResultError('dashboard', '暂无看板数据');
            }
            return metrics;
        }

        if (resp.data.code !== 1) {
            // 尝试 fallback
            const metrics = await aggregateFromLists(page, commonParams, startDate, endDate);
            if (metrics.length === 0) {
                throw new EmptyResultError('dashboard', '暂无看板数据');
            }
            return metrics;
        }

        // 解析看板返回数据
        const data = resp.data.data;
        const rows = [];

        if (data.newCustomerCount !== undefined) rows.push({ metric: '新增客户', value: String(data.newCustomerCount), unit: '个' });
        if (data.followCount !== undefined) rows.push({ metric: '跟进次数', value: String(data.followCount), unit: '次' });
        if (data.newOpportunityCount !== undefined) rows.push({ metric: '新增商机', value: String(data.newOpportunityCount), unit: '个' });
        if (data.contractAmount !== undefined) rows.push({ metric: '合同金额', value: String(data.contractAmount), unit: '元' });
        if (data.paymentAmount !== undefined) rows.push({ metric: '回款金额', value: String(data.paymentAmount), unit: '元' });
        if (data.contractCount !== undefined) rows.push({ metric: '签约合同', value: String(data.contractCount), unit: '份' });
        if (data.visitCount !== undefined) rows.push({ metric: '拜访次数', value: String(data.visitCount), unit: '次' });

        // 如果结构化字段为空，尝试遍历对象
        if (rows.length === 0 && typeof data === 'object') {
            for (const [k, v] of Object.entries(data)) {
                if (v !== null && v !== undefined && typeof v !== 'object') {
                    rows.push({ metric: k, value: String(v), unit: '' });
                }
            }
        }

        if (rows.length === 0) {
            throw new EmptyResultError('dashboard', '看板数据为空');
        }

        return rows;
    },
});

/**
 * Fallback: 从各列表接口获取 totalCount 作为简单看板
 */
async function aggregateFromLists(page, commonParams, startDate, endDate) {
    const modules = [
        { name: '客户总数', path: '/list/customer', bt: 100, sbt: 101 },
        { name: '合同总数', path: '/list/contract', bt: 200, sbt: 203 },
        { name: '产品总数', path: '/list/product', bt: 300, sbt: 301 },
        { name: '回款单总数', path: '/list/paymentSheet', bt: 400, sbt: 401 },
    ];

    const rows = [];
    for (const mod of modules) {
        const resp = await apiCall(page, mod.path, {
            businessType: mod.bt,
            subBusinessType: mod.sbt,
            pageSize: 1,
            currentPage: 1,
            queryParam: {},
        }, commonParams);

        if (resp.ok && resp.data && resp.data.code === 1) {
            const total = resp.data.data?.totalCount || resp.data.data?.total || 0;
            rows.push({ metric: mod.name, value: String(total), unit: '条' });
        }
    }
    return rows;
}
