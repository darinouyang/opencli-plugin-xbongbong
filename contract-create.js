import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, getModuleFormConfig, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'contract-create',
    access: 'write',
    description: '新建合同订单',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'name', type: 'string', required: true, positional: true, help: '合同名称（必填）' },
        { name: 'customer', type: 'string', required: true, help: '关联客户ID' },
        { name: 'amount', type: 'float', help: '合同金额' },
        { name: 'start_date', type: 'string', help: '开始日期（如 2024-03-20）' },
        { name: 'end_date', type: 'string', help: '结束日期' },
        { name: 'remark', type: 'string', help: '备注' },
    ],
    columns: ['id', 'name', 'status', 'message'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        if (!args.name?.trim()) throw new ArgumentError('合同名称不能为空');

        let formConfig = await getModuleFormConfig(page, commonParams, 'contract');
        if (!formConfig) {
            throw new CommandExecutionError('无法获取合同模块配置，请确认销帮帮CRM中已配置合同模块');
        }

        const dataList = {
            template: formConfig.formId,
            text_1: args.name,
            number_1: args.amount || null,
            date_1: args.start_date || null,
            date_2: args.end_date || null,
            textarea_1: args.remark || null,
            relateCustomerId: args.customer,
        };

        const body = {
            appId: formConfig.appId,
            menuId: formConfig.menuId,
            formId: formConfig.formId,
            businessType: formConfig.businessType,
            subBusinessType: formConfig.subBusinessType,
            dataList: dataList,
            relateDataId: args.customer,
        };

        const resp = await apiCall(page, '/form/data/add', body, commonParams);

        if (!resp.ok || !resp.data) {
            if (resp.status === 401) throw new AuthRequiredError(DOMAIN, 'Session已过期');
            throw new CommandExecutionError(`创建合同失败: ${resp.data?.msg || resp.error || 'HTTP ' + resp.status}`);
        }

        if (resp.data.code !== 1) {
            throw new CommandExecutionError(`创建合同失败: ${resp.data.msg || '未知错误'}`);
        }

        return [{
            id: String(resp.data.data?.dataId || resp.data.data?.id || 'unknown'),
            name: args.name,
            status: 'success',
            message: '合同创建成功',
        }];
    },
});
