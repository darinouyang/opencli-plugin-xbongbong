import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, getModuleFormConfig, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'customer-update',
    access: 'write',
    description: '编辑销帮帮CRM客户信息',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'id', type: 'string', required: true, positional: true, help: '客户ID (dataId)' },
        { name: 'name', type: 'string', help: '修改客户名称' },
        { name: 'phone', type: 'string', help: '修改客户电话' },
        { name: 'address', type: 'string', help: '修改客户地址' },
        { name: 'source', type: 'string', help: '修改客户来源' },
        { name: 'remark', type: 'string', help: '修改备注' },
    ],
    columns: ['id', 'name', 'status', 'message'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        // 至少需要提供一个修改字段
        if (!args.name && !args.phone && !args.address && !args.source && !args.remark) {
            throw new ArgumentError('至少需要提供一个修改字段（--name, --phone, --address, --source, --remark）');
        }

        // 获取 formConfig
        let formConfig = await getModuleFormConfig(page, commonParams, 'customer');
        if (!formConfig) {
            formConfig = {
                formId: 12090314,
                menuId: 13466040,
                appId: 1239836,
                businessType: 100,
                subBusinessType: 101,
            };
        }

        // 构建更新的 dataList（只传需要修改的字段）
        const dataList = { template: formConfig.formId };

        if (args.name) dataList.text_1 = args.name;
        if (args.address) dataList.address_1 = args.address;
        if (args.source) dataList.text_4 = args.source;
        if (args.remark) dataList.text_18 = args.remark;
        if (args.phone) {
            dataList.subForm_1 = [{
                text_1: { checked: true, isOther: 0, isVisible: 1, text: '手机', value: '2' },
                text_2: args.phone,
            }];
        }

        const body = {
            dataId: args.id,
            appId: formConfig.appId,
            menuId: formConfig.menuId,
            formId: formConfig.formId,
            businessType: formConfig.businessType,
            subBusinessType: formConfig.subBusinessType,
            dataList: dataList,
        };

        const resp = await apiCall(page, '/form/data/update', body, commonParams);

        if (!resp.ok || !resp.data) {
            if (resp.status === 401) throw new AuthRequiredError(DOMAIN, 'Session已过期');
            throw new CommandExecutionError(`编辑客户失败: ${resp.data?.msg || resp.error || 'HTTP ' + resp.status}`);
        }

        if (resp.data.code !== 1) {
            throw new CommandExecutionError(`编辑客户失败: ${resp.data.msg || '未知错误'}`);
        }

        return [{
            id: args.id,
            name: args.name || '(未修改)',
            status: 'success',
            message: '客户信息更新成功',
        }];
    },
});
