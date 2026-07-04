import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, getModuleFormConfig, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'quotation-create',
    access: 'write',
    description: '新建报价单',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'name', type: 'string', required: true, positional: true, help: '报价单名称（必填）' },
        { name: 'customer', type: 'string', required: true, help: '关联客户ID' },
        { name: 'amount', type: 'float', help: '报价金额' },
        { name: 'valid_until', type: 'string', help: '有效期截止日期（如 2024-04-20）' },
        { name: 'remark', type: 'string', help: '备注' },
    ],
    columns: ['id', 'name', 'status', 'message'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        if (!args.name?.trim()) throw new ArgumentError('报价单名称不能为空');

        let formConfig = await getModuleFormConfig(page, commonParams, 'quotation');
        if (!formConfig) {
            throw new CommandExecutionError('无法获取报价单模块配置');
        }

        const dataList = {
            template: formConfig.formId,
            text_1: args.name,
            number_1: args.amount || null,
            date_1: args.valid_until || null,
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
            throw new CommandExecutionError(`创建报价单失败: ${resp.data?.msg || resp.error || 'HTTP ' + resp.status}`);
        }

        if (resp.data.code !== 1) {
            throw new CommandExecutionError(`创建报价单失败: ${resp.data.msg || '未知错误'}`);
        }

        return [{
            id: String(resp.data.data?.dataId || resp.data.data?.id || 'unknown'),
            name: args.name,
            status: 'success',
            message: '报价单创建成功',
        }];
    },
});
