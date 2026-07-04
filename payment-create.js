import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, getModuleFormConfig, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'payment-create',
    access: 'write',
    description: '新建回款记录',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'contract', type: 'string', required: true, positional: true, help: '关联合同ID（必填）' },
        { name: 'amount', type: 'float', required: true, help: '回款金额' },
        { name: 'date', type: 'string', help: '回款日期（如 2024-03-20，默认今天）' },
        { name: 'method', type: 'string', help: '回款方式（如：银行转账/现金/支票）' },
        { name: 'remark', type: 'string', help: '备注' },
    ],
    columns: ['id', 'contract', 'amount', 'status', 'message'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        if (!args.amount) throw new ArgumentError('回款金额不能为空');

        let formConfig = await getModuleFormConfig(page, commonParams, 'payment');
        if (!formConfig) {
            throw new CommandExecutionError('无法获取回款模块配置');
        }

        const today = new Date().toISOString().slice(0, 10);
        const dataList = {
            template: formConfig.formId,
            number_1: args.amount,
            date_1: args.date || today,
            text_1: args.method || null,
            textarea_1: args.remark || null,
            relateContractId: args.contract,
        };

        const body = {
            appId: formConfig.appId,
            menuId: formConfig.menuId,
            formId: formConfig.formId,
            businessType: formConfig.businessType,
            subBusinessType: formConfig.subBusinessType,
            dataList: dataList,
            relateDataId: args.contract,
        };

        const resp = await apiCall(page, '/form/data/add', body, commonParams);

        if (!resp.ok || !resp.data) {
            if (resp.status === 401) throw new AuthRequiredError(DOMAIN, 'Session已过期');
            throw new CommandExecutionError(`创建回款失败: ${resp.data?.msg || resp.error || 'HTTP ' + resp.status}`);
        }

        if (resp.data.code !== 1) {
            throw new CommandExecutionError(`创建回款失败: ${resp.data.msg || '未知错误'}`);
        }

        return [{
            id: String(resp.data.data?.dataId || resp.data.data?.id || 'unknown'),
            contract: args.contract,
            amount: String(args.amount),
            status: 'success',
            message: '回款记录创建成功',
        }];
    },
});
