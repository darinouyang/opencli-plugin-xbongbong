import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, getModuleFormConfig, MODULE_CONFIG, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'followup-create',
    access: 'write',
    description: '为客户新增跟进记录',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'customer', type: 'string', required: true, positional: true, help: '客户ID (dataId)' },
        { name: 'content', type: 'string', required: true, help: '跟进内容' },
        { name: 'type', type: 'string', default: '电话', help: '跟进方式：电话/拜访/微信/QQ/邮件/短信/其他' },
        { name: 'next_time', type: 'string', help: '下次跟进时间（如 2024-03-20）' },
    ],
    columns: ['id', 'customer', 'type', 'status', 'message'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        if (!args.content || args.content.trim() === '') {
            throw new ArgumentError('跟进内容不能为空');
        }

        // 获取跟进记录模块配置
        let formConfig = await getModuleFormConfig(page, commonParams, 'followup');

        const body = {
            businessType: MODULE_CONFIG.followup?.businessType || 100,
            subBusinessType: MODULE_CONFIG.followup?.subBusinessType || 105,
            relateDataId: args.customer, // 关联客户ID
            content: args.content,
            followType: args.type || '电话',
        };

        if (formConfig) {
            body.formId = formConfig.formId;
            body.menuId = formConfig.menuId;
            body.appId = formConfig.appId;
        }

        if (args.next_time) {
            body.nextFollowTime = args.next_time;
        }

        // 跟进记录可能用专用接口或通用 /form/data/add
        // 先尝试专用接口
        let resp = await apiCall(page, '/followup/add', body, commonParams);

        // 如果专用接口不存在（404），fallback 到通用接口
        if (!resp.ok && (resp.status === 404 || resp.status === 0)) {
            const dataList = {
                textarea_1: args.content,
                text_1: args.type || '电话',
                date_1: args.next_time || null,
                relateDataId: args.customer,
            };
            if (formConfig) dataList.template = formConfig.formId;

            resp = await apiCall(page, '/form/data/add', {
                formId: formConfig?.formId,
                menuId: formConfig?.menuId,
                appId: formConfig?.appId,
                businessType: body.businessType,
                subBusinessType: body.subBusinessType,
                dataList: dataList,
                relateDataId: args.customer,
            }, commonParams);
        }

        if (!resp.ok || !resp.data) {
            if (resp.status === 401) throw new AuthRequiredError(DOMAIN, 'Session已过期');
            throw new CommandExecutionError(`创建跟进记录失败: ${resp.data?.msg || resp.error || 'HTTP ' + resp.status}`);
        }

        if (resp.data.code !== 1) {
            throw new CommandExecutionError(`创建跟进记录失败: ${resp.data.msg || '未知错误'}`);
        }

        const newId = resp.data.data?.dataId || resp.data.data?.id || 'unknown';

        return [{
            id: String(newId),
            customer: args.customer,
            type: args.type || '电话',
            status: 'success',
            message: '跟进记录创建成功',
        }];
    },
});
