import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';
import { assertAuth, callSpaFormAdd, getModuleFormConfig, checkDuplicate, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'customer-create',
    access: 'write',
    description: '录入新客户到销帮帮CRM',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'name', type: 'string', required: true, positional: true, help: '客户名称（必填）' },
        { name: 'phone', type: 'string', help: '客户电话' },
        { name: 'address', type: 'string', help: '客户地址' },
        { name: 'source', type: 'string', help: '客户来源' },
        { name: 'remark', type: 'string', help: '备注' },
        { name: 'skip_dup_check', type: 'bool', default: false, help: '跳过查重检查' },
    ],
    columns: ['id', 'name', 'status', 'message'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        if (!args.name || args.name.trim() === '') {
            throw new ArgumentError('客户名称不能为空');
        }

        // 1. 获取客户模块的 formId/menuId
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

        // 2. 查重检查
        if (!args.skip_dup_check) {
            const noDup = await checkDuplicate(page, commonParams, formConfig, 'text_1', args.name);
            if (!noDup) {
                throw new CommandExecutionError(`客户名称"${args.name}"已存在，如需强制创建请使用 --skip_dup_check`);
            }
        }

        // 3. 构建 dataList
        const dataList = {
            template: formConfig.formId,
            text_1: args.name,
            subForm_1: [],
            subForm_2: [],
            address_1: args.address || null,
            text_4: args.source || null,
            text_12: null,
            text_18: args.remark || null,
            text_19: null,
            other_1: null,
        };

        if (args.phone) {
            dataList.subForm_1 = [{
                text_1: { checked: true, isOther: 0, isVisible: 1, text: '手机', value: '2' },
                text_2: args.phone,
            }];
        }

        // 4. 调用创建API（通过SPA内部HTTP客户端）
        const body = {
            appId: formConfig.appId,
            menuId: formConfig.menuId,
            formId: formConfig.formId,
            saasMark: 2,
            distributorMark: 0,
            businessType: formConfig.businessType,
            subBusinessType: formConfig.subBusinessType,
            groupNumber: '',
            isBatch: 0,
            dataList: dataList,
        };

        const resp = await callSpaFormAdd(page, body);

        if (!resp || resp.error) {
            throw new CommandExecutionError(`创建客户失败: ${resp?.message || 'unknown error'}`);
        }

        if (resp.code !== 1) {
            throw new CommandExecutionError(`创建客户失败: ${resp.msg || '未知错误'}`);
        }

        const result = resp.result || resp;
        const newId = result.dataId || result.formDataId || result.id || 'unknown';

        return [{
            id: String(newId),
            name: args.name,
            status: 'success',
            message: '客户创建成功',
        }];
    },
});
