import { cli, Strategy } from '@jackwener/opencli/registry';
import { AuthRequiredError, CommandExecutionError, ArgumentError } from '@jackwener/opencli/errors';
import { assertAuth, apiCall, getModuleFormConfig, DOMAIN } from './shared.js';

cli({
    site: 'xbongbong',
    name: 'product-create',
    access: 'write',
    description: '录入新产品到销帮帮CRM产品目录',
    domain: DOMAIN,
    strategy: Strategy.INTERCEPT,
    browser: true,
    siteSession: 'persistent',
    args: [
        { name: 'name', type: 'string', required: true, positional: true, help: '产品名称（必填）' },
        { name: 'price', type: 'float', help: '产品单价' },
        { name: 'unit', type: 'string', help: '计量单位（如：个、套、年）' },
        { name: 'category', type: 'string', help: '产品分类' },
        { name: 'description', type: 'string', help: '产品描述' },
    ],
    columns: ['id', 'name', 'status', 'message'],
    func: async (page, args) => {
        const commonParams = await assertAuth(page);
        if (!commonParams) throw new AuthRequiredError(DOMAIN, '请先在浏览器登录销帮帮CRM');

        if (!args.name || args.name.trim() === '') {
            throw new ArgumentError('产品名称不能为空');
        }

        // 获取产品模块的 formId/menuId
        let formConfig = await getModuleFormConfig(page, commonParams, 'product');
        if (!formConfig) {
            // fallback: 使用产品模块的通用配置
            formConfig = {
                formId: null, // 需要动态获取
                menuId: null,
                appId: null,
                businessType: 300,
                subBusinessType: 301,
            };
            throw new CommandExecutionError('无法获取产品模块配置，请确认销帮帮CRM中已配置产品模块');
        }

        // 构建产品 dataList
        const dataList = {
            template: formConfig.formId,
            text_1: args.name,                    // 产品名称
            number_1: args.price || null,         // 单价
            text_2: args.unit || null,            // 单位
            text_3: args.category || null,        // 分类
            textarea_1: args.description || null, // 描述
        };

        const body = {
            appId: formConfig.appId,
            menuId: formConfig.menuId,
            formId: formConfig.formId,
            businessType: formConfig.businessType,
            subBusinessType: formConfig.subBusinessType,
            dataList: dataList,
        };

        const resp = await apiCall(page, '/form/data/add', body, commonParams);

        if (!resp.ok || !resp.data) {
            if (resp.status === 401) throw new AuthRequiredError(DOMAIN, 'Session已过期');
            throw new CommandExecutionError(`创建产品失败: ${resp.data?.msg || resp.error || 'HTTP ' + resp.status}`);
        }

        if (resp.data.code !== 1) {
            throw new CommandExecutionError(`创建产品失败: ${resp.data.msg || '未知错误'}`);
        }

        const newId = resp.data.data?.dataId || resp.data.data?.id || 'unknown';

        return [{
            id: String(newId),
            name: args.name,
            status: 'success',
            message: '产品创建成功',
        }];
    },
});
