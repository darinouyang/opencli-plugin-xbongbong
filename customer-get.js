import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, EmptyResultError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, MODULE_CONFIG, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'customer-get',
    access: 'read',
    description: '获取销帮帮CRM单个客户详情',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'id', type: 'string', required: true, positional: true, help: '客户ID (dataId)' },
    ],
    columns: ['field', 'value'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        const config = MODULE_CONFIG.customer;
        const resp = await apiCall(page, '/form/data/detail', {
            dataId: args.id,
            businessType: config.businessType,
            subBusinessType: config.subBusinessType,
        }, commonParams);

        if (!resp.ok || !resp.data || resp.data.code !== 1) {
            if (resp.data?.msg?.includes('登录') || resp.data?.msg?.includes('auth')) {
                throw new AuthRequiredError(DOMAIN, 'Session已过期');
            }
            throw new EmptyResultError('customer detail', `未找到ID为${args.id}的客户`);
        }

        const data = resp.data.data;
        if (!data) throw new EmptyResultError('customer detail', `客户${args.id}不存在`);

        const rows = [];
        const fieldMap = {
            dataId: 'ID',
            text_1: '客户名称',
            ownerName: '负责人',
            text_4: '客户来源',
            address_1: '地址',
            text_18: '备注',
            statusName: '状态',
            createTime: '创建时间',
            updateTime: '更新时间',
        };

        for (const [key, label] of Object.entries(fieldMap)) {
            const val = data[key] || data.dataList?.[key];
            if (val !== null && val !== undefined && val !== '') {
                let display = val;
                if (key.endsWith('Time') && typeof val === 'number') {
                    display = new Date(val).toISOString().slice(0, 16).replace('T', ' ');
                }
                rows.push({ field: label, value: String(display) });
            }
        }

        const phones = data.subForm_1 || data.dataList?.subForm_1;
        if (Array.isArray(phones) && phones.length > 0) {
            const phoneStr = phones.map(p => p.text_2).filter(Boolean).join(', ');
            if (phoneStr) rows.push({ field: '电话', value: phoneStr });
        }

        if (rows.length === 0) {
            throw new EmptyResultError('customer detail', `客户${args.id}数据为空`);
        }

        return rows;
    },
});
